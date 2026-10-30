import { Lock, Sparkles, Wand2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { REPLY_HELPER_INSTRUCTION_MAX } from '@dk/shared';

/**
 * Where the admin tells the helper what they want ("he wants the payment link —
 * polite Hinglish reply"). It is NOT the reply box: nothing typed here goes to
 * the dealer. It lives in the side panel, wears the helper's violet, says "Ask
 * the helper…" and its button says "Ask", never "Send" — so the two are never
 * confused at a glance, and are never beside each other.
 *
 * ENTER. At a desk, Enter asks and Shift+Enter is a new line — the habit of
 * every chat box. On a phone (a coarse pointer) Enter is a new line and the
 * button asks: there is no Shift on a phone keyboard, and an instruction is
 * often two lines. A key press that is part of composing a word in an input
 * method (Hindi, Hinglish suggestions) is never an Enter of ours: it is the
 * keyboard confirming a word, and treating it as "ask" would fire half an
 * instruction.
 *
 * 16px text below md: lower, and focusing it zooms an iPhone in and nothing
 * zooms back.
 */
export function InstructionBox({
  value,
  onChange,
  onAsk,
  busy,
  disabled,
  disabledWords,
  onSuggest,
  readerWords,
}: {
  value: string;
  onChange: (next: string) => void;
  onAsk: () => void;
  /** One tap, nothing typed: read the chat and draft what MDG should send next. */
  onSuggest: () => void;
  /** A request is running for this person: the box is shut until it lands. */
  busy: boolean;
  /** The helper cannot be used at all here (not set up, thread not loaded). */
  disabled?: boolean;
  disabledWords?: string;
  /** Who a draft is written for: "the owner", "the manager and the owners (group chat)". */
  readerWords?: string;
}) {
  const coarse = useMediaQuery('(pointer: coarse)');
  const shut = busy || !!disabled;
  const typed = value.trim();
  const remaining = REPLY_HELPER_INSTRUCTION_MAX - value.length;
  const hintId = React.useId();

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey || coarse) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    if (typed && !shut) onAsk();
  }

  return (
    <div className="shrink-0 border-t border-assist-line bg-assist-soft px-3 pt-2.5 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:pb-3">
      {/* The quick way: no instruction at all. It reads the chat and works out
          what they are waiting for; the box below is for when the admin wants
          something particular, or to rework the last drafts ("shorter"). */}
      <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Button
          size="sm"
          variant="secondary"
          tone="assist"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onSuggest}
          disabled={shut}
          leftIcon={<Wand2 width={15} height={15} strokeWidth={1.75} />}
        >
          Suggest reply
        </Button>
        <span className="min-w-0 text-xs text-text-muted">reads the chat and drafts the next reply</span>
      </div>
      <div
        className={cn(
          'flex items-end gap-1.5 rounded-lg border border-assist-line bg-surface p-1.5 transition-shadow duration-150',
          'focus-within:border-assist focus-within:shadow-[0_0_0_3px_var(--color-assist-line)]',
          shut && 'opacity-70',
        )}
      >
        <textarea
          value={value}
          rows={2}
          maxLength={REPLY_HELPER_INSTRUCTION_MAX}
          disabled={shut}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Ask the helper — never sent to the dealer"
          aria-describedby={hintId}
          placeholder={
            disabled && disabledWords ? disabledWords : 'Ask the helper… e.g. “make it shorter”'
          }
          // The focus mark is the box's own violet edge (`focus-within` above).
          className="block max-h-40 min-h-11 w-full min-w-0 resize-none bg-transparent px-2 py-1.5 text-base leading-5 text-text placeholder:text-text-subtle focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed md:text-sm"
        />
        {/* `onMouseDown` keeps the keyboard up on a phone: a tap that takes
            focus from the box drops it, and the box jumps as it goes. */}
        <Button
          size="sm"
          tone="assist"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onAsk}
          disabled={shut || !typed}
          loading={busy}
          leftIcon={<Sparkles width={15} height={15} strokeWidth={1.75} />}
          className="shrink-0"
        >
          Ask
        </Button>
      </div>
      {/* Who the drafts are for rides on this line: the panel has no banner
          over its drafts to say it any more. */}
      <p id={hintId} className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-text-muted">
        <span className="inline-flex min-w-0 items-start gap-1">
          <Lock width={11} height={11} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Only MDG sees this
            {readerWords ? ` · Drafts for ${readerWords}` : ''}
            {coarse ? null : (
              <>
                {' · '}
                <span className="whitespace-nowrap">Enter to ask</span>
              </>
            )}
          </span>
        </span>
        {remaining <= 200 ? <span className="tabular-nums">{remaining} left</span> : null}
      </p>
    </div>
  );
}
