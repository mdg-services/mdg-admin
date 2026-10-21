import { Pin } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';
import { INTENT_CLASSES, type Intent } from '@/lib/statusIntent';
import { WHATSAPP_STAGE_LABELS, type WhatsAppChatSummary } from '@dk/shared';

import { ChatAvatar } from './ChatAvatar';
import {
  badgeCount,
  chatTitle,
  hasName,
  hasUnread,
  isSystemPreview,
  listTime,
  stageIntent,
  tickFor,
} from './format';
import { Tick } from './Tick';

function Chip({ intent, children }: { intent: Intent; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] items-center whitespace-nowrap rounded-full px-1.5 text-[11px] font-medium',
        INTENT_CLASSES[intent],
      )}
    >
      {children}
    </span>
  );
}

export interface ChatListRowProps {
  chat: WhatsAppChatSummary;
  selected: boolean;
  /** Minute-resolution "now", so "14:02" turns into "Yesterday" without a refetch. */
  now: number;
  /** A message just arrived or went out in this chat: tint the row once. */
  flash: boolean;
  onOpen: (person: string) => void;
}

/**
 * One chat in the list, laid out as WhatsApp lays out a row: a round picture; the
 * name and, opposite it, the time; under them, ticks (when we spoke last) and a
 * one-line preview, with the unread count opposite.
 *
 * Memoised: the list refetches as messages arrive and every row would otherwise
 * redraw for one change. The row takes only plain values, so an unchanged chat
 * is the same object between fetches and is skipped.
 */
export const ChatListRow = React.memo(function ChatListRow({ chat, selected, now, flash, onOpen }: ChatListRowProps) {
  const unread = hasUnread(chat);
  const named = hasName(chat);
  const { last } = chat;
  const hasChips = chat.stage !== null || chat.needsReply || chat.optedOut || chat.unplacedStop;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(chat.person)}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          // 72px is WhatsApp's row; a phone gets the 44px floor from it and more.
          'flex min-h-[72px] w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
          selected ? 'bg-[var(--wa-selected)]' : 'hover:bg-surface-2',
          flash && 'wa-flash',
        )}
      >
        <ChatAvatar person={chat.person} name={named ? chat.name : null} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                'min-w-0 truncate text-base text-text',
                unread ? 'font-semibold' : 'font-normal',
                !named && 'tabular-nums',
              )}
            >
              {chatTitle(chat)}
            </span>
            <span
              className={cn(
                'shrink-0 text-xs tabular-nums',
                unread ? 'font-medium text-[var(--wa-green-strong)]' : 'text-text-subtle',
              )}
            >
              {listTime(last.at, now)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1 text-sm text-text-muted">
              {last.direction === 'out' ? (
                <Tick kind={tickFor(last.delivery)} size={14} className="text-[var(--wa-meta)]" />
              ) : null}
              <span className={cn('min-w-0 truncate', isSystemPreview(last) && 'italic')}>{last.preview}</span>
            </span>
            {chat.unread > 0 ? (
              <span
                aria-label={`${chat.unread} unread`}
                className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--wa-green-strong)] px-1.5 text-[11px] font-semibold leading-none text-white"
              >
                {badgeCount(chat.unread)}
              </span>
            ) : chat.markedUnread ? (
              <span
                role="img"
                aria-label="Marked as unread"
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--wa-green-strong)]"
              />
            ) : chat.pinned ? (
              <Pin
                width={14}
                height={14}
                strokeWidth={1.75}
                role="img"
                aria-label="Pinned"
                className="shrink-0 text-text-subtle"
              />
            ) : null}
          </span>
          {hasChips ? (
            <span className="mt-1 flex flex-wrap gap-1">
              {chat.stage ? <Chip intent={stageIntent(chat.stage)}>{WHATSAPP_STAGE_LABELS[chat.stage]}</Chip> : null}
              {chat.needsReply ? <Chip intent="warning">Needs reply</Chip> : null}
              {chat.optedOut || chat.unplacedStop ? (
                <Chip intent={chat.unplacedStop && !chat.optedOut ? 'danger' : 'neutral'}>Stopped</Chip>
              ) : null}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
});
