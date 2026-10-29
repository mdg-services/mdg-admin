import { Sparkles, Wand2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SUGGEST_LABEL } from '@/lib/replyHelper';
import { REPLY_HELPER_INSTRUCTION_MAX } from '@dk/shared';

/**
 * Where the admin tells the helper what they want ("he wants the payment link —
 * polite Hinglish reply"). It is NOT the reply box: nothing typed here goes to
 * the dealer, and the button says "Ask", never "Send", so the two are never
 * confused at a glance.
 *
 * ENTER. At a desk, Enter asks and Shift+Enter is a new line — the habit of
 * every chat box. On a phone (a coarse pointer) Enter is a new line and the
 * button asks: there is no Shift on a phone keyboard, and an instruction is
 * often two lines. A key press that is part of composing a word in an input
 * method (Hindi, Hinglish suggestions) is never an Enter of ours: it is the
 * keyboard confirming a word, and treating it as "ask" would fire half an
 * instruction.
 *
 * 16px text below md (`Textarea`'s own rule): lower, and focusing it zooms an
 * iPhone in and nothing zooms back.
 */
export function InstructionBox({
  value,
  onChange,
  onAsk,
  busy,
  disabled,
  disabledWords,
  onSuggest,
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
}) {
  const coarse = useMediaQuery('(pointer: coarse)');
  const shut = busy || !!disabled;
  const typed = value.trim();
  const remaining = REPLY_HELPER_INSTRUCTION_MAX - value.length;

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey || coarse) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    if (typed && !shut) onAsk();
  }

  return (
    <div className="grid gap-1.5 border-t border-border bg-surface px-3 py-2">
      {/* The quick way: no instruction at all. It reads the chat and works out
          what they are waiting for; the box below is for when the admin wants
          something particular, or to rework the last drafts ("shorter"). */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Button
          size="sm"
          variant="secondary"
          tone="brand"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onSuggest}
          disabled={shut}
          leftIcon={<Wand2 width={16} height={16} strokeWidth={1.75} />}
        >
          {SUGGEST_LABEL}
        </Button>
        <span className="min-w-0 text-xs text-text-subtle">
          reads the chat and writes the reply — or say what you want below
        </span>
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          rows={2}
          maxLength={REPLY_HELPER_INSTRUCTION_MAX}
          disabled={shut}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="What should the reply say?"
          placeholder={
            disabled && disabledWords
              ? disabledWords
              : 'e.g. he wants the payment link — polite Hinglish reply'
          }
          className="min-h-11 resize-none"
        />
        {/* `onMouseDown` keeps the keyboard up on a phone: a tap that takes
            focus from the box drops it, and the box jumps as it goes. */}
        <Button
          onMouseDown={(e) => e.preventDefault()}
          onClick={onAsk}
          disabled={shut || !typed}
          loading={busy}
          leftIcon={<Sparkles width={16} height={16} strokeWidth={1.75} />}
          className="shrink-0"
        >
          Ask
        </Button>
      </div>
      <p className="flex flex-wrap justify-between gap-x-3 text-xs text-text-subtle">
        <span>
          {coarse
            ? 'Nothing here is sent to them. Drafts go in the reply box only when you tap Use this.'
            : 'Enter to ask, Shift+Enter for a new line. Nothing here is sent to them.'}
        </span>
        {remaining <= 200 ? <span className="tabular-nums">{remaining} left</span> : null}
      </p>
    </div>
  );
}
