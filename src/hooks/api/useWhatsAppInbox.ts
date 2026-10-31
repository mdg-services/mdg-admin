import {
  type InfiniteData,
  keepPreviousData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as React from 'react';

import {
  describeSendError,
  indianMobile,
  type PendingMessage,
  type StageFilter,
} from '@/features/whatsapp/format';
import { addPending, getPending, removePending, updatePending } from '@/features/whatsapp/pendingStore';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type {
  WhatsAppChatDetail,
  WhatsAppChatFilter,
  WhatsAppChatLines,
  WhatsAppChatList,
  WhatsAppChatMessage,
  WhatsAppChatPatch,
  WhatsAppInboxConfig,
  WhatsAppInboxSummary,
  WhatsAppLine,
  WhatsAppMessagePage,
  WhatsAppNewChatInput,
  WhatsAppQuickReply,
  WhatsAppQuickReplyInput,
  WhatsAppSendResult,
  WhatsAppVideoSendInput,
} from '@dk/shared';

/**
 * The WhatsApp inbox's requests.
 *
 * Every number is its own inbox (`WhatsAppLine`), and every request that is
 * about one chat, one list or one send names it: the keys carry the line so the
 * two inboxes never share a cached chat, and the server refuses a request
 * that does not say which number it is for.
 *
 * Every key hangs off `['whatsapp']`, so one call can refresh all of it. The
 * lists and the open chat are kept fresh three ways, as the alert list is:
 * the server says `whatsapp:changed` over the socket the moment anything
 * moves (`useWhatsAppLive`, mounted once in the shell); coming back to a
 * backgrounded tab asks again, because the app turns refetch-on-focus off
 * globally; and a one-minute poll covers a socket that dropped.
 */
const BASE = '/admin/whatsapp';
const enc = encodeURIComponent;

export const whatsAppKeys = {
  all: ['whatsapp'] as const,
  config: ['whatsapp', 'config'] as const,
  summary: ['whatsapp', 'summary'] as const,
  /** Every chat list, whatever filter it was asked with. */
  chats: ['whatsapp', 'chats'] as const,
  chatList: (p: ChatListParams) => ['whatsapp', 'chats', p] as const,
  /** Position 3 is the person in all three: `ofPerson` reads it. */
  chat: (line: WhatsAppLine, person: string) => ['whatsapp', 'chat', line, person] as const,
  messages: (line: WhatsAppLine, person: string) => ['whatsapp', 'messages', line, person] as const,
  /** Which inboxes a person has a chat in. */
  lines: (person: string) => ['whatsapp', 'lines', person] as const,
  quickReplies: ['whatsapp', 'quick-replies'] as const,
};

const POLL_MS = 60_000;
const CHAT_PAGE = 50;
const MESSAGE_PAGE = 60;

type MessageData = InfiniteData<WhatsAppMessagePage, string | undefined>;
type ChatListData = InfiniteData<WhatsAppChatList, string | undefined>;

/**
 * Every held copy of a person's chat or thread, in whichever inbox. A name, a
 * stage or a note is about the person and shows in both, and the server does not
 * say which number an event was about, so the person's chat is asked about in
 * both. Only the one on screen is fetched; the other is marked out of date.
 */
function ofPerson(kind: 'chat' | 'messages', person: string) {
  return {
    queryKey: ['whatsapp', kind] as const,
    predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[3] === person,
  };
}

/** Ask again for what is on screen about these people, and for the lists (both inboxes) and counts. */
export function refreshWhatsApp(qc: QueryClient, persons: readonly string[] = []): void {
  void qc.invalidateQueries({ queryKey: whatsAppKeys.chats });
  void qc.invalidateQueries({ queryKey: whatsAppKeys.summary });
  for (const person of persons) {
    void qc.invalidateQueries(ofPerson('chat', person));
    void qc.invalidateQueries(ofPerson('messages', person));
    void qc.invalidateQueries({ queryKey: whatsAppKeys.lines(person) });
  }
}

/**
 * What `whatsapp:changed` does, once per throttle window rather than once per
 * event: the lists and the counts are asked for again, and the chat that is on
 * screen — only if it is one of the people the events were about — is asked for
 * again too.
 *
 * Every other person's chat that is held in memory (in either inbox) is only marked out of date,
 * without a request. Nothing is looking at it, and the next time it is opened
 * it is fetched, which is also what lets an opened chat know that its copy of
 * the thread is old (`openDataSettled`). A campaign sends a status for every
 * recipient: this keeps that from being a request per recipient.
 */
export function refreshWhatsAppLive(qc: QueryClient, changed: ReadonlySet<string>, open: string | null): void {
  void qc.invalidateQueries({ queryKey: whatsAppKeys.chats });
  void qc.invalidateQueries({ queryKey: whatsAppKeys.summary });
  if (open && changed.has(open)) {
    void qc.invalidateQueries(ofPerson('chat', open));
    void qc.invalidateQueries(ofPerson('messages', open));
  }
  if (changed.size === 0) return;
  void qc.invalidateQueries({
    refetchType: 'none',
    predicate: (query) => {
      const [root, kind, , who] = query.queryKey;
      if (root !== 'whatsapp' || (kind !== 'chat' && kind !== 'messages')) return false;
      return typeof who === 'string' && who !== open && changed.has(who);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Reading
// ─────────────────────────────────────────────────────────────────────────

/** Whether sending works and how a message will go: nothing here changes within a visit. */
export function useWhatsAppConfig() {
  return useQuery({
    queryKey: whatsAppKeys.config,
    queryFn: ({ signal }) => api.get<WhatsAppInboxConfig>(`${BASE}/config`, undefined, signal),
    staleTime: 5 * 60_000,
  });
}

/**
 * What the nav badge and the page title carry. Every signed-in admin asks for
 * it (the inbox is every admin's since 22 Oct 2026); nobody signed out does.
 */
export function useWhatsAppSummary() {
  const signedIn = useAuthStore((s) => !!s.token);
  return useQuery({
    queryKey: whatsAppKeys.summary,
    queryFn: ({ signal }) => api.get<WhatsAppInboxSummary>(`${BASE}/summary`, undefined, signal),
    enabled: signedIn,
    staleTime: 15_000,
    refetchInterval: POLL_MS,
  });
}

/** The nav badge: chats with something nobody has read. Zero while the count is loading. */
export function useWhatsAppUnreadChats(): number {
  return useWhatsAppSummary().data?.unreadChats ?? 0;
}

export interface ChatListParams {
  /** The inbox: a list is always one number's. */
  line: WhatsAppLine;
  filter: WhatsAppChatFilter;
  stage: StageFilter | null;
  q: string;
}

/**
 * The chat list, a page at a time. The previous list stays up while a new
 * filter or search loads, so typing in the search box does not blank the page
 * on every letter.
 */
export function useWhatsAppChats(params: ChatListParams) {
  return useInfiniteQuery({
    queryKey: whatsAppKeys.chatList(params),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.get<WhatsAppChatList>(
        `${BASE}/chats`,
        {
          line: params.line,
          filter: params.filter,
          stage: params.stage ?? undefined,
          q: params.q || undefined,
          limit: CHAT_PAGE,
          cursor: pageParam,
        },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchInterval: POLL_MS,
  });
}

/** One person in one inbox: how a message to them would go from that number, their note and every name we hold. */
export function useWhatsAppChat(line: WhatsAppLine | null, person: string | null) {
  return useQuery({
    queryKey: whatsAppKeys.chat(line ?? 'marketing', person ?? ''),
    queryFn: ({ signal }) =>
      api.get<WhatsAppChatDetail>(`${BASE}/chats/${enc(person ?? '')}`, { line: line ?? undefined }, signal),
    enabled: !!line && !!person,
    staleTime: 10_000,
    refetchInterval: POLL_MS,
    // A 404 is an answer — nobody by that id has a message — not a hiccup.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });
}

/**
 * Which inboxes this person has a chat in, newest first — for a link that
 * carries a person and no number. Empty (not an error) when they have no
 * message on either.
 */
export function useWhatsAppChatLines(person: string | null, enabled = true) {
  return useQuery({
    queryKey: whatsAppKeys.lines(person ?? ''),
    queryFn: ({ signal }) =>
      api.get<WhatsAppChatLines>(`${BASE}/chats/${enc(person ?? '')}/lines`, undefined, signal),
    enabled: enabled && !!person,
    staleTime: 10_000,
    retry: 1,
  });
}

/**
 * A chat's messages, newest page first, paged BACKWARDS: `before` is the id of
 * the oldest message the screen holds.
 *
 * When this refetches, TanStack asks for each page again but works out every
 * page's `before` from the page it has just received, not from the old one. So
 * a message that arrived since cannot leave a gap or a repeat between pages.
 */
export function useWhatsAppMessages(line: WhatsAppLine | null, person: string | null) {
  return useInfiniteQuery({
    queryKey: whatsAppKeys.messages(line ?? 'marketing', person ?? ''),
    enabled: !!line && !!person,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.get<WhatsAppMessagePage>(
        `${BASE}/chats/${enc(person ?? '')}/messages`,
        { line: line ?? undefined, before: pageParam, limit: MESSAGE_PAGE },
        signal,
      ),
    getNextPageParam: (last) => (last.hasMore ? last.items[0]?.id : undefined),
    staleTime: 10_000,
    refetchInterval: POLL_MS,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Writing: sending
// ─────────────────────────────────────────────────────────────────────────

/** Fills in a v4 UUID where `crypto.randomUUID` does not exist (plain http, an old WebView). */
function uuidFallback(): string {
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * One id per message. The server sends a given id once: a double tap, or a
 * request repeated after a dropped connection, cannot message a lead twice.
 */
export function newClientId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Not a secure context: fall through.
  }
  return uuidFallback();
}

export interface SendArgs {
  /** The inbox the message was typed in. It leaves from this number and no other. */
  line: WhatsAppLine;
  person: string;
  text: string;
  /** How the server said this would go. Decides what the waiting bubble looks like. */
  mode: 'text' | 'template';
  replyTo: PendingMessage['replyTo'];
  /** An address for the button, as typed; null without one. With one it goes in the link template. */
  link?: string | null;
  /** The admin was warned about the words' own greeting or sign-off and chose to keep them. */
  keepRepeats?: boolean;
}

/**
 * Put the server's copy of a message we sent into the open chat, newest page,
 * without a refetch. False when there is no thread in memory to put it in.
 */
function landSent(qc: QueryClient, line: WhatsAppLine, person: string, message: WhatsAppChatMessage): boolean {
  if (!qc.getQueryData(whatsAppKeys.messages(line, person))) return false;
  qc.setQueryData<MessageData>(whatsAppKeys.messages(line, person), (data) => {
    if (!data) return data;
    if (data.pages.some((p) => p.items.some((m) => m.id === message.id))) return data;
    const [head, ...older] = data.pages;
    if (!head) return data;
    return { ...data, pages: [{ ...head, items: [...head.items, message] }, ...older] };
  });
  return true;
}

async function deliver(qc: QueryClient, p: PendingMessage): Promise<void> {
  try {
    const result = await api.post<WhatsAppSendResult>(`${BASE}/chats/${enc(p.person)}/messages`, {
      line: p.line,
      text: p.text,
      clientId: p.clientId,
      replyTo: p.mode === 'text' && !p.link ? (p.replyTo?.id ?? null) : null,
      ...(p.link ? { link: p.link } : {}),
      ...(p.keepRepeats ? { keepRepeats: true } : {}),
    });
    // The pending bubble is not removed here. The thread drops it the moment the
    // server's copy (same clientId) is in the list, so there is no frame in
    // which the bubble is gone and its replacement has not yet arrived.
    // With no thread in memory to put it in, ask for the thread instead, or the
    // waiting bubble would keep its clock until the chat was next opened.
    refreshWhatsApp(qc, landSent(qc, p.line, p.person, result.message) ? [] : [p.person]);
    void qc.invalidateQueries({ queryKey: whatsAppKeys.chat(p.line, p.person) });
  } catch (err) {
    const f = describeSendError(err);
    updatePending(p.line, p.person, p.clientId, {
      status: f.kind,
      error: f.text,
      code: f.code,
      networkLost: f.networkLost,
    });
    // A refusal often means the way a message goes has changed — the window
    // closed while it was being typed, or they said stop. Ask again, so the
    // box under the thread tells the truth.
    void qc.invalidateQueries({ queryKey: whatsAppKeys.chat(p.line, p.person) });
    // A message that may have gone — or that the server says did, with its row
    // not in the chat yet — is settled by the thread, not by this bubble: ask
    // for it, so the server's copy replaces the waiting one.
    if (f.kind === 'unknown') void qc.invalidateQueries({ queryKey: whatsAppKeys.messages(p.line, p.person) });
  }
}

export interface WhatsAppSender {
  /** Send now. The bubble appears at once with a clock. Returns the id of the message. */
  send: (args: SendArgs) => string;
  /**
   * Send a failed message again. A refusal gets a NEW id: the old one is spent
   * on a send that did not go. A send that got no answer at all keeps its id,
   * because the server sends an id once — if the first try did get through, this
   * returns it instead of sending a second.
   */
  retry: (pending: PendingMessage, mode: 'text' | 'template') => void;
  /** Throw away a failed message. */
  remove: (pending: PendingMessage) => void;
}

/**
 * Sending, with the bubble up before the server has said anything.
 *
 * This is not a `useMutation`: a send has to carry on — and its bubble has to
 * keep its clock or its red mark — while the admin looks at another chat, and a
 * component's mutation state is gone by then. The waiting messages live in
 * `pendingStore`, and the thread draws them from there.
 */
export function useSendWhatsApp(): WhatsAppSender {
  const qc = useQueryClient();
  return React.useMemo<WhatsAppSender>(() => {
    const start = (args: SendArgs, clientId: string): string => {
      const pending: PendingMessage = {
        clientId,
        line: args.line,
        person: args.person,
        text: args.text,
        // A link always goes in its template, whatever the window says.
        mode: args.link ? 'template' : args.mode,
        link: args.link ?? null,
        ...(args.keepRepeats ? { keepRepeats: true } : {}),
        at: new Date().toISOString(),
        status: 'sending',
        error: null,
        code: null,
        networkLost: false,
        replyTo: args.replyTo,
      };
      addPending(pending);
      void deliver(qc, pending);
      return clientId;
    };
    return {
      send: (args) => start(args, newClientId()),
      retry: (pending, mode) => {
        const current = getPending(pending.line, pending.person, pending.clientId) ?? pending;
        if (current.status === 'sending') return;
        // A message with a link stays one: it goes in its template, window or not.
        const next = current.link ? 'template' : mode;
        if (current.networkLost) {
          updatePending(current.line, current.person, current.clientId, {
            status: 'sending',
            error: null,
            code: null,
            mode: next,
          });
          void deliver(qc, { ...current, status: 'sending', error: null, code: null, mode: next });
          return;
        }
        removePending(current.line, current.person, current.clientId);
        start(
          {
            line: current.line,
            person: current.person,
            text: current.text,
            mode: next,
            replyTo: current.replyTo,
            link: current.link,
            keepRepeats: current.keepRepeats === true,
          },
          newClientId(),
        );
      },
      remove: (pending) => removePending(pending.line, pending.person, pending.clientId),
    };
  }, [qc]);
}

/**
 * Start a chat with somebody who is not in the inbox yet. The dialog waits for the answer.
 *
 * The caller brings the `clientId` and keeps it across presses of Send: the
 * server sends an id once, so a second press after a reply that never arrived
 * gets the first one's answer instead of messaging the number twice. A fresh id
 * per press here would defeat that.
 *
 * When the outcome is unsure the server has put an "unsure" row in that chat,
 * so the chat is asked for again — the dialog then opens it.
 */
export function useNewWhatsAppChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WhatsAppNewChatInput) => api.post<WhatsAppSendResult>(`${BASE}/chats`, input),
    onSuccess: (result) => refreshWhatsApp(qc, [result.person]),
    onError: (err, input) => {
      if (describeSendError(err).kind !== 'unknown') return;
      const person = indianMobile(input.phone);
      if (person) refreshWhatsApp(qc, [person]);
    },
  });
}

/**
 * Send one of MDG's guide videos into a chat, as a WhatsApp video message. The
 * dialog waits for the answer. As for a new chat, the caller keeps the `clientId`
 * across presses of Send for the same video, and makes a new one only after a
 * final refusal (`describeSendError(...).networkLost === false`).
 *
 * The chat is asked for again whatever happened: a sent video is a new row, an
 * unsure one is a row too, and WhatsApp saying the 24 hours are up changes how
 * the next message goes.
 */
export function useSendWhatsAppVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ person, ...input }: WhatsAppVideoSendInput & { person: string }) =>
      api.post<WhatsAppSendResult>(`${BASE}/chats/${enc(person)}/videos`, input),
    onSettled: (_result, _err, input) => refreshWhatsApp(qc, [input.person]),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Writing: reading, and changing a chat
// ─────────────────────────────────────────────────────────────────────────

/**
 * Mark what a person has sent as read — up to `upTo`, the newest message that
 * was actually on the screen. The server also closes their alert and tells
 * WhatsApp, so they see blue ticks.
 *
 * The open chat's own messages are patched in place rather than refetched: the
 * next visit would otherwise draw the "unread" divider again from a copy of the
 * thread that still says they were unread.
 */
export function useMarkWhatsAppRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ line, person, upTo }: { line: WhatsAppLine; person: string; upTo: string }) =>
      api.post<{ marked: number }>(`${BASE}/chats/${enc(person)}/read`, { line, upTo }),
    onSuccess: (_data, { line, person, upTo }) => {
      const limit = Date.parse(upTo);
      const seenAt = new Date().toISOString();
      qc.setQueryData<MessageData>(whatsAppKeys.messages(line, person), (data) => {
        if (!data) return data;
        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((m) =>
              m.direction === 'in' && m.seenAt === null && Date.parse(m.at) <= limit ? { ...m, seenAt } : m,
            ),
          })),
        };
      });
      void qc.invalidateQueries({ queryKey: whatsAppKeys.chats });
      void qc.invalidateQueries({ queryKey: whatsAppKeys.summary });
      void qc.invalidateQueries({ queryKey: whatsAppKeys.chat(line, person) });
      void qc.invalidateQueries({ queryKey: whatsAppKeys.lines(person) });
      // The reply raised an alert; the server has closed it.
      void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
    },
  });
}

/**
 * Rename, set the stage, pin, mark unread, or write the private note. The reply
 * is the whole chat again. Pin and mark-unread are this inbox's alone; the name,
 * stage and note are the person's, so the same person's chat in the other inbox
 * is marked out of date too.
 */
export function usePatchWhatsAppChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ line, person, patch }: { line: WhatsAppLine; person: string; patch: WhatsAppChatPatch }) =>
      api.patch<WhatsAppChatDetail>(`${BASE}/chats/${enc(person)}?line=${enc(line)}`, patch),
    onSuccess: (detail, { line, person }) => {
      qc.setQueryData(whatsAppKeys.chat(line, person), detail);
      void qc.invalidateQueries(ofPerson('chat', person));
      void qc.invalidateQueries({ queryKey: whatsAppKeys.chats });
      void qc.invalidateQueries({ queryKey: whatsAppKeys.summary });
    },
  });
}

/** Finds a chat's row in whichever of THIS inbox's lists is already loaded, for a header that opens before its detail arrives. */
export function findCachedChat(qc: QueryClient, line: WhatsAppLine, person: string) {
  for (const [, data] of qc.getQueriesData<ChatListData>({ queryKey: whatsAppKeys.chats })) {
    for (const page of data?.pages ?? []) {
      const hit = page.items.find((c) => c.person === person && c.line === line);
      if (hit) return hit;
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// Quick replies
// ─────────────────────────────────────────────────────────────────────────

export function useWhatsAppQuickReplies() {
  return useQuery({
    queryKey: whatsAppKeys.quickReplies,
    queryFn: ({ signal }) => api.get<WhatsAppQuickReply[]>(`${BASE}/quick-replies`, undefined, signal),
    staleTime: 60_000,
  });
}

function useQuickReplyRefresh() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: whatsAppKeys.quickReplies });
}

export function useCreateQuickReply() {
  const refresh = useQuickReplyRefresh();
  return useMutation({
    mutationFn: (input: WhatsAppQuickReplyInput) => api.post<WhatsAppQuickReply>(`${BASE}/quick-replies`, input),
    onSuccess: refresh,
  });
}

export function useUpdateQuickReply() {
  const refresh = useQuickReplyRefresh();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<WhatsAppQuickReplyInput> & { id: string }) =>
      api.patch<WhatsAppQuickReply>(`${BASE}/quick-replies/${enc(id)}`, input),
    onSuccess: refresh,
  });
}

export function useDeleteQuickReply() {
  const refresh = useQuickReplyRefresh();
  return useMutation({
    mutationFn: (id: string) => api.del<{ deleted: true }>(`${BASE}/quick-replies/${enc(id)}`),
    onSuccess: refresh,
  });
}
