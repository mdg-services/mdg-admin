import { User, Users } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/cn';
import { dealerCodeLabel } from '@dk/shared';
import type { Conversation } from '@dk/shared';

/*
 * How the inbox tells chats apart at a glance: by the outlet first, then by
 * which of the outlet's chats it is.
 *
 * Every outlet gets its own colour, worked out from its code, so 1E's chats
 * all wear the same tint wherever they sit in the list and 2E's wear another.
 * The two kinds of chat get a fixed colour each: indigo for the owners' chat,
 * teal for the managers' group. The words are always there too, so nothing
 * depends on telling the colours apart.
 */

/**
 * A stable hue for an outlet code. The golden angle spreads neighbours apart,
 * so 1E, 2E and 3E land on clearly different colours rather than three blues.
 */
export function outletHue(code: string | null | undefined): number {
  const s = (code ?? '').trim().toUpperCase();
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 100_003;
  return Math.round((h * 137.508) % 360);
}

function tintStyle(code: string | null | undefined): React.CSSProperties {
  return { '--outlet-h': String(outletHue(code)) } as React.CSSProperties;
}

/** The outlet code as a coloured square: the first thing a chat row shows. */
export function OutletTile({
  code,
  className,
}: {
  code: string | null | undefined;
  className?: string;
}) {
  const label = dealerCodeLabel(code);
  return (
    <span
      style={tintStyle(code)}
      className={cn(
        'outlet-tint flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold tabular-nums leading-none tracking-tight',
        label.length <= 3 ? 'text-[15px]' : label.length === 4 ? 'text-xs' : 'text-[10px]',
        className,
      )}
    >
      {label}
    </span>
  );
}

/** The outlet code as a small coloured chip, for rows that are not a chat (a ticket). */
export function OutletCodeChip({ code }: { code: string | null | undefined }) {
  return (
    <span
      style={tintStyle(code)}
      className="outlet-tint shrink-0 rounded px-1.5 py-px text-[11px] font-semibold leading-4 tabular-nums"
    >
      {dealerCodeLabel(code)}
    </span>
  );
}

/** More than one person of the outlet in it: the owners' chat once co-owners share it. */
function sharedOwnersChat(c: Pick<Conversation, 'kind' | 'participantUserIds'>): boolean {
  return c.kind !== 'manager' && (c.participantUserIds?.length ?? 0) > 1;
}

/** A chat several of the outlet's people read: the managers' group, or a shared owners' chat. */
export function isSharedChat(c: Pick<Conversation, 'kind' | 'participantUserIds'>): boolean {
  return c.kind === 'manager' || sharedOwnersChat(c);
}

/**
 * "Owners" when co-owners share the chat, else "Owner" (or that owner's own
 * title, such as "Partner"), or "Managers group".
 */
export function chatRoleWord(
  c: Pick<Conversation, 'kind' | 'memberTitle' | 'participantUserIds'>,
): string {
  if (c.kind === 'manager') return 'Managers group';
  if (sharedOwnersChat(c)) return 'Owners';
  const title = c.memberTitle?.trim();
  return title && title.toLowerCase() !== 'manager' ? title : 'Owner';
}

/** Which of the outlet's chats this is, as a coloured pill: right after the code. */
export function ChatRolePill({
  conversation: c,
}: {
  conversation: Pick<Conversation, 'kind' | 'memberTitle' | 'participantUserIds'>;
}) {
  const group = c.kind === 'manager';
  const Icon = group || sharedOwnersChat(c) ? Users : User;
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 text-[11px] font-semibold',
        group ? 'chat-group' : 'chat-owner',
      )}
    >
      <Icon width={11} height={11} strokeWidth={2.2} aria-hidden />
      {chatRoleWord(c)}
    </span>
  );
}

/** The people on a chat, by name: the owner, or everyone in a shared chat. */
export function chatPeople(c: Conversation): string {
  if (c.kind === 'manager' || sharedOwnersChat(c)) {
    const names = (c.participants ?? []).map((p) => p.name?.trim()).filter(Boolean);
    if (names.length > 0) return names.join(', ');
    const n = c.participantUserIds?.length ?? 0;
    if (n > 1) return `${n} people`;
  }
  return c.memberName?.trim() || 'Member';
}

/**
 * Does a chat match what was typed in the search box? A code matches from its
 * start ("1" finds 1E and 12E, "1e" only 1E); a name matches anywhere in it,
 * the owner's or any group member's.
 */
export function chatMatches(c: Conversation, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const code = (c.dealerCode ?? '').toLowerCase();
  if (code.startsWith(q.replace(/\s+/g, ''))) return true;
  const names = [c.memberName, ...(c.participants ?? []).map((p) => p.name)];
  return names.some((n) => !!n && n.toLowerCase().includes(q));
}

/** The same search on the Tickets tab: by the outlet's code, or by what the ticket is about. */
export function ticketMatches(
  t: { dealerCode?: string | null; summary?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if ((t.dealerCode ?? '').toLowerCase().startsWith(q.replace(/\s+/g, ''))) return true;
  return (t.summary ?? '').toLowerCase().includes(q);
}
