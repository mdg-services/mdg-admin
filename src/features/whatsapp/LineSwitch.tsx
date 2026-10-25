import * as React from 'react';

import { cn } from '@/lib/cn';
import { WHATSAPP_LINE_INFO, WHATSAPP_LINES, type WhatsAppLine } from '@dk/shared';

import { badgeCount, lineSwitchLabel } from './format';
import { LineIcon } from './LineMark';

export interface LineSwitchProps {
  line: WhatsAppLine;
  onChange: (line: WhatsAppLine) => void;
  /** Chats with something unread, per inbox, from the summary. */
  unread: Record<WhatsAppLine, number>;
}

/**
 * The two numbers, side by side, at the very top of the chat list.
 *
 * Each segment is the number's icon, its WhatsApp name, and — smaller — its job.
 * The one you are in is filled with its colour; the other is plain, with only
 * its icon in colour, and carries its own unread count so a message on the
 * number you are NOT looking at is never out of sight.
 *
 * A radio group: arrow keys move between the two and choose as they go, Tab
 * leaves the group. At least 44px tall, so a thumb cannot miss.
 */
/**
 * Switching remounts the whole inbox (it is keyed on the line), this switch
 * included, so the button that had focus is gone. A switch made from the
 * keyboard leaves a note here, and the new switch puts focus back on the chosen
 * segment — otherwise focus falls to the page and the arrow keys stop working.
 */
let refocus: WhatsAppLine | null = null;

export function LineSwitch({ line, onChange, unread }: LineSwitchProps) {
  const refs = React.useRef(new Map<WhatsAppLine, HTMLButtonElement>());

  React.useEffect(() => {
    if (refocus !== line) return;
    refocus = null;
    refs.current.get(line)?.focus();
  }, [line]);

  function choose(next: WhatsAppLine, byKeyboard: boolean) {
    if (next === line) return;
    if (byKeyboard) refocus = next;
    onChange(next);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, from: WhatsAppLine) {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const i = WHATSAPP_LINES.indexOf(from);
    const next = WHATSAPP_LINES[(i + step + WHATSAPP_LINES.length) % WHATSAPP_LINES.length];
    if (!next) return;
    choose(next, true);
  }

  return (
    <div role="radiogroup" aria-label="Which number" className="grid grid-cols-2 gap-1.5 px-3 pb-2 pt-2.5">
      {WHATSAPP_LINES.map((l) => {
        const info = WHATSAPP_LINE_INFO[l];
        const active = l === line;
        const count = unread[l];
        return (
          <button
            key={l}
            ref={(el) => {
              if (el) refs.current.set(l, el);
              else refs.current.delete(l);
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={lineSwitchLabel(l, count)}
            tabIndex={active ? 0 : -1}
            data-line={l}
            // `detail` is 0 for a click made with Enter or Space.
            onClick={(e) => choose(l, e.detail === 0)}
            onKeyDown={(e) => onKeyDown(e, l)}
            className={cn(
              'wa-line flex min-h-11 min-w-0 flex-col justify-center rounded-lg px-2.5 py-1 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1',
              active
                ? 'border border-transparent bg-[var(--line)] text-white'
                : 'border border-border bg-surface-2 text-text hover:border-border-strong',
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <LineIcon line={l} size={16} className={active ? 'text-white' : 'text-[var(--line)]'} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{info.name}</span>
            </span>
            {/* The count sits on the second row: beside the name it left "Dealer's Kavach" 8px short at 375px. */}
            <span className="flex min-w-0 items-center justify-between gap-2 pl-[22px]">
              <span className={cn('truncate text-[11px] leading-4', active ? 'text-white' : 'text-text-muted')}>
                {info.purpose}
              </span>
              {count > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-semibold leading-none',
                    active ? 'bg-white text-[var(--line-ink)]' : 'bg-[var(--line)] text-white',
                  )}
                >
                  {badgeCount(count)}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
