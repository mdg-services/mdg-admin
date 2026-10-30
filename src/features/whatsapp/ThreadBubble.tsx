import { ChevronDown, CornerUpLeft, ExternalLink } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';
import { linkify } from '@/lib/linkify';
import { useLongPress } from '@/lib/useLongPress';
import type { WhatsAppChatMessage } from '@dk/shared';

import type { BubbleAnchor } from './BubbleActions';
import {
  canRetry,
  clockTime,
  firstName,
  isUnreadInbound,
  mediaKindOf,
  opensLink,
  type PendingMessage,
  quoteWords,
  stopNote,
  tickFor,
  UNKNOWN_OUTCOME_NOTE,
} from './format';
import { MessageMedia, overlayFits } from './MessageMedia';
import { Tick } from './Tick';

/** A message this young plays the short "landing" motion; anything older was already there. */
const FRESH_MS = 4000;

function Meta({
  message,
  tone,
  className,
}: {
  message: WhatsAppChatMessage;
  tone: 'normal' | 'overlay';
  className?: string;
}) {
  const out = message.direction === 'out';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] leading-none',
        tone === 'overlay' ? 'rounded-full bg-black/45 px-1.5 py-1 text-white' : 'text-[var(--wa-meta)]',
        className,
      )}
    >
      <time dateTime={message.at}>{clockTime(message.at)}</time>
      {out ? <Tick kind={tickFor(message.delivery)} /> : null}
    </span>
  );
}

const ACTION_BUTTON =
  'inline-flex min-h-11 items-center rounded-md px-2 text-xs font-semibold text-[var(--wa-link)] hover:underline ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0 md:py-1';

export interface ThreadBubbleProps {
  message: WhatsAppChatMessage;
  /** The admin's own message the server has not confirmed, or could not send. */
  pending: PendingMessage | null;
  /** First of a run from one side: carries the tail and a little air above. */
  startsRun: boolean;
  /** What to call them, for the quote's heading and for a screen reader. */
  contactName: string;
  /** The actions menu is open on this bubble, so its chevron closes it rather than reopening it. */
  menuOpen: boolean;
  onOpenMenu: (message: WhatsAppChatMessage, anchor: BubbleAnchor) => void;
  onJumpTo: (id: string) => void;
  onOpenImage: (src: string, alt: string) => void;
  onRetryPending: (pending: PendingMessage) => void;
  onRetryMessage: (message: WhatsAppChatMessage) => void;
  /** This failed message of ours has already been sent again: it shows that, not a second Try again. */
  retried: boolean;
  onRemovePending: (pending: PendingMessage) => void;
  /** Ask the server again how a send that gave no answer ended. */
  onCheck: () => void;
}

/**
 * One message, drawn as WhatsApp draws one: a rounded bubble on the left for
 * them and the right for us, a tail on the first of a run, the time and ticks
 * in the bottom-right corner, a quoted message above, a reaction hanging off
 * the bottom edge, and — for our own template messages — its buttons beneath.
 *
 * The time sits at the end of the last line when there is room and drops to its
 * own line when there is not: an invisible spacer the width of the time is
 * written after the text, and the real one is laid over it.
 *
 * Memoised, and fed only values that are the same object between refetches, so
 * a thread of sixty bubbles does not redraw for the tick on one of them.
 */
export const ThreadBubble = React.memo(function ThreadBubble({
  message,
  pending,
  startsRun,
  contactName,
  menuOpen,
  onOpenMenu,
  onJumpTo,
  onOpenImage,
  onRetryPending,
  onRetryMessage,
  retried,
  onRemovePending,
  onCheck,
}: ThreadBubbleProps) {
  const out = message.direction === 'out';
  const kind = mediaKindOf(message);
  const text = message.text?.trim() ? message.text : null;
  const overlayMeta = kind !== null && !text && overlayFits(message, kind);
  // A message the server has not stored has nothing to quote or copy from yet.
  const hasMenu = pending === null;
  const failed = message.delivery === 'failed';
  const unknown = message.delivery === 'unknown';
  const fresh = Date.now() - Date.parse(message.at) < FRESH_MS;

  const longPress = useLongPress((point) => {
    if (hasMenu) onOpenMenu(message, point);
  });
  const menuWasOpen = React.useRef(false);

  const quote = message.replyTo;
  const quoteIsOurs = quote?.direction === 'out';

  return (
    <div
      data-message-id={message.id}
      data-unread-at={isUnreadInbound(message) ? message.at : undefined}
      className={cn('flex w-full', out ? 'justify-end' : 'justify-start', startsRun ? 'mt-2' : 'mt-0.5', fresh && 'wa-rise')}
    >
      <div className={cn('flex max-w-[85%] flex-col md:max-w-[65%]', out ? 'items-end' : 'items-start')}>
        <div
          onContextMenu={
            hasMenu
              ? (e) => {
                  e.preventDefault();
                  onOpenMenu(message, { x: e.clientX, y: e.clientY });
                }
              : undefined
          }
          onPointerDown={longPress.onPointerDown}
          onPointerMove={longPress.onPointerMove}
          onPointerUp={longPress.onPointerUp}
          onPointerCancel={longPress.onPointerCancel}
          onClickCapture={longPress.onClickCapture}
          className={cn(
            'group relative min-w-0 max-w-full rounded-lg px-2 py-1 text-[14.2px] leading-[19px] text-[var(--wa-text)]',
            'shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]',
            out ? 'bg-[var(--wa-out)]' : 'bg-[var(--wa-in)]',
            startsRun && (out ? 'wa-tail-out rounded-tr-none' : 'wa-tail-in rounded-tl-none'),
            // Room for the reaction that hangs off the bottom edge.
            message.reaction && 'mb-3.5',
          )}
        >
          {hasMenu ? (
            <button
              type="button"
              aria-label="Message actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              // The menu closes itself on any outside press, this chevron's own
              // included, before the click arrives. Remember whether it was
              // open at the press, so the click does not reopen what that press
              // just closed.
              onPointerDown={() => {
                menuWasOpen.current = menuOpen;
              }}
              onClick={(e) => {
                const wasOpen = menuWasOpen.current;
                menuWasOpen.current = false;
                if (wasOpen) return;
                const r = e.currentTarget.getBoundingClientRect();
                onOpenMenu(message, { x: r.left, y: r.bottom + 2 });
              }}
              className={cn(
                // Mouse only. A hidden control is a dead one: on touch the long
                // press opens the same menu, and a 0-opacity chevron there would
                // be a live 24px target that opens it on a stray tap.
                'absolute right-1 top-1 z-[1] hidden h-6 w-6 items-center justify-center rounded-full text-[var(--wa-meta)]',
                'md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 [@media(hover:none)]:!hidden',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                out ? 'bg-[var(--wa-out)]' : 'bg-[var(--wa-in)]',
              )}
            >
              <ChevronDown width={16} height={16} strokeWidth={2} />
            </button>
          ) : null}

          {out && (message.sentBy || message.via === 'template') ? (
            <p className="mb-0.5 flex items-center gap-1.5 pr-5 text-[11px] leading-4 text-[var(--wa-meta)]">
              {message.sentBy ? <span className="font-semibold">{firstName(message.sentBy.name)}</span> : null}
              {message.via === 'template' ? (
                <span className="rounded bg-black/[0.07] px-1 py-px text-[10px] font-medium uppercase tracking-wide">
                  Template
                </span>
              ) : null}
            </p>
          ) : null}

          {quote ? (
            <button
              type="button"
              onClick={() => onJumpTo(quote.id)}
              className={cn(
                'mb-1 block w-full min-w-0 rounded-md border-l-4 bg-black/[0.06] px-2 py-1 text-left',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                quoteIsOurs ? 'border-[var(--wa-quote-out)]' : 'border-[var(--wa-quote-in)]',
              )}
            >
              <span
                className={cn(
                  'block truncate text-xs font-semibold',
                  quoteIsOurs ? 'text-[var(--wa-green-strong)]' : 'text-[var(--wa-link)]',
                )}
              >
                {quoteIsOurs ? 'MDG' : contactName}
              </span>
              <span className="line-clamp-3 block text-[13px] text-[var(--wa-meta)] [overflow-wrap:anywhere]">
                {quoteWords(quote)}
              </span>
            </button>
          ) : null}

          {kind ? (
            <div className={cn(text && 'mb-1')}>
              <MessageMedia
                message={message}
                kind={kind}
                onOpenImage={onOpenImage}
                overlay={
                  overlayMeta ? <Meta message={message} tone="overlay" className="absolute bottom-1 right-1" /> : undefined
                }
              />
            </div>
          ) : null}

          {text ? (
            <p
              className={cn(
                'whitespace-pre-wrap [overflow-wrap:anywhere] [&_a]:text-[var(--wa-link)] [&_a]:underline',
                // Mouse and keyboard can select a message's words. On touch the
                // long press belongs to the actions sheet, and a native
                // selection starting under it would fight it: Copy is in there.
                'select-text [@media(hover:none)]:select-none',
              )}
            >
              <span className="sr-only">{out ? 'You: ' : `${contactName}: `}</span>
              {linkify(text)}
              {/* The room the time will sit in. */}
              <span aria-hidden className={cn('inline-block', out ? 'w-[4.75rem]' : 'w-12')} />
            </p>
          ) : null}

          {text ? (
            <Meta message={message} tone="normal" className="absolute bottom-1 right-2" />
          ) : !overlayMeta ? (
            <div className="mt-0.5 flex justify-end">
              <Meta message={message} tone="normal" />
            </div>
          ) : null}

          {message.reaction ? (
            <span
              role="img"
              aria-label={`They reacted ${message.reaction}`}
              className={cn(
                'absolute -bottom-3.5 flex items-center rounded-full bg-[var(--wa-in)] px-1.5 py-0.5 text-[15px] leading-none shadow-sm ring-1 ring-black/5',
                out ? 'right-2' : 'left-2',
              )}
            >
              {message.reaction}
            </span>
          ) : null}
        </div>

        {out && message.buttons.length > 0 ? (
          // Drawn as WhatsApp draws a template's buttons — full width under the
          // bubble, divided, in the brand blue — and, as there, not pressable
          // here: they are what the person sees, shown for reference.
          <ul
            className="mt-0.5 w-full overflow-hidden rounded-lg bg-[var(--wa-out)] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]"
            aria-label="Buttons the person sees under this message"
          >
            {message.buttons.map((label) => (
              <li
                key={label}
                className="flex items-center justify-center gap-1.5 border-t border-black/10 px-3 py-2 text-sm font-medium text-[var(--wa-link)] first:border-t-0"
              >
                {/* A link button opens a page, and WhatsApp draws it so. */}
                {opensLink(message) ? (
                  <ExternalLink width={14} height={14} strokeWidth={2} aria-hidden />
                ) : (
                  <CornerUpLeft width={14} height={14} strokeWidth={2} aria-hidden />
                )}
                {label}
              </li>
            ))}
          </ul>
        ) : null}

        {out && (failed || unknown) ? (
          <div className="mt-1 flex max-w-full flex-col items-end gap-0.5 text-right">
            <p
              role={failed ? 'alert' : 'status'}
              className={cn(
                'text-xs [overflow-wrap:anywhere]',
                failed ? 'text-danger-strong' : 'text-warning-strong',
              )}
            >
              {failed
                ? (pending?.error ?? message.error?.reason ?? 'That did not go through.')
                : (pending?.error ?? UNKNOWN_OUTCOME_NOTE)}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-x-1">
              {pending && failed ? (
                <button type="button" className={ACTION_BUTTON} onClick={() => onRetryPending(pending)}>
                  Try again
                </button>
              ) : null}
              {!pending && failed && canRetry(message) && !retried ? (
                <button type="button" className={ACTION_BUTTON} onClick={() => onRetryMessage(message)}>
                  Try again
                </button>
              ) : null}
              {!pending && failed && retried ? (
                <span className="px-2 text-xs text-[var(--wa-meta)]">Sent again</span>
              ) : null}
              {unknown ? (
                <button type="button" className={ACTION_BUTTON} onClick={onCheck}>
                  Check now
                </button>
              ) : null}
              {pending ? (
                <button
                  type="button"
                  className={cn(ACTION_BUTTON, 'text-text-muted')}
                  onClick={() => onRemovePending(pending)}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});

/** A stop, drawn the way WhatsApp draws a notice: centred, in a small tinted box, not as a bubble. */
export function StopNotice({ message }: { message: WhatsAppChatMessage }) {
  const note = stopNote(message);
  if (!note) return null;
  return (
    <div
      data-message-id={message.id}
      // An unrecorded stop is unread like any other message from them, and has
      // to be marked read when it has been seen — it has no bubble to carry this.
      data-unread-at={isUnreadInbound(message) ? message.at : undefined}
      className="my-2 flex justify-center"
    >
      <p
        role={note.urgent ? 'alert' : undefined}
        className={cn(
          'max-w-[90%] rounded-lg bg-[var(--wa-notice)] px-3 py-1.5 text-center text-xs shadow-sm md:max-w-[70%]',
          note.urgent ? 'font-medium text-danger-strong' : 'text-[var(--wa-notice-text)]',
        )}
      >
        {note.text}
        <span className="mt-0.5 block text-[11px] opacity-80">{clockTime(message.at)}</span>
      </p>
    </div>
  );
}
