import * as React from 'react';

import { useToast } from '@/components/ui/Toast';
import {
  useAskReplyHelper,
  useLoadEarlierReplyHelper,
  usePendingReplyHelperAsk,
  usePickReplyHelperLogin,
  useReplyHelperThread,
} from '@/hooks/api/useReplyHelper';
import { ApiError } from '@/lib/api';
import {
  DRAFT_PLACED_WORDS,
  DRAFT_SAVED_WORDS,
  SUGGEST_INSTRUCTION,
  askFailureWords,
  isSuggestion,
  LOAD_EARLIER_FAILED_WORDS,
  sanitiseInstruction,
} from '@/lib/replyHelper';
import { useAuthStore } from '@/store/auth';
import { REPLY_HELPER_INSTRUCTION_MAX } from '@dk/shared';
import type { ReplyHelperTarget, ReplyHelperVideo } from '@dk/shared';

import { SendGuideVideoDialog } from '../chat/SendGuideVideoDialog';

import { ReplyHelperPanel } from './ReplyHelperPanel';

/**
 * The half-typed instruction and the last failure, per chat, outside the pane.
 *
 * The pane unmounts whenever the side panel is put away (a drawer closed, Hide
 * panel), and a sentence the admin had half written went with it. Held here per
 * chat, it can only ever come back in the chat it was typed for; an entry with
 * nothing in it is dropped. An ask that fails after the panel was shut still
 * puts its words back, for the next time the panel opens.
 */
interface HelperDraft {
  text: string;
  error: string | null;
}
const EMPTY_DRAFT: HelperDraft = { text: '', error: null };
const helperDrafts = new Map<string, HelperDraft>();
const draftListeners = new Set<() => void>();

function draftKey(target: ReplyHelperTarget): string {
  return target.channel === 'app'
    ? `app:${target.conversationId}`
    : `whatsapp:${target.line}:${target.person}`;
}

function writeDraft(key: string, patch: Partial<HelperDraft>): void {
  const next = { ...(helperDrafts.get(key) ?? EMPTY_DRAFT), ...patch };
  if (!next.text && !next.error) helperDrafts.delete(key);
  else helperDrafts.set(key, next);
  draftListeners.forEach((l) => l());
}

function subscribeDrafts(listener: () => void): () => void {
  draftListeners.add(listener);
  return () => {
    draftListeners.delete(listener);
  };
}

/**
 * Where a draft went when the admin pressed "Put in reply box":
 * `'box'`: into the reply box, which is open; `'saved'`: kept as the chat's
 * draft because the box is not open right now (the box shows it when it opens).
 * No chat is ever shut to a draft: a dealer can write again at any time, and the
 * answer goes in the same box.
 */
export type UseDraftResult = 'box' | 'saved';

/** A "Suggest reply" pressed somewhere else (the reply box's ✨), to run once. */
export interface ReplyHelperSuggestRequest {
  id: string;
}

export interface ReplyHelperPaneProps {
  target: ReplyHelperTarget;
  /**
   * Put these words in this conversation's reply box, append-only, and say where
   * they went. The caller owns the rule that keeps a draft from reaching any
   * other conversation's box.
   */
  onUseDraft: (text: string) => UseDraftResult;
  /** A Suggest press from outside the pane. Run once, then `onSuggestHandled`. */
  suggestRequest?: ReplyHelperSuggestRequest | null;
  onSuggestHandled?: (id: string) => void;
  /** After a draft went into the box: a phone closes the sheet, the box is next. */
  onDraftPlaced?: () => void;
  /**
   * The reply box marks a helper draft itself (the dealer-chat box's violet
   * "Draft from the Reply helper" line), so no toast is needed when one lands.
   * A box without that mark (the WhatsApp one) gets the toast.
   */
  boxTagsDraft?: boolean;
  /**
   * The pane is on screen. A pane kept mounted behind another tab cannot scroll
   * (a hidden box has no height), so it scrolls to the newest turn when shown.
   */
  active?: boolean;
  className?: string;
}

/**
 * The Reply helper (ADR 0025) as a pane of the inbox's side panel: the helper's
 * own thread of asks and drafts, and the one box where the admin talks to it.
 *
 * IT DRAFTS AND NEVER SENDS. "Put in reply box" hands the words to the reply box
 * through `onUseDraft` and stops. The admin reads them, changes them and presses
 * Send themselves; nothing in this feature can post to the person.
 *
 * IT LIVES IN THE SIDE PANEL, NOT ABOVE THE REPLY BOX (30 Oct 2026). Stacked over
 * the composer, the helper's box and the box that sends to the dealer were two
 * look-alike text fields a few pixels apart, and an instruction typed into the
 * wrong one would have gone to the dealer. Now the only field under the chat is
 * the one that sends, and this pane wears the helper's violet from top to bottom.
 *
 * KEY IT ON THE OPEN CONVERSATION. The half-typed instruction and the last
 * failure are held per chat (`helperDrafts`, above), and neither may follow the
 * admin to another person. The thread's content comes from the server per
 * conversation, so nothing crosses even if a key were missed — but a question
 * typed for one dealer left in the box for the next is the leak the key
 * prevents.
 */
export function ReplyHelperPane({
  target,
  onUseDraft,
  suggestRequest,
  onSuggestHandled,
  onDraftPlaced,
  boxTagsDraft = false,
  active = true,
  className,
}: ReplyHelperPaneProps) {
  const toast = useToast();
  const meId = useAuthStore((s) => s.user?.id ?? s.admin?.id ?? null);
  // A suggested video the admin chose to send: "Send a video" opens on it, where
  // they watch it and press Send. App chat only (WhatsApp gets the page link).
  const [videoToSend, setVideoToSend] = React.useState<ReplyHelperVideo | null>(null);

  const key = draftKey(target);
  const draft = React.useSyncExternalStore(
    subscribeDrafts,
    () => helperDrafts.get(key) ?? EMPTY_DRAFT,
  );
  const instruction = draft.text;
  const askError = draft.error;
  const setInstruction = React.useCallback((text: string) => writeDraft(key, { text }), [key]);
  const setAskError = React.useCallback(
    (error: string | null) => writeDraft(key, { error }),
    [key],
  );
  const askingRef = React.useRef(false);

  const threadQ = useReplyHelperThread(target);
  const askM = useAskReplyHelper(target);
  const earlierM = useLoadEarlierReplyHelper(target);
  const pickM = usePickReplyHelperLogin(target);
  const pending = usePendingReplyHelperAsk(target);

  const thread = threadQ.data;

  /**
   * Ask. Resolves to whether the ask went through, so the caller can put the
   * words back in the box when it did not: an instruction that took a minute to
   * write is not lost to a network blip.
   */
  const send = React.useCallback(
    async (text: string): Promise<boolean> => {
      // `pending` follows the request a render later; the ref closes that gap so a
      // quick second tap cannot start a second paid ask.
      if (pending !== null || askingRef.current) return false;
      askingRef.current = true;
      setAskError(null);
      try {
        await askM.mutateAsync(text);
        return true;
      } catch (e) {
        const err = e instanceof ApiError ? e : { message: (e as Error)?.message };
        const words = askFailureWords(err);
        setAskError(words);
        toast.error(words);
        // A dropped connection may still have an answer coming on the server: read
        // the thread again so it shows up without a second, paid ask.
        if (!('status' in err) || err.status === 0 || (err.status ?? 0) >= 500)
          void threadQ.refetch();
        return false;
      } finally {
        askingRef.current = false;
      }
    },
    [askM, pending, threadQ, toast, setAskError],
  );

  /** A typed instruction. Nothing typed is not an ask: that is Suggest reply. */
  const ask = React.useCallback(
    (raw: string): Promise<boolean> => {
      const text = sanitiseInstruction(raw, REPLY_HELPER_INSTRUCTION_MAX);
      return text ? send(text) : Promise.resolve(false);
    },
    [send],
  );

  /** "Suggest reply": no instruction; the server reads the chat. */
  const suggest = React.useCallback(() => send(SUGGEST_INSTRUCTION), [send]);

  const notConfigured = !!thread?.context.notices.some((n) => n.kind === 'not_configured');

  /*
   * A Suggest pressed outside the pane. It waits for the thread to load (the
   * pane may have mounted with the press, when the panel was shut), runs once,
   * and is handed back so a later remount of the pane cannot run it again — a
   * second paid ask for one tap.
   */
  const handledRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!suggestRequest || handledRef.current === suggestRequest.id) return;
    // A thread that could not be read: hand the press back unrun, so it cannot
    // fire minutes later, unasked, once the thread does load.
    if (threadQ.isError && !thread) {
      handledRef.current = suggestRequest.id;
      onSuggestHandled?.(suggestRequest.id);
      return;
    }
    if (!thread) return;
    handledRef.current = suggestRequest.id;
    onSuggestHandled?.(suggestRequest.id);
    if (!notConfigured && pending === null) void suggest();
  }, [suggestRequest, thread, threadQ.isError, notConfigured, pending, suggest, onSuggestHandled]);

  function submit() {
    const text = instruction;
    if (!sanitiseInstruction(text, REPLY_HELPER_INSTRUCTION_MAX)) return;
    setInstruction('');
    void ask(text).then((ok) => {
      // Put the words back unless the admin has already started something new.
      // Read from the store, not this render: the pane may be gone by now.
      if (!ok && !(helperDrafts.get(key)?.text ?? '').trim()) setInstruction(text);
    });
  }

  function useDraft(text: string) {
    const where = onUseDraft(text);
    // Into a box that marks it itself (the dealer-chat box's violet line and
    // one pulse) no toast: in the corner it would sit over that box's Send. Any
    // other box, and a draft saved for a box that is not open, is still said.
    if (where === 'saved') toast.success(DRAFT_SAVED_WORDS);
    else if (!boxTagsDraft) toast.success(DRAFT_PLACED_WORDS);
    onDraftPlaced?.();
  }

  function loadEarlier() {
    const oldest = thread?.turns[0];
    if (!oldest || earlierM.isPending) return;
    earlierM.mutate(oldest.id, {
      onError: () => toast.error(LOAD_EARLIER_FAILED_WORDS),
    });
  }

  function pickLogin(userId: string | null) {
    // Only a WhatsApp number can be shared between logins.
    if (target.channel !== 'whatsapp' || pickM.isPending) return;
    pickM.mutate(
      { line: target.line, person: target.person, userId },
      { onError: (e) => toast.error(askFailureWords(e instanceof ApiError ? e : null)) },
    );
  }

  return (
    <>
      <ReplyHelperPanel
        className={className}
        thread={thread}
        loading={threadQ.isPending}
        loadFailed={threadQ.isError}
        onRetryLoad={() => void threadQ.refetch()}
        meId={meId}
        pendingInstruction={pending}
        askError={askError}
        instruction={instruction}
        onInstructionChange={setInstruction}
        onAsk={submit}
        onSuggest={() => void suggest()}
        onRetryTurn={(text) => void (isSuggestion(text) ? suggest() : ask(text))}
        onUse={useDraft}
        onSendVideo={(v) => setVideoToSend(v)}
        onLoadEarlier={loadEarlier}
        loadingEarlier={earlierM.isPending}
        onPickLogin={pickLogin}
        pickingLogin={pickM.isPending}
        openChannel={target.channel}
        active={active}
      />
      <SendGuideVideoDialog
        open={videoToSend !== null}
        onClose={() => setVideoToSend(null)}
        target={
          target.channel === 'app'
            ? { channel: 'app', conversationId: target.conversationId }
            : { channel: 'whatsapp', line: target.line, person: target.person }
        }
        initialVideoId={videoToSend?.id ?? null}
        initialStartSec={videoToSend?.startSec ?? 0}
      />
    </>
  );
}
