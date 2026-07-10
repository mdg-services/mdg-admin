import { Check, CheckCheck, ChevronDown, Clock, FileText } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';
import { linkify } from '@/lib/linkify';
import { useLongPress } from '@/lib/useLongPress';
import type { Message, MessageReaction } from '@dk/shared';

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

/** Resolution notices and other automated lines render as a centered chip. */
function SystemMessage({ message }: { message: Message }) {
  if (!message.body) return null;
  return (
    <div className="flex w-full justify-center">
      <p className="max-w-[85%] rounded-full bg-surface-2 px-3 py-1 text-center text-xs text-text-muted">
        {message.body}
      </p>
    </div>
  );
}

/**
 * A report/record shared into the thread. Rendered as a centered summary card;
 * the file itself lives in the Reports panel (admins don't fetch signed URLs here).
 */
function CardMessage({ message }: { message: Message }) {
  const card = message.card!;
  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      {message.body ? (
        <p className="max-w-[80%] text-center text-xs text-text-muted">
          {message.body}
        </p>
      ) : null}
      <div className="flex w-full max-w-[85%] items-start gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-sm">
        <FileText
          width={16}
          height={16}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0 text-text-muted"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text">{card.title}</p>
          <p className="truncate text-xs text-text-subtle">
            {card.periodLabel ? `${card.periodLabel} · ` : ''}
            {card.recordType.toUpperCase()}
          </p>
        </div>
      </div>
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
}: MessageBubbleProps) {
  // Touch path into the same menu the hover chevron / right-click opens.
  // Hooks run before the card/system early returns to keep their order stable.
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

  if (message.card) {
    return <CardMessage message={message} />;
  }
  if (message.system) {
    return <SystemMessage message={message} />;
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
          'group relative max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm',
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
              'absolute right-1 top-1 rounded-full p-0.5 opacity-0 transition-opacity',
              'focus-visible:opacity-100 group-hover:opacity-100',
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
      {reactions.length > 0 ? (
        <div
          className={cn(
            'relative z-[1] -mt-2 flex flex-wrap gap-1',
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
                'flex items-center gap-0.5 rounded-full border bg-surface px-1.5 py-0.5 text-[13px] leading-none shadow-sm',
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
