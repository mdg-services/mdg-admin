import { useQueryClient } from '@tanstack/react-query';
import { Lock, MessageCircleOff, TriangleAlert } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import {
  findCachedChat,
  useMarkWhatsAppRead,
  usePatchWhatsAppChat,
  useSendWhatsApp,
  useWhatsAppChat,
  useWhatsAppChatLines,
  useWhatsAppMessages,
} from '@/hooks/api/useWhatsAppInbox';
import { usePublishBottomBar } from '@/hooks/usePublishBottomBar';
import { ApiError } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { useAuthStore } from '@/store/auth';
import type {
  WhatsAppChatMessage,
  WhatsAppInboxConfig,
  WhatsAppLine,
  WhatsAppStage,
} from '@dk/shared';

import { RenameDialog, StageDialog } from './ChatDialogs';
import { ChatHeader } from './ChatHeader';
import {
  chatTitle,
  detailIsOnLine,
  effectiveMode,
  elsewhereNotice,
  errorWords,
  flattenMessages,
  lineName,
  lineNameAndJob,
  mergeThread,
  msUntilWindowCloses,
  openDataSettled,
  OUT_OF_DATE_WORDS,
  type PendingMessage,
  savedNameOf,
  serverSendsFrom,
  typedTextOf,
} from './format';
import { LineIcon } from './LineMark';
import { MessageThread } from './MessageThread';
import { isRetried, markRetried, removePending, usePending, useRetried } from './pendingStore';
import { ReplyComposer } from './ReplyComposer';

/** The clock the window countdown and the day pills read; a minute is as fine as they are. */
const TICK_MS = 60_000;

export interface ChatPaneProps {
  /** The inbox this chat is in: the number a message typed here leaves from. */
  line: WhatsAppLine;
  person: string;
  config: WhatsAppInboxConfig | undefined;
  configFailed: boolean;
  onRetryConfig: () => void;
  /** Leave the chat: back to the list below lg, an empty pane at lg. */
  onClose: () => void;
  /** Open this same person's chat on the other number. */
  onOpenOnLine: (line: WhatsAppLine) => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  panelIsColumn: boolean;
}

/** Slim bar where the box would be, when it cannot be: loading, switched off, not allowed, or not loaded. */
function ComposerNotice({
  icon,
  children,
  action,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm text-[var(--wa-meta)]">
      <span className="shrink-0" aria-hidden>
        {icon}
      </span>
      <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</p>
      {action}
    </div>
  );
}

/**
 * "They also have a chat on the other number", in THAT number's colours so it
 * cannot be taken for this one. It sits above the messages, where it is seen
 * before anything is typed, and is slim: one or two lines and a button.
 */
function ElsewhereBar({
  notice,
  onOpen,
}: {
  notice: NonNullable<ReturnType<typeof elsewhereNotice>>;
  onOpen: (line: WhatsAppLine) => void;
}) {
  return (
    <div
      data-line={notice.line}
      className="wa-line flex shrink-0 items-center gap-2 border-b border-[var(--line-border)] bg-[var(--line-soft)] px-3 py-1 text-xs text-[var(--line-strong)]"
    >
      <LineIcon line={notice.line} size={14} />
      <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        {notice.words}
        {notice.unreadWords ? <span className="font-semibold"> · {notice.unreadWords}</span> : null}
      </p>
      <button
        type="button"
        onClick={() => onOpen(notice.line)}
        className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-[var(--line)] px-3 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-8"
      >
        Open that chat
      </button>
    </div>
  );
}

/**
 * The link names a person who has no message on THIS number. If they have one
 * on the other, say so and offer it; otherwise the link is just old.
 */
function NotOnThisLine({
  line,
  person,
  onOpenOnLine,
  onClose,
}: {
  line: WhatsAppLine;
  person: string;
  onOpenOnLine: (line: WhatsAppLine) => void;
  onClose: () => void;
}) {
  const lines = useWhatsAppChatLines(person);
  const other = (lines.data?.lines ?? []).find((c) => c.line !== line);
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <EmptyState
        icon={<MessageCircleOff width={28} height={28} strokeWidth={1.5} />}
        title={`No chat with this person on ${lineName(line)}`}
        description={
          other
            ? `They have a chat on ${lineNameAndJob(other.line)}.`
            : 'Nobody by that number has a message here. The link may be old.'
        }
        cta={
          other ? (
            <Button size="sm" onClick={() => onOpenOnLine(other.line)}>
              Open that chat
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={onClose}>
              Back to the chats
            </Button>
          )
        }
      />
    </div>
  );
}

/**
 * One open chat: its header, its messages and the box under them.
 *
 * Mounted with the person as its key, so everything it holds — what was being
 * replied to, where the unread divider goes, the scroll position — belongs to
 * that chat and is dropped when another is opened.
 */
export function ChatPane({
  line,
  person,
  config,
  configFailed,
  onRetryConfig,
  onClose,
  onOpenOnLine,
  detailsOpen,
  onToggleDetails,
  panelIsColumn,
}: ChatPaneProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const detailQ = useWhatsAppChat(line, person);
  const messagesQ = useWhatsAppMessages(line, person);
  const patch = usePatchWhatsAppChat();
  const markRead = useMarkWhatsAppRead();
  const sender = useSendWhatsApp();
  const pending = usePending(line, person);
  const admin = useAuthStore((s) => s.admin);
  const user = useAuthStore((s) => s.user);

  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, []);

  // A chat opened again inside the cache window starts from a copy that may be
  // out of date: whatever arrived since is not in it. The "N unread" divider is
  // placed once, so it must be placed from data asked for after this chat was
  // opened — unless the cache was still believed current when it opened, in
  // which case TanStack is not going to ask and there is nothing newer to wait for.
  const [heldCurrent] = React.useState(() => ({
    detail: detailQ.data !== undefined && !detailQ.isStale,
    messages: messagesQ.data !== undefined && !messagesQ.isStale,
  }));
  // Latched: once settled, a chat stays settled for this visit. A fetch paused
  // offline resumes as "fetching" when the connection returns, and un-settling
  // then would swap the whole thread for a skeleton and lose the reader's place.
  const settled = React.useRef({ detail: false, messages: false });
  if (
    openDataSettled({
      currentAtOpen: heldCurrent.detail,
      fetchedAfterOpen: detailQ.isFetchedAfterMount,
      failed: detailQ.isError,
      paused: detailQ.fetchStatus === 'paused',
    })
  ) {
    settled.current.detail = true;
  }
  if (
    openDataSettled({
      currentAtOpen: heldCurrent.messages,
      fetchedAfterOpen: messagesQ.isFetchedAfterMount,
      failed: messagesQ.isError,
      paused: messagesQ.fetchStatus === 'paused',
    })
  ) {
    settled.current.messages = true;
  }
  const detailSettled = settled.current.detail;
  const messagesSettled = settled.current.messages;

  const detail = detailQ.data;
  // The header opens with what the list already knew, before the chat itself arrives.
  const chat = detail?.chat ?? findCachedChat(qc, line, person);
  const contactName = chat ? chatTitle(chat) : 'them';
  // How the next message goes. The server's word, except that a window which
  // has run out since it spoke goes as the template.
  const mode = detail ? effectiveMode(detail.chat, detail.reply, now) : null;
  // The server has said it sends from THIS inbox, about THIS inbox's chat. If not
  // — a server older than this page — nothing goes, whatever the box shows.
  const linesAgree = serverSendsFrom(config, line) && detailIsOnLine(detail, line);

  // The window runs out at a known minute, but `now` only ticks once a minute and
  // the chat is only asked about when something happens. So at the minute it
  // closes, move the clock on (the words flip at once) and ask the server again
  // (it says how a message really goes now). Per chat: the pane is keyed on the person.
  const windowClosesAt = detail?.chat.windowClosesAt ?? null;
  const { refetch: refetchDetail } = detailQ;
  React.useEffect(() => {
    const wait = msUntilWindowCloses(windowClosesAt, Date.now());
    if (wait === null) return;
    // A little past the minute, so the clock has certainly reached it. The cap is
    // the longest a timer can wait; a window is never close to it.
    const t = window.setTimeout(
      () => {
        setNow(Date.now());
        void refetchDetail();
      },
      Math.min(wait + 250, 2_000_000_000),
    );
    return () => window.clearTimeout(t);
  }, [windowClosesAt, refetchDetail]);

  // ── the thread ──
  const serverMessages = React.useMemo(() => flattenMessages(messagesQ.data?.pages), [messagesQ.data]);
  const me = React.useMemo(() => {
    const who = admin ?? user;
    return who ? { id: who.id, name: who.name } : null;
  }, [admin, user]);
  const entries = React.useMemo(() => mergeThread(serverMessages, pending, me), [serverMessages, pending, me]);

  // A message the server now holds is shown from the server's copy. Dropping
  // its pending twin here, after the fact, rather than at the moment the reply
  // came back, is what keeps the bubble from vanishing for a frame in between.
  React.useEffect(() => {
    if (pending.length === 0) return;
    const held = new Set<string>();
    for (const m of serverMessages) if (m.clientId) held.add(m.clientId);
    for (const p of pending) if (held.has(p.clientId)) removePending(line, person, p.clientId);
  }, [serverMessages, pending, line, person]);

  // ── replying to a message, and sending ──
  const [replyTo, setReplyTo] = React.useState<WhatsAppChatMessage | null>(null);
  const [bottomToken, setBottomToken] = React.useState(0);

  const send = (text: string, link: string | null, keepRepeats: boolean) => {
    if (!detail || !linesAgree) return;
    // Worked out now, not from the minute-old clock: the waiting bubble should
    // look like what the server will send, and a window can close mid-sentence.
    // A link always goes in its template.
    const sendMode = link ? 'template' : effectiveMode(detail.chat, detail.reply, Date.now());
    const quoted = sendMode === 'text' ? replyTo : null;
    sender.send({
      line,
      person,
      text,
      mode: sendMode,
      replyTo: quoted ? { id: quoted.id, direction: quoted.direction, text: quoted.text, kind: quoted.kind } : null,
      link,
      keepRepeats,
    });
    setReplyTo(null);
    setBottomToken((n) => n + 1);
  };

  // The thread's callbacks are handed to memoised bubbles; they must keep the
  // same identity between renders or every bubble redraws on every tick.
  const modeRef = React.useRef(mode);
  const linesAgreeRef = React.useRef(linesAgree);
  React.useEffect(() => {
    modeRef.current = mode;
    linesAgreeRef.current = linesAgree;
  });
  const { retry, remove, send: sendNew } = sender;
  const retryPending = React.useCallback(
    (p: PendingMessage) => {
      if (!linesAgreeRef.current) return;
      retry(p, modeRef.current ?? p.mode);
      setBottomToken((n) => n + 1);
    },
    [retry],
  );
  // A failed message that came from the server stays in the chat as it is, so
  // it keeps its "Try again" for ever: each tap would send the words again.
  // Once it has been sent again it is remembered (across a switch to another
  // chat and back) and the button goes — read synchronously here as well, so two
  // taps before the next draw are still one send.
  const retriedIds = useRetried();
  const retryMessage = React.useCallback(
    (m: WhatsAppChatMessage) => {
      const text = typedTextOf(m);
      if (!text || isRetried(m.id) || !linesAgreeRef.current) return;
      markRetried(m.id);
      sendNew({ line, person, text, mode: modeRef.current ?? 'template', replyTo: null });
      setBottomToken((n) => n + 1);
    },
    [sendNew, line, person],
  );
  const removePendingMessage = React.useCallback((p: PendingMessage) => remove(p), [remove]);
  const { refetch: refetchMessages } = messagesQ;
  const check = React.useCallback(() => {
    void refetchMessages();
    void refetchDetail();
  }, [refetchMessages, refetchDetail]);

  const { mutateAsync: markReadAsync } = markRead;
  const markThreadRead = React.useCallback(
    (upTo: string) => markReadAsync({ line, person, upTo }),
    [markReadAsync, line, person],
  );

  // ── opening a chat clears a hand-set "unread" mark, once ──
  const clearedMark = React.useRef(false);
  React.useEffect(() => {
    if (clearedMark.current || !detail) return;
    clearedMark.current = true;
    if (detail.chat.markedUnread) patch.mutate({ line, person, patch: { markedUnread: false } });
    // Once per chat: marking it unread again while it is open must stay marked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  // ── header actions ──
  const [dialog, setDialog] = React.useState<'rename' | 'stage' | null>(null);
  const savePatch = (body: Parameters<typeof patch.mutateAsync>[0]['patch']) =>
    patch.mutateAsync({ line, person, patch: body });

  function markUnread() {
    patch.mutate(
      { line, person, patch: { markedUnread: true } },
      {
        onSuccess: () => {
          toast.success('Marked as unread.');
          // Leave: staying would let the reader's own screen mark it read again at once.
          onClose();
        },
        onError: (e) => toast.error(errorWords(e)),
      },
    );
  }
  function togglePin() {
    if (!chat) return;
    patch.mutate(
      { line, person, patch: { pinned: !chat.pinned } },
      {
        onSuccess: () =>
          toast.success(chat.pinned ? `Unpinned on ${lineName(line)}.` : `Pinned to the top on ${lineName(line)}.`),
        onError: (e) => toast.error(errorWords(e)),
      },
    );
  }
  async function copyNumber() {
    if (chat?.phone && (await copyText(`+${chat.phone}`))) toast.success('Number copied');
    else toast.error('Could not copy');
  }

  // Published as the bottom bar below md, so a toast ("Copied", a failed save)
  // sits above the box instead of on top of Send.
  const bottomRef = React.useRef<HTMLDivElement>(null);
  usePublishBottomBar(bottomRef);

  const notFound =
    (detailQ.error instanceof ApiError && detailQ.error.status === 404) ||
    (messagesQ.error instanceof ApiError && messagesQ.error.status === 404);

  if (notFound && !chat) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-surface">
        <ChatHeader
          line={line}
          person={person}
          chat={undefined}
          route={null}
          now={now}
          onBack={onClose}
          detailsOpen={false}
          onToggleDetails={() => undefined}
          panelIsColumn={panelIsColumn}
          onMarkUnread={() => undefined}
          onTogglePin={() => undefined}
          onCopyNumber={() => undefined}
          onEditName={() => undefined}
          onSetStage={() => undefined}
        />
        <NotOnThisLine line={line} person={person} onOpenOnLine={onOpenOnLine} onClose={onClose} />
      </div>
    );
  }

  const unreadAtOpen = chat?.unread ?? 0;
  // The count is known once the chat has been asked for since it was opened — or
  // has failed to load, in which case waiting any longer would leave the thread
  // blank for ever.
  const unreadKnown = detailSettled;

  const elsewhere = detail ? elsewhereNotice(detail.elsewhere, line) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <ChatHeader
        line={line}
        person={person}
        chat={chat}
        route={detail?.reply ?? null}
        now={now}
        onBack={onClose}
        detailsOpen={detailsOpen}
        onToggleDetails={onToggleDetails}
        panelIsColumn={panelIsColumn}
        onMarkUnread={markUnread}
        onTogglePin={togglePin}
        onCopyNumber={() => void copyNumber()}
        onEditName={() => setDialog('rename')}
        onSetStage={() => setDialog('stage')}
      />

      {elsewhere ? <ElsewhereBar notice={elsewhere} onOpen={onOpenOnLine} /> : null}

      <MessageThread
        entries={entries}
        serverMessages={serverMessages}
        loading={messagesQ.isLoading || !messagesSettled}
        failed={messagesQ.isError}
        onRetryLoad={() => void messagesQ.refetch()}
        hasOlder={messagesQ.hasNextPage}
        loadingOlder={messagesQ.isFetchingNextPage}
        onLoadOlder={() => void messagesQ.fetchNextPage()}
        unreadAtOpen={unreadAtOpen}
        unreadKnown={unreadKnown}
        contactName={contactName}
        canReply={mode === 'text'}
        onReply={setReplyTo}
        onRetryPending={retryPending}
        onRetryMessage={retryMessage}
        retriedIds={retriedIds}
        onRemovePending={removePendingMessage}
        onCheck={check}
        markRead={markThreadRead}
        bottomToken={bottomToken}
        now={now}
      />

      {/* The footer's colour runs under the home-indicator strip as well; its top edge wears the number's colour. */}
      <div
        ref={bottomRef}
        className="shrink-0 border-t border-[var(--line-border)] bg-[var(--wa-footer)] pb-[env(safe-area-inset-bottom)]"
      >
        {configFailed && !config ? (
          <ComposerNotice
            icon={<TriangleAlert width={18} height={18} strokeWidth={1.75} />}
            action={
              <Button size="sm" variant="secondary" onClick={onRetryConfig}>
                Try again
              </Button>
            }
          >
            Could not check whether sending is switched on, so the box is closed.
          </ComposerNotice>
        ) : !config || (!detail && !detailQ.isError) ? (
          <ComposerNotice icon={<Spinner size={16} />}>Getting ready to reply…</ComposerNotice>
        ) : !config.sendingEnabled ? (
          <ComposerNotice icon={<Lock width={18} height={18} strokeWidth={1.75} />}>
            Sending is switched off: the server has no WhatsApp access token. You can read this chat but not answer it
            from here.
          </ComposerNotice>
        ) : !serverSendsFrom(config, line) || (detail && !detailIsOnLine(detail, line)) ? (
          <ComposerNotice icon={<TriangleAlert width={18} height={18} strokeWidth={1.75} />}>
            {OUT_OF_DATE_WORDS}
          </ComposerNotice>
        ) : !detail ? (
          <ComposerNotice
            icon={<TriangleAlert width={18} height={18} strokeWidth={1.75} />}
            action={
              <Button size="sm" variant="secondary" onClick={() => void detailQ.refetch()}>
                Try again
              </Button>
            }
          >
            Could not check how a message to them would go, so the box is closed.
          </ComposerNotice>
        ) : detail.reply.blocked ? (
          <ComposerNotice icon={<Lock width={18} height={18} strokeWidth={1.75} />}>
            {detail.reply.blocked}
          </ComposerNotice>
        ) : (
          <ReplyComposer
            line={line}
            person={person}
            config={config}
            detail={detail}
            replyTo={replyTo}
            contactName={contactName}
            onCancelReply={() => setReplyTo(null)}
            onSend={send}
            now={now}
          />
        )}
      </div>

      <RenameDialog
        open={dialog === 'rename'}
        onClose={() => setDialog(null)}
        // The name SAVED in the inbox, not the one the chat is titled with: that
        // is also a campaign list's, a registration's or WhatsApp's own, and
        // clearing one of those would change nothing.
        current={savedNameOf(detail)}
        onSave={(name) => savePatch({ name })}
      />
      <StageDialog
        open={dialog === 'stage'}
        onClose={() => setDialog(null)}
        current={chat?.stage ?? null}
        onSave={(stage: WhatsAppStage | null) => savePatch({ stage })}
      />
    </div>
  );
}
