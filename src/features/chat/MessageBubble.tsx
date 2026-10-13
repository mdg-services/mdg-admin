import { Check, CheckCheck, CheckCircle2, ChevronDown, ClipboardList, Clock } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/Badge';
import { OPEN_REQUEST_STATUS_LABEL, requestLabel } from '@/lib/chatAsk';
import { cn } from '@/lib/cn';
import { linkify } from '@/lib/linkify';
import { useLongPress } from '@/lib/useLongPress';
import type { DealerOpenRequest, Message, MessageAsk, MessageReaction } from '@dk/shared';

import { AttachmentPreview } from './AttachmentPreview';
import { replyPreviewText, replySenderLabel } from './replyPreview';

interface MessageBubbleProps {
  message: Message;
  currentUserId: string;
  isLastOwn?: boolean;
  /** True while the action menu is open for THIS message (chevron = toggle). */
  isMenuOpen?: boolean;
  /** Opens the message action menu at a viewport point. */
  onOpenMenu?: (message: Message, anchor: { x: number; y: number }) => void;
  /** Scrolls to (and flashes) the quoted original. */
  onJumpTo?: (messageId: string) => void;
  /** Opens the who-reacted dialog. */
  onOpenReactions?: (message: Message) => void;
  /**
   * The request this dealer message answered, while it waits for MDG to check it
   * (ADR 0019). Drawn as an "Answer to…" chip under the message. Handed in by the
   * thread, which reads the dealer's requests once — a bubble is memoised and
   * must not fetch.
   */
  pendingAnswer?: DealerOpenRequest;
  /** Where the request an ask notice carries stands, when the thread knows. */
  askStatus?: DealerOpenRequest['status'];
  /** Opens "Mark received" for this message — the chip's one tap. */
  onOpenAnswer?: (message: Message) => void;
}

/** WhatsApp-style delivery state for one of the current user's own messages. */
function MessageTicks({ message }: { message: Message }) {
  if (message.id.startsWith('tmp-')) {
    return <Clock width={12} height={12} strokeWidth={2} className="opacity-70" />;
  }
  const seen = (message.readBy ?? []).some((id) => id && id !== message.senderId);
  if (seen) {
    return (
      <CheckCheck width={13} height={13} strokeWidth={2} className="text-[#34b7f1]" aria-label="Read" />
    );
  }
  const delivered = (message.deliveredTo ?? []).some(
    (id) => id && id !== message.senderId,
  );
  if (delivered) {
    return <CheckCheck width={13} height={13} strokeWidth={2} aria-label="Delivered" />;
  }
  return <Check width={13} height={13} strokeWidth={2} aria-label="Sent" />;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Resolution notices and other automated lines render as a centered chip, with
 * whatever the notice carried above it.
 *
 * The attachments are not decoration. dsr-report/share.ts posts two card PNGs
 * on a `system: true` message, kavach/share.ts the score card and
 * creditDod/share.ts the position card — and this component used to render
 * `message.body` alone, so an admin watching the thread saw the covering note
 * and never the card that was shared with the dealer.
 *
 * Delivery ticks, the reply quote and the action menu stay off: an admin does
 * not answer a notice from here. But the DEALER can now react to one — their
 * app draws every notice as an ordinary picture message from MDG (ADR 0018) —
 * so a dealer's 👍 on the day's DSR is shown under it, read-only, and opens
 * the who-reacted list like any other. Leaving it off meant a dealer who
 * acknowledged a report was acknowledging it to nobody.
 */
function SystemMessage({
  message,
  currentUserId,
  askStatus,
  onOpenReactions,
}: {
  message: Message;
  currentUserId: string;
  askStatus?: DealerOpenRequest['status'];
  onOpenReactions?: (message: Message) => void;
}) {
  const reactions = message.reactions ?? [];
  // Was a plain `if (!message.body) return null`, which threw the images away
  // with the empty body. Only an empty notice — no text, no card and no request
  // — is nothing.
  if (!message.body && message.attachments.length === 0 && !message.ask) return null;
  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      {message.attachments.length > 0 ? (
        // AttachmentPreview owns its own ImageLightbox, so there is no
        // open-image handler to thread down from the bubble here.
        <div className="flex max-w-[85%] flex-wrap justify-center gap-2">
          {message.attachments.map((a) => (
            <AttachmentPreview key={a.storageKey} attachment={a} />
          ))}
        </div>
      ) : null}
      {message.ask ? <AskLabel ask={message.ask} status={askStatus} /> : null}
      {/* `rounded-lg`, not `rounded-full`: the pill shape is only right for a
          one-line note. A system message can run to a dozen lines — a
          bilingual service notice does — and a 9999px radius on a 152px-tall
          box cuts a curve straight through its own first and last lines.
          Left-aligned for the same reason: centred ragged text is fine for
          three words and unreadable for a paragraph. */}
      {message.body ? (
        <p className="max-w-[85%] rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-text-muted">
          {message.body}
        </p>
      ) : null}
      {reactions.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-1">
          {groupReactions(reactions, currentUserId).map((g) => (
            <button
              key={g.emoji}
              type="button"
              onClick={() => onOpenReactions?.(message)}
              aria-label={`${g.emoji} ${g.count}, see who reacted`}
              className="tap-target flex items-center gap-0.5 rounded-full border border-border bg-surface px-1.5 py-0.5 text-[13px] leading-none shadow-sm"
            >
              <span aria-hidden>{g.emoji}</span>
              {g.count > 1 ? (
                <span className="text-[11px] text-text-muted">{g.count}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * What an ask notice asked for, as a small label above its words.
 *
 * The notice's text is written for the dealer, in their language, and says
 * "tap Send photo". The admin reading the thread needs the plain fact — what is
 * being asked for, for which day — and, when the thread knows, whether the
 * dealer has answered. The title is the one the dealer saw.
 */
function AskLabel({
  ask,
  status,
}: {
  ask: MessageAsk;
  status?: DealerOpenRequest['status'];
}) {
  return (
    <div className="flex max-w-[85%] flex-col items-center gap-1 text-xs">
      {/* The glyph and the words are one unit: wrapped apart, a long title left
          the glyph alone on a line above it. */}
      <span className="flex items-start gap-1.5">
        <ClipboardList
          width={13}
          height={13}
          strokeWidth={1.75}
          className="mt-px shrink-0 text-text-muted"
          aria-hidden
        />
        <span className="min-w-0 font-medium text-text [overflow-wrap:anywhere]">
          Asked for: {ask.title}
          {ask.periodLabel ? (
            <span className="whitespace-nowrap font-normal text-text-muted">
              {' '}
              · {ask.periodLabel}
            </span>
          ) : null}
        </span>
      </span>
      {status ? (
        <Badge intent={status === 'sent' ? 'warning' : 'neutral'}>
          {OPEN_REQUEST_STATUS_LABEL[status]}
        </Badge>
      ) : null}
    </div>
  );
}

/** Group reactions into per-emoji chips, first-seen order, own flagged. */
function groupReactions(
  reactions: MessageReaction[],
  currentUserId: string,
): Array<{ emoji: string; count: number; mine: boolean }> {
  const order: string[] = [];
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of reactions) {
    let g = map.get(r.emoji);
    if (!g) {
      g = { emoji: r.emoji, count: 0, mine: false };
      map.set(r.emoji, g);
      order.push(r.emoji);
    }
    g.count += 1;
    if (r.userId === currentUserId) g.mine = true;
  }
  return order.map((e) => map.get(e)!);
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  currentUserId,
  isMenuOpen,
  onOpenMenu,
  onJumpTo,
  onOpenReactions,
  pendingAnswer,
  askStatus,
  onOpenAnswer,
}: MessageBubbleProps) {
  // Touch path into the same menu the hover chevron / right-click opens.
  // Hooks run before the system early return to keep their order stable.
  const openMenuAtPoint = React.useCallback(
    (point: { x: number; y: number }) => onOpenMenu?.(message, point),
    [message, onOpenMenu],
  );
  const longPress = useLongPress(openMenuAtPoint);

  // Chevron toggle: the menu closes itself on any outside pointerdown —
  // including one on the chevron — before this button's click fires. Capture
  // whether the menu was open at pointerdown (same event dispatch, so the
  // prop is still the pre-close value) and have the click only reopen when it
  // was not.
  const menuWasOpenRef = React.useRef(false);

  if (message.system) {
    return (
      <SystemMessage
        message={message}
        currentUserId={currentUserId}
        askStatus={askStatus}
        onOpenReactions={onOpenReactions}
      />
    );
  }

  // The admin inbox is a SHARED surface: every admin message — mine or a
  // teammate's — belongs on the right, so a thread reads "the support team" vs
  // "the client". `own` only drives colour + read ticks; a teammate's name is
  // shown above their bubble so you can tell which admin replied.
  const adminSide = message.senderRole === 'admin';
  const own = message.senderId === currentUserId;
  const showName = Boolean(message.senderName) && !own;
  const replyTo = message.replyTo;
  const reactions = message.reactions ?? [];

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-1',
        adminSide ? 'items-end' : 'items-start',
      )}
    >
      {showName ? (
        <span className="px-1 text-xs text-text-subtle">
          {message.senderName}
        </span>
      ) : null}
      <div
        className={cn(
          // 75% of a 328px list at 360px leaves ~222px of text box — about 30
          // characters, so messages wrap two lines earlier than they need to.
          // Desktop keeps its 75%.
          'group relative max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm md:max-w-[75%]',
          own
            ? 'rounded-br-md bg-brand text-text-inverse'
            : adminSide
              ? 'rounded-br-md bg-brand-soft text-brand'
              : 'rounded-bl-md bg-surface-2 text-text',
        )}
        onContextMenu={
          onOpenMenu
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
      >
        {onOpenMenu ? (
          <button
            type="button"
            aria-label="Message actions"
            onPointerDown={() => {
              menuWasOpenRef.current = !!isMenuOpen;
            }}
            onClick={(e) => {
              const wasOpen = menuWasOpenRef.current;
              menuWasOpenRef.current = false;
              if (wasOpen) return;
              const rect = e.currentTarget.getBoundingClientRect();
              onOpenMenu(message, { x: rect.left, y: rect.bottom + 2 });
            }}
            className={cn(
              // `hidden md:block` and not just an opacity gate: a 0-opacity
              // button is still a live ~18px target, so a stray tap on the
              // corner of any bubble silently opened this menu. Touch reaches
              // the same menu through the 450ms long-press on the bubble (see
              // the hint chip in MessageList).
              'absolute right-1 top-1 hidden rounded-full p-0.5 transition-opacity md:block',
              'md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100',
              own
                ? 'bg-brand-hover text-text-inverse'
                : adminSide
                  ? 'bg-brand-soft text-brand'
                  : 'bg-surface text-text-muted',
            )}
          >
            <ChevronDown width={14} height={14} strokeWidth={2} />
          </button>
        ) : null}
        {replyTo ? (
          <button
            type="button"
            onClick={() => onJumpTo?.(replyTo.messageId)}
            className={cn(
              'mb-1.5 flex w-full items-center gap-2 rounded-lg border-l-[3px] px-2 py-1 text-left',
              own ? 'border-white/70 bg-black/15' : 'border-brand bg-surface/70',
            )}
          >
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block truncate text-xs font-semibold',
                  own ? 'text-text-inverse' : 'text-brand',
                )}
              >
                {replySenderLabel(replyTo, currentUserId)}
              </span>
              <span
                className={cn(
                  'block truncate text-xs',
                  own ? 'text-text-inverse/85' : 'text-text-muted',
                )}
              >
                {replyPreviewText(replyTo)}
              </span>
            </span>
            {replyTo.imageUrl ? (
              <img
                src={replyTo.imageUrl}
                alt=""
                loading="lazy"
                className="h-9 w-9 shrink-0 rounded-md object-cover"
              />
            ) : null}
          </button>
        ) : null}
        {message.body ? (
          <p className="whitespace-pre-wrap break-words">
            {linkify(message.body)}
          </p>
        ) : null}
        {message.attachments.length > 0 ? (
          <div
            className={cn(
              'mt-2 flex flex-wrap gap-2',
              adminSide ? 'justify-end' : 'justify-start',
            )}
          >
            {message.attachments.map((a) => (
              <AttachmentPreview key={a.storageKey} attachment={a} />
            ))}
          </div>
        ) : null}
      </div>
      {pendingAnswer && onOpenAnswer ? (
        // The request a dealer's picture answered, waiting for MDG. A chip under
        // the message and not only a menu entry: the long-press is invisible, and
        // this is the one thing in the thread the admin has to do something about.
        // `text-warning-strong` at every width — it is a button, read outdoors —
        // and a real 44px target below md rather than a halo, since the reaction
        // chips just under it carry halos of their own.
        <button
          type="button"
          onClick={() => onOpenAnswer(message)}
          className="flex min-h-11 max-w-[85%] items-center gap-1.5 rounded-lg border border-warning bg-warning-soft px-2.5 py-1 text-left text-xs font-medium text-warning-strong [overflow-wrap:anywhere] md:min-h-0 md:max-w-[75%]"
        >
          <CheckCircle2
            width={13}
            height={13}
            strokeWidth={2}
            className="shrink-0"
            aria-hidden
          />
          <span className="min-w-0">
            Answer to: {requestLabel(pendingAnswer)} — mark received
          </span>
        </button>
      ) : null}
      {reactions.length > 0 ? (
        <div
          className={cn(
            // Tucked 8px into the bubble's edge at md. Below md it sits just
            // under the bubble instead: each chip's -12px tap halo reached up
            // over the bottom of a photo attachment, so a tap on the lower edge
            // of the picture opened Reactions rather than the photo.
            'relative z-[1] flex flex-wrap gap-1 md:-mt-2',
            adminSide ? 'justify-end pr-2' : 'pl-2',
          )}
        >
          {groupReactions(reactions, currentUserId).map((g) => (
            <button
              key={g.emoji}
              type="button"
              onClick={() => onOpenReactions?.(message)}
              aria-label={`${g.emoji} ${g.count}, see who reacted`}
              className={cn(
                // ~28×19 painted, and the only route to the who-reacted list.
                // It cannot grow — a 44px chip would swamp the bubble — so
                // `.tap-target` grows the hit area instead. Adjacent halos
                // overlap here and that is harmless: every chip on a message
                // opens the same dialog.
                'tap-target flex items-center gap-0.5 rounded-full border bg-surface px-1.5 py-0.5 text-[13px] leading-none shadow-sm',
                g.mine ? 'border-brand' : 'border-border',
              )}
            >
              <span aria-hidden>{g.emoji}</span>
              {g.count > 1 ? (
                <span className="text-[11px] text-text-muted">{g.count}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      <div
        className={cn(
          'flex items-center gap-1 px-1 text-[11px] text-text-subtle',
          adminSide ? 'flex-row-reverse' : '',
        )}
      >
        <span>{formatTime(message.createdAt)}</span>
        {own ? <MessageTicks message={message} /> : null}
      </div>
    </div>
  );
});
