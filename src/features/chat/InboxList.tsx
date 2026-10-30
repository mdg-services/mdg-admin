import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  CornerUpRight,
  Flag,
  ShieldAlert,
  Ticket,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/Badge';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { Skeleton } from '@/components/ui/Skeleton';
import type { InboxFilter } from '@/hooks/api/useConversations';
import { cn } from '@/lib/cn';
import type { Intent } from '@/lib/statusIntent';
import { aiInboxChip, dealerCodeLabel, ticketFlagLevel } from '@dk/shared';
import type { AiInboxChip, Conversation, TicketPriority } from '@dk/shared';

/*
 * The conversation list's parts: the view switcher at its top and one row per
 * conversation. The page owns which view is open and which row is selected.
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

const PRIORITY_INTENT: Record<TicketPriority, Intent> = {
  urgent: 'danger',
  high: 'warning',
  normal: 'neutral',
  low: 'info',
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

function PriorityPill({ priority }: { priority?: TicketPriority }) {
  if (!priority || priority === 'normal') return null;
  return <Badge intent={PRIORITY_INTENT[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
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
 * this one is cleared only by resolving the ticket.
 */
function TicketRowChip({ conversation }: { conversation: Conversation }) {
  const n = conversation.openTicketCount ?? 0;
  if (n <= 0) return null;
  return (
    <Badge intent="warning" title="An open ticket on this thread. Only resolving it closes it.">
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
 * the dealer's own last words), and state (priority, waiting, ticket, AI) on a
 * line of its own only when there is any. The state chips used to share the
 * preview's line, and three chips left the preview "₹8,…".
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
    (c.priority && c.priority !== 'normal') ||
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
            <PriorityPill priority={c.priority} />
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

const MORE_ICON: Partial<Record<InboxFilter, LucideIcon>> = {
  resolved: CheckCircle2,
  flagged: Flag,
  tickets: Ticket,
  ai: Zap,
  'ai-guard': ShieldAlert,
};

/** Views whose count is a call to act: a number on "More" when any is non-zero. */
const ALARM_VIEWS: InboxFilter[] = ['tickets', 'flagged', 'ai-guard'];

/**
 * The list's views: the three the team lives in as a segmented control under
 * the list's heading, and the other five behind "More" beside the heading
 * (`MoreViewsMenu`). They used to be a 224px column of their own beside the
 * list, which at a laptop's width was most of what the open chat lost.
 */
export function InboxViews({
  views,
  primary,
  value,
  counts,
  onChange,
}: {
  views: Array<{ key: InboxFilter; label: string }>;
  /** The views shown as segments, in order. */
  primary: InboxFilter[];
  value: InboxFilter;
  counts: Partial<Record<InboxFilter, number | undefined>>;
  onChange: (next: InboxFilter) => void;
}) {
  const label = (k: InboxFilter) => views.find((v) => v.key === k)?.label ?? k;
  return (
    <div className="border-b border-border px-3 pb-2.5">
      {/* A filter, not a set of tabs over panels: plain toggle buttons. */}
      <div role="group" aria-label="Inbox views" className="flex gap-0.5 rounded-lg bg-surface-2 p-0.5">
        {primary.map((k) => {
          const active = value === k;
          const count = counts[k];
          return (
            <button
              key={k}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(k)}
              className={cn(
                'flex h-8 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[13px] font-medium transition-colors duration-150',
                active ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text',
              )}
            >
              {label(k)}
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
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The views that are not segments, beside the list's heading. A view in here
 * that is open names itself on the trigger, so the list is never a mystery; one
 * that wants attention (an open ticket, a dropped chat, a guard mark) puts its
 * count on the trigger while shut.
 */
export function MoreViewsMenu({
  views,
  primary,
  value,
  counts,
  onChange,
}: {
  views: Array<{ key: InboxFilter; label: string }>;
  primary: InboxFilter[];
  value: InboxFilter;
  counts: Partial<Record<InboxFilter, number | undefined>>;
  onChange: (next: InboxFilter) => void;
}) {
  const more = views.filter((v) => !primary.includes(v.key));
  const activeMore = more.find((v) => v.key === value);
  const alarm = ALARM_VIEWS.reduce((n, k) => n + (counts[k] ?? 0), 0);
  const ActiveIcon = activeMore ? MORE_ICON[activeMore.key] : undefined;
  return (
    <Menu
      // The trigger's whole name, since `label` replaces what it shows.
      label={
        activeMore
          ? `View: ${activeMore.label}. More views`
          : alarm > 0
            ? `More views, ${alarm} need attention`
            : 'More views'
      }
      title="Views"
      align="end"
      // A button like "New" beside it. Its colour is set on the content: a class
      // on the trigger itself would lose to the variant's own (`cn` is clsx).
      triggerVariant="secondary"
      triggerSize="sm"
      trigger={
        <span
          className={cn(
            'inline-flex items-center gap-1.5',
            activeMore ? 'text-brand' : 'text-text-muted',
          )}
        >
          {ActiveIcon ? <ActiveIcon width={14} height={14} strokeWidth={1.9} aria-hidden /> : null}
          {activeMore ? activeMore.label : 'More'}
          {!activeMore && alarm > 0 ? (
            <span className="min-w-[18px] rounded-full bg-warning-soft px-1 text-center text-[11px] font-semibold tabular-nums leading-[18px] text-warning-strong">
              {alarm > 99 ? '99+' : alarm}
            </span>
          ) : null}
          <ChevronDown width={14} height={14} strokeWidth={1.9} aria-hidden />
        </span>
      }
    >
      {more.map((v) => {
        const Icon = MORE_ICON[v.key];
        const count = counts[v.key];
        return (
          <MenuItem
            key={v.key}
            selected={v.key === value}
            onSelect={() => onChange(v.key)}
            icon={Icon ? <Icon width={15} height={15} strokeWidth={1.75} /> : undefined}
          >
            <span className="flex items-center justify-between gap-3">
              <span>{v.label}</span>
              {typeof count === 'number' ? (
                <span className="tabular-nums text-text-muted">{count}</span>
              ) : null}
            </span>
          </MenuItem>
        );
      })}
    </Menu>
  );
}
