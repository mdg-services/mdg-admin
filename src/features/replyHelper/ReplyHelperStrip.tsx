import { ChevronDown, Sparkles, Wand2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Spinner } from '@/components/ui/Spinner';
import { usePendingReplyHelperAsk, useReplyHelperThread } from '@/hooks/api/useReplyHelper';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import type { ReplyHelperTarget } from '@dk/shared';

import { ReplyHelperPane, type ReplyHelperSuggestRequest, type UseDraftResult } from './ReplyHelperPane';

export type { UseDraftResult } from './ReplyHelperPane';

/**
 * The Reply helper (ADR 0025) as a slim row above a reply box, for an inbox
 * whose side panel has no room for it (the WhatsApp inbox). The dealer-chat
 * inbox gives the helper a tab of its own in the side panel instead.
 *
 * ADMIN CHROME, never a message: the row names who the helper is writing for,
 * wears the helper's violet, and opens the same `ReplyHelperPane` the side panel
 * uses — as a capped tray at md and up, and as a bottom sheet on a phone, where
 * "Put in reply box" closes the sheet because the box is the next thing needed.
 *
 * KEY IT ON THE OPEN CONVERSATION. The row holds the open/closed state and a
 * pending one-tap Suggest, and the pane under it holds the half-typed
 * instruction; none of that may follow the admin to another person.
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
  const isMd = useMediaQuery('(min-width: 768px)');
  const [trayOpen, setTrayOpen] = React.useState(readOpen);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [suggestRequest, setSuggestRequest] = React.useState<ReplyHelperSuggestRequest | null>(null);
  const seq = React.useRef(0);

  const threadQ = useReplyHelperThread(target);
  const pending = usePendingReplyHelperAsk(target);
  const thread = threadQ.data;
  const open = isMd ? trayOpen : sheetOpen;
  const notConfigured = !!thread?.context.notices.some((n) => n.kind === 'not_configured');
  const canSuggest = !!thread && !notConfigured && pending === null;

  function toggle() {
    if (isMd) {
      const next = !trayOpen;
      setTrayOpen(next);
      writeOpen(next);
    } else {
      setSheetOpen(true);
    }
  }

  /** From the closed row: open the pane so the drafts land in view, and start. */
  function suggestFromRow() {
    if (!canSuggest) return;
    if (isMd) {
      setTrayOpen(true);
      writeOpen(true);
    } else {
      setSheetOpen(true);
    }
    seq.current += 1;
    setSuggestRequest({ id: String(seq.current) });
  }

  const handled = React.useCallback(
    (id: string) => setSuggestRequest((r) => (r?.id === id ? null : r)),
    [],
  );

  const pane = (className: string) => (
    <ReplyHelperPane
      className={className}
      target={target}
      onUseDraft={onUseDraft}
      suggestRequest={suggestRequest}
      onSuggestHandled={handled}
      onDraftPlaced={isMd ? undefined : () => setSheetOpen(false)}
    />
  );

  return (
    <div className="border-t border-assist-line bg-assist-soft">
      <div className="flex min-w-0 items-center gap-1 pr-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="focus-inset flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2 pl-3 text-left"
        >
          <Sparkles width={14} height={14} strokeWidth={2} className="shrink-0 text-assist" aria-hidden />
          <span className="shrink-0 text-sm font-semibold text-assist-strong">Reply helper</span>
          <span className="min-w-0 flex-1 truncate text-sm text-text-muted">
            {pending !== null ? 'Writing…' : (thread?.context.header ?? '')}
          </span>
          {pending !== null ? <Spinner size={14} className="shrink-0 text-assist" /> : null}
          <ChevronDown
            width={16}
            height={16}
            strokeWidth={1.75}
            aria-hidden
            className={cn('shrink-0 text-text-muted transition-transform duration-200', open ? 'rotate-180' : '-rotate-90')}
          />
        </button>
        {/* One tap from the closed row. It stays on the row, disabled and
            spinning, while one is being written: a button that unmounted at the
            first tap let the toggle slide under a double-click's second tap. */}
        {thread && !notConfigured ? (
          <Button
            size="sm"
            variant="secondary"
            tone="assist"
            loading={pending !== null}
            onClick={suggestFromRow}
            leftIcon={<Wand2 width={15} height={15} strokeWidth={1.75} />}
            className="shrink-0"
          >
            Suggest reply
          </Button>
        ) : null}
      </div>

      {isMd && trayOpen ? (
        <div className="border-t border-assist-line">{pane('max-h-[min(55vh,520px)]')}</div>
      ) : null}

      {/* Below md: the same pane in a bottom sheet. `bodyPadding="none"` so the
          thread meets the sheet's edges and the box pins to its bottom. */}
      <Drawer
        open={!isMd && sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Reply helper"
        description="Private to MDG — never sent"
        width="sm"
        bodyPadding="none"
      >
        {pane('h-[72dvh]')}
      </Drawer>
    </div>
  );
}
