import {
  AlertTriangle,
  Check,
  CornerUpRight,
  Flag,
  ShieldAlert,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { chipClass } from '@/features/inbox/chips';
import { TICKET_CHIPS, type TicketChip } from '@/features/inbox/desk';
import { cn } from '@/lib/cn';
import type { Intent } from '@/lib/statusIntent';
import { aiInboxChip, dealerCodeLabel, ticketFlagLevel } from '@dk/shared';
import type { AiInboxChip, Conversation, InboxTab } from '@dk/shared';

/*
 * The conversation list's parts: the two tabs at its top and one row per
 * conversation. The page owns which tab is open and which row is selected; the
 * rows of the Tickets tab are `features/inbox/TicketRows`.
 */

export function roleLabel(role?: Conversation['memberRole']): string {
  if (role === 'dealer-owner') return 'Owner';
  if (role === 'dealer-staff') return 'Manager';
  return '';
}

/** A short label for a conversation's member, e.g. "Asha · Manager". */
export function memberLabel(c: Conversation): string {
  const name = c.memberName?.trim();
  const title = c.memberTitle?.trim() || roleLabel(c.memberRole);
  if (name && title) return `${name} · ${title}`;
  if (name) return name;
  if (title) return title;
  return 'Member';
}

export function formatRelative(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]!.charAt(0);
  const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : '';
  return (first + last).toUpperCase();
}

/** Devanagari text is marked Hindi, so the browser picks the right shaping and line height. */
export function langOf(text: string | undefined | null): 'hi' | undefined {
  return text && /[ऀ-ॿ]/.test(text) ? 'hi' : undefined;
}

/**
 * Reply-SLA flag: how long the client has been waiting for a reply. Turns amber
 * at 1.5h and red at 3h so a slipping ticket draws the whole team's attention; a
 * ⚑ also shows when the ticket was auto-returned to the pool for a missed SLA.
 */
export function TicketFlagBadge({
  conversation,
  now,
}: {
  conversation: Conversation;
  now: number;
}) {
  const level = ticketFlagLevel(conversation.awaitingReplySince, now);
  if (level === 'none' && !conversation.flagged) return null;
  const intent: Intent = level === 'urgent' ? 'danger' : 'warning';
  const label =
    level === 'none'
      ? 'Returned'
      : `Waiting ${formatRelative(conversation.awaitingReplySince ?? undefined)}`;
  return (
    <Badge intent={intent}>
      <span className="inline-flex items-center gap-1">
        <Flag width={11} height={11} strokeWidth={2} aria-hidden />
        {label}
      </span>
    </Badge>
  );
}

/**
 * What the machine did on this thread, as a chip on the inbox row.
 *
 * SHAPE AND TEXT, never colour alone: each of the three carries its own glyph
 * and its own words, so the row still reads correctly to somebody who cannot
 * tell the amber from the red, and on the greyscale a cheap phone in bright sun
 * effectively is.
 *
 * The chip is an ADDITION to the row and replaces nothing. In particular the
 * preview stays the DEALER'S OWN QUESTION: the backend deliberately never writes
 * `lastMessagePreview` from an AI message.
 */
const AI_CHIP_ICON: Record<AiInboxChip, LucideIcon> = {
  replied: Check,
  passed_on: CornerUpRight,
  questioned: AlertTriangle,
};

function AiRowChip({ conversation }: { conversation: Conversation }) {
  const chip = aiInboxChip(conversation.ai);
  if (!chip) return null;
  const Icon = AI_CHIP_ICON[chip.chip];
  return (
    <Badge intent={chip.tone} title={chip.hint}>
      <span className="inline-flex items-center gap-1">
        <Icon width={11} height={11} strokeWidth={2} aria-hidden />
        {chip.label}
      </span>
    </Badge>
  );
}

/**
 * "This thread has an open ticket": a glyph and a count in words. Not the
 * Waiting flag — that one is a clock on a reply and answering clears it, where
 * this one is cleared only by closing the ticket.
 */
function TicketRowChip({ conversation }: { conversation: Conversation }) {
  const n = conversation.openTicketCount ?? 0;
  if (n <= 0) return null;
  return (
    <Badge intent="warning" title="An open ticket on this thread. Only closing it ends it.">
      <span className="inline-flex items-center gap-1">
        <Ticket width={11} height={11} strokeWidth={2} aria-hidden />
        {n === 1 ? 'Ticket' : `${n} tickets`}
      </span>
    </Badge>
  );
}

/**
 * One conversation in the list.
 *
 * THREE LINES, EACH WITH ONE JOB: who (name, role, when), what (the outlet and
 * the dealer's own last words), and state (waiting, ticket, AI) on a line of its
 * own only when there is any. The state chips used to share the preview's line,
 * and three chips left the preview "₹8,…".
 *
 * The outlet code rides on the row instead of a sticky header above each
 * outlet's rows: on a busy list half the lines were those headers.
 */
export const ConversationRow = React.memo(function ConversationRow({
  conversation: c,
  selected,
  now,
  onOpen,
}: {
  conversation: Conversation;
  selected: boolean;
  now: number;
  onOpen: (id: string) => void;
}) {
  const name = c.memberName?.trim() || roleLabel(c.memberRole) || 'Member';
  const role = c.memberName?.trim() ? c.memberTitle?.trim() || roleLabel(c.memberRole) : '';
  const unread = c.unreadByAdmin;
  const group = c.kind === 'manager';
  const preview = c.lastMessagePreview || 'No messages yet';
  const hasChips =
    c.flagged ||
    ticketFlagLevel(c.awaitingReplySince, now) !== 'none' ||
    (c.openTicketCount ?? 0) > 0 ||
    !!aiInboxChip(c.ai);

  return (
    <button
      type="button"
      onClick={() => onOpen(c.id)}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'focus-inset flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors duration-150',
        selected ? 'bg-selected' : 'hover:bg-surface-2',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          unread
            ? 'bg-brand text-text-inverse'
            : selected
              ? 'bg-surface text-text-muted'
              : 'bg-surface-2 text-text-muted',
        )}
      >
        {group ? <Users width={16} height={16} strokeWidth={1.9} /> : initials(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span
            className={cn('min-w-0 truncate text-sm text-text', unread ? 'font-semibold' : 'font-medium')}
            title={memberLabel(c)}
          >
            {name}
          </span>
          {role ? <span className="shrink-0 text-xs text-text-muted">{role}</span> : null}
          <span
            className={cn(
              'ml-auto shrink-0 pl-2 text-xs tabular-nums',
              unread ? 'font-semibold text-brand' : 'text-text-muted',
            )}
          >
            {formatRelative(c.lastMessageAt ?? c.updatedAt)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className="shrink-0 rounded bg-surface-2 px-1.5 py-px font-mono text-[11px] font-medium leading-4 text-text-muted">
            {dealerCodeLabel(c.dealerCode)}
          </span>
          <span
            lang={langOf(preview)}
            className={cn(
              'min-w-0 flex-1 truncate text-[13px] leading-5',
              unread ? 'text-text' : 'text-text-muted',
            )}
          >
            {preview}
          </span>
          {unread ? (
            <span className="h-2 w-2 shrink-0 rounded-full bg-brand">
              <span className="sr-only">Unread</span>
            </span>
          ) : null}
        </span>
        {hasChips ? (
          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            <TicketFlagBadge conversation={c} now={now} />
            <TicketRowChip conversation={c} />
            <AiRowChip conversation={c} />
          </span>
        ) : null}
      </span>
    </button>
  );
});

/** Three rows' worth of shape while the list loads, instead of a spinner in the middle. */
export function ConversationListSkeleton() {
  return (
    <div aria-busy aria-label="Loading conversations">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 border-b border-border px-4 py-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="grid flex-1 gap-2 pt-0.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-11/12" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The list's two tabs, as a segmented control under its heading: Tickets (the
 * work — what needs a person) and All chats (every conversation, to find one by
 * who it is). They were eight views over three statuses, behind a "More" menu;
 * with Pick up, Take over and the chat's own Resolve gone there is nothing left
 * to partition by.
 *
 * The number on Tickets is the ones that need a person right now — New, Waiting
 * or Late — the same number as the Inbox badge in the nav. The shield on All
 * chats is the AI guard's count, in the warning colour, and only while that tab
 * is not the one open: the guard is a security observation that no ticket
 * carries, and with the lenses' menu gone this is the one place the list says
 * so from the default tab. `children` is the chips row under the tabs, which
 * belongs to the same block so the two read as one control.
 */
export function InboxTabs({
  value,
  needsUs,
  guard,
  onChange,
  children,
}: {
  value: InboxTab;
  needsUs: number | undefined;
  guard: number | undefined;
  onChange: (next: InboxTab) => void;
  children?: React.ReactNode;
}) {
  const tabs: Array<{ key: InboxTab; label: string; count?: number; guard?: number }> = [
    { key: 'tickets', label: 'Tickets', count: needsUs },
    { key: 'chats', label: 'All chats', guard },
  ];
  return (
    <div className="border-b border-border px-3 pb-2.5">
      {/* A filter, not a set of tabs over panels: plain toggle buttons. */}
      <div role="group" aria-label="Which list" className="flex gap-0.5 rounded-lg bg-surface-2 p-0.5">
        {tabs.map(({ key, label, count, guard: marked }) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(key)}
              className={cn(
                // 44px below lg, where the list has the screen and is tapped.
                'flex h-11 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[13px] font-medium transition-colors duration-150 lg:h-8',
                active ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text',
              )}
            >
              {label}
              {typeof count === 'number' && count > 0 ? (
                <span
                  className={cn(
                    'min-w-[18px] shrink-0 rounded-full px-1 text-center text-[11px] font-semibold tabular-nums leading-[18px]',
                    active ? 'bg-brand text-text-inverse' : 'bg-border text-text-muted',
                  )}
                >
                  {count > 99 ? '99+' : count}
                </span>
              ) : null}
              {!active && typeof marked === 'number' && marked > 0 ? (
                <span
                  title={`${marked} marked by the AI guard`}
                  className="inline-flex min-w-[18px] shrink-0 items-center justify-center gap-0.5 rounded-full bg-warning-soft px-1 text-[11px] font-semibold tabular-nums leading-[18px] text-warning-strong"
                >
                  <ShieldAlert width={11} height={11} strokeWidth={2} aria-hidden />
                  {marked > 99 ? '99+' : marked}
                  <span className="sr-only"> marked by the AI guard</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}

/**
 * The chips under Tickets: every open ticket, the ones this admin is on, and the
 * closed ones. A count rides on a chip only once it is known.
 */
export function TicketChips({
  value,
  counts,
  onChange,
}: {
  value: TicketChip;
  counts: Partial<Record<TicketChip, number | undefined>>;
  onChange: (next: TicketChip) => void;
}) {
  return (
    <div className="mt-2 flex gap-1.5 overflow-x-auto">
      {TICKET_CHIPS.map((c) => {
        const count = counts[c.key];
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={value === c.key}
            onClick={() => onChange(c.key)}
            className={chipClass(value === c.key)}
          >
            {c.label}
            {typeof count === 'number' ? <span>· {count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The AI guard lens under All chats: the threads where somebody tried to plant a
 * figure in MDG's mouth or read the system instruction back out. It is a
 * security observation, not a piece of work, so it is a narrowing of All chats
 * and not a tab. Drawn only while it has something to show — or is on, so it can
 * be switched off.
 */
export function GuardChips({
  on,
  count,
  onChange,
}: {
  on: boolean;
  count: number | undefined;
  onChange: (next: boolean) => void;
}) {
  if (!on && !(count && count > 0)) return null;
  return (
    <div className="mt-2 flex gap-1.5 overflow-x-auto">
      {/* Not "All chats": that is the tab above, and two buttons of one name
          read as one. */}
      <button type="button" aria-pressed={!on} onClick={() => onChange(false)} className={chipClass(!on)}>
        Every chat
      </button>
      <button type="button" aria-pressed={on} onClick={() => onChange(true)} className={chipClass(on)}>
        <ShieldAlert width={13} height={13} strokeWidth={2} aria-hidden />
        AI guard
        {typeof count === 'number' ? <span>· {count}</span> : null}
      </button>
    </div>
  );
}
