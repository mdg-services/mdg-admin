import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import * as React from 'react';

import { Drawer } from '@/components/ui/Drawer';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import {
  useAskReplyHelper,
  useLoadEarlierReplyHelper,
  usePendingReplyHelperAsk,
  usePickReplyHelperLogin,
  useReplyHelperThread,
} from '@/hooks/api/useReplyHelper';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  DRAFT_PLACED_WORDS,
  DRAFT_SAVED_WORDS,
  askFailureWords,
  LOAD_EARLIER_FAILED_WORDS,
  sanitiseInstruction,
} from '@/lib/replyHelper';
import { useAuthStore } from '@/store/auth';
import { REPLY_HELPER_INSTRUCTION_MAX } from '@dk/shared';
import type { ReplyHelperTarget } from '@dk/shared';

import { ReplyHelperPanel } from './ReplyHelperPanel';

/**
 * The Reply helper (ADR 0025): a strip above the reply box, in the dealer-chat
 * inbox and in the WhatsApp inbox. ADMIN CHROME, never a message in the thread —
 * the same standing as `AiFirstLineStrip`, and for the same reason: a bubble in
 * a thread is something the DEALER sees.
 *
 * IT DRAFTS AND NEVER SENDS. "Use this" hands the words to the reply box
 * through `onUseDraft` and stops. The admin reads them, changes them and presses
 * Send themselves; nothing in this feature can post to the person.
 *
 * KEY IT ON THE OPEN CONVERSATION (`key={conversation.id}` / the chat's own
 * key). The strip holds the half-typed instruction, the "writing" state and the
 * sheet's open flag, and none of that may follow the admin to another person.
 * The thread's content comes from the server per conversation, so nothing
 * crosses even if a key were missed — but a question typed for one dealer left
 * in the box for the next is the leak the key prevents.
 *
 * COLLAPSED BY DEFAULT: one slim row naming who the helper is writing for and
 * which channel, so the admin always knows without opening it. Open or closed is
 * remembered for this browser (one flag, never content) — at md and up, where it
 * is an inline tray. Below md the panel is a bottom sheet, and a sheet that
 * reopened itself on every chat would be a modal in the way of the thread, so
 * the phone never remembers it and always starts closed.
 *
 * ABOVE md, AN INLINE TRAY, NOT A DIALOG. The admin has to keep reading the
 * conversation while asking about it, so the panel sits in the page's flow and
 * is capped (55% of the screen, 520px) with its own scroll. Below md the thread
 * and the box share a short screen already, so tapping the row opens a sheet
 * and "Use this" closes it — the box and the draft in it are the next thing the
 * admin needs to see (`AiFirstLineStrip` folds away below md for the same reason).
 */

const OPEN_KEY = 'dk.replyHelper.open';

// The browser's storage is a convenience and can be absent or throw (a private
// window, site data blocked): the strip must work exactly the same without it.
function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}
function writeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    // Not remembered; the strip still works for this visit.
  }
}

/**
 * Where a draft went when the admin pressed "Use this":
 * `'box'`: into the reply box, which is open; `'saved'`: kept as the chat's
 * draft because the box is not open right now (the box shows it when it opens);
 * `'closed'`: refused, because the chat cannot be written to (a resolved chat).
 */
export type UseDraftResult = 'box' | 'saved' | 'closed';

export interface ReplyHelperStripProps {
  target: ReplyHelperTarget;
  /**
   * Put these words in this conversation's reply box, append-only, and say where
   * they went. The caller owns the rule that keeps a draft from reaching any
   * other conversation's box.
   */
  onUseDraft: (text: string) => UseDraftResult;
}

export function ReplyHelperStrip({ target, onUseDraft }: ReplyHelperStripProps) {
  const toast = useToast();
  const isMd = useMediaQuery('(min-width: 768px)');
  const meId = useAuthStore((s) => s.user?.id ?? s.admin?.id ?? null);

  const [trayOpen, setTrayOpen] = React.useState(readOpen);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [instruction, setInstruction] = React.useState('');
  const [askError, setAskError] = React.useState<string | null>(null);

  const threadQ = useReplyHelperThread(target);
  const askM = useAskReplyHelper(target);
  const earlierM = useLoadEarlierReplyHelper(target);
  const pickM = usePickReplyHelperLogin(target);
  const pending = usePendingReplyHelperAsk(target);

  const thread = threadQ.data;
  const open = isMd ? trayOpen : sheetOpen;

  function toggle() {
    if (isMd) {
      const next = !trayOpen;
      setTrayOpen(next);
      writeOpen(next);
    } else {
      setSheetOpen(true);
    }
  }

  /**
   * Ask. Resolves to whether the ask went through, so the caller can put the
   * words back in the box when it did not: an instruction that took a minute to
   * write is not lost to a network blip.
   */
  const ask = React.useCallback(
    async (raw: string): Promise<boolean> => {
      const text = sanitiseInstruction(raw, REPLY_HELPER_INSTRUCTION_MAX);
      if (!text || pending !== null) return false;
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
        if (!('status' in err) || err.status === 0 || (err.status ?? 0) >= 500) void threadQ.refetch();
        return false;
      }
    },
    [askM, pending, threadQ, toast],
  );

  function submit() {
    const text = instruction;
    if (!sanitiseInstruction(text, REPLY_HELPER_INSTRUCTION_MAX)) return;
    setInstruction('');
    void ask(text).then((ok) => {
      // Put the words back unless the admin has already started something new.
      if (!ok) setInstruction((now) => (now.trim() ? now : text));
    });
  }

  function useDraft(text: string) {
    const where = onUseDraft(text);
    if (where === 'closed') {
      toast.info('This chat is resolved — reopen it to put a draft in the box.');
      return;
    }
    toast.success(where === 'box' ? DRAFT_PLACED_WORDS : DRAFT_SAVED_WORDS);
    // Below md, the box is what the admin needs next, and the sheet covers it.
    if (!isMd) setSheetOpen(false);
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

  const panel = (className: string) => (
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
      onRetryTurn={(text) => void ask(text)}
      onUse={useDraft}
      onLoadEarlier={loadEarlier}
      loadingEarlier={earlierM.isPending}
      onPickLogin={pickLogin}
      pickingLogin={pickM.isPending}
      openChannel={target.channel}
    />
  );

  const whatsapp = target.channel === 'whatsapp';

  return (
    <div
      className={cn(
        'border-t',
        whatsapp ? 'border-[var(--line-border)] bg-[var(--wa-footer)]' : 'border-border bg-surface',
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex min-h-11 w-full min-w-0 items-center gap-2 px-3 py-2 text-left"
      >
        <Sparkles width={14} height={14} strokeWidth={1.75} className="shrink-0 text-text-muted" />
        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-text-subtle">
          Reply helper
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-text-muted">
          {pending !== null ? 'Writing…' : (thread?.context.header ?? '')}
        </span>
        {pending !== null ? <Spinner size={14} className="shrink-0 text-text-muted" /> : null}
        {open ? (
          <ChevronDown width={16} height={16} strokeWidth={1.75} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronRight width={16} height={16} strokeWidth={1.75} className="shrink-0 text-text-muted" />
        )}
      </button>

      {isMd && trayOpen ? (
        <div className="border-t border-border bg-surface">
          {panel('max-h-[min(55vh,520px)]')}
        </div>
      ) : null}

      {/* Below md: the same body in a bottom sheet. `bodyPadding="none"` so the
          thread meets the sheet's edges and the box pins to its bottom; the
          fixed share of the screen is what lets the thread scroll inside the
          sheet instead of stretching it. */}
      <Drawer
        open={!isMd && sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Reply helper"
        description={thread?.context.header}
        width="sm"
        bodyPadding="none"
      >
        {panel('h-[68dvh]')}
      </Drawer>
    </div>
  );
}
