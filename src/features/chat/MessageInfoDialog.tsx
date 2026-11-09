import { useQuery } from '@tanstack/react-query';
import { Check, CheckCheck, Clock } from 'lucide-react';
import * as React from 'react';

import { Dialog } from '@/components/ui/Dialog';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Conversation, Message } from '@dk/shared';

interface MessageInfoDialogProps {
  /** The (live) message whose receipts are shown; null = closed. */
  message: Message | null;
  conversation: Conversation | null;
  onClose: () => void;
}

/** One person in the chat, as `GET …/messages/:id/info` reports them. */
interface InfoPerson {
  userId: string;
  name: string;
  role: 'owner' | 'manager' | 'mdg';
  read: boolean;
  delivered: boolean;
  /** Null when the mark predates kept times (9 Nov 2026): who is known, not when. */
  readAt: string | null;
  deliveredAt: string | null;
}

interface MessageInfo {
  messageId: string;
  sentAt: string;
  people: InfoPerson[];
}

const ROLE_WORD: Record<InfoPerson['role'], string> = {
  owner: 'Owner',
  manager: 'Manager',
  mdg: 'MDG team',
};

/** The clock the way the chat's bubbles print it: "10:42 am". */
function clock(d: Date): string {
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "Today, 10:42 am" / "Yesterday, 6:05 pm" / "7 Nov 2026, 9:00 am" — WhatsApp's way. */
function when(iso: string | null): string {
  if (!iso) return 'Time not recorded';
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const daysAgo = Math.round((day(new Date()) - day(d)) / 86_400_000);
  if (daysAgo === 0) return `Today, ${clock(d)}`;
  if (daysAgo === 1) return `Yesterday, ${clock(d)}`;
  return formatDateTime(iso);
}

function PersonRow({ person, show }: { person: InfoPerson; show: 'read' | 'delivered' | 'none' }) {
  const primary =
    show === 'read' ? person.readAt : show === 'delivered' ? person.deliveredAt : null;
  return (
    <li className="flex items-start justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block truncate text-sm text-text">{person.name}</span>
        <span className="block text-xs text-text-subtle">{ROLE_WORD[person.role]}</span>
      </span>
      {show === 'none' ? null : (
        <span className="shrink-0 text-right text-xs tabular-nums">
          <span className={primary ? 'block text-text' : 'block text-text-subtle'}>
            {when(primary)}
          </span>
          {/* A reader's delivery time sits under it, as WhatsApp prints both. */}
          {show === 'read' && person.deliveredAt && person.deliveredAt !== person.readAt ? (
            <span className="block text-text-subtle">Delivered {when(person.deliveredAt)}</span>
          ) : null}
        </span>
      )}
    </li>
  );
}

function Section({
  title,
  icon,
  people,
  show,
}: {
  title: string;
  icon: React.ReactNode;
  people: InfoPerson[];
  show: 'read' | 'delivered' | 'none';
}) {
  if (people.length === 0) return null;
  return (
    <section>
      <h3 className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-subtle">
        {icon}
        {title}
      </h3>
      <ul className="divide-y divide-border">
        {people.map((p) => (
          <PersonRow key={p.userId} person={p} show={show} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Message info, like WhatsApp's: when it was sent, who has seen it and when,
 * who has it but has not opened it, and who has not got it yet. The outlet's
 * people come first; MDG's team appear once one of them has opened it.
 */
export function MessageInfoDialog({ message, conversation, onClose }: MessageInfoDialogProps) {
  const conversationId = conversation?.id;
  const messageId = message?.id;
  // The counts are in the key so a tick that turns blue while this is open
  // fetches the new times with it.
  const marks = `${message?.readBy?.length ?? 0}/${message?.deliveredTo?.length ?? 0}`;
  const info = useQuery({
    queryKey: ['message-info', conversationId, messageId, marks],
    queryFn: () =>
      api.get<MessageInfo>(`/conversations/${conversationId}/messages/${messageId}/info`),
    enabled: !!conversationId && !!messageId,
    placeholderData: (prev) => (prev?.messageId === messageId ? prev : undefined),
  });

  const people = info.data?.people ?? [];
  const outlet = (p: InfoPerson) => (p.role === 'mdg' ? 1 : 0);
  const sorted = [...people].sort((a, b) => outlet(a) - outlet(b));
  const read = sorted.filter((p) => p.read);
  const delivered = sorted.filter((p) => !p.read && p.delivered);
  const waiting = sorted.filter((p) => !p.read && !p.delivered);

  return (
    <Dialog open={!!message} onClose={onClose} title="Message info" size="sm">
      {message ? (
        <div className="space-y-4">
          <p className="flex items-center gap-1.5 text-sm text-text">
            <Check width={14} height={14} strokeWidth={2} className="text-text-subtle" />
            Sent {when(info.data?.sentAt ?? message.createdAt)}
          </p>
          {info.isLoading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : info.isError ? (
            <p className="text-sm text-danger">Could not load who has seen it. Try again.</p>
          ) : people.length === 0 ? (
            <p className="text-sm text-text-muted">Nobody else is in this chat yet.</p>
          ) : (
            <>
              <Section
                title="Seen"
                icon={
                  <CheckCheck width={14} height={14} strokeWidth={2} className="text-[#34b7f1]" />
                }
                people={read}
                show="read"
              />
              <Section
                title="Delivered, not seen"
                icon={<CheckCheck width={14} height={14} strokeWidth={2} />}
                people={delivered}
                show="delivered"
              />
              <Section
                title="Not delivered yet"
                icon={<Clock width={13} height={13} strokeWidth={2} />}
                people={waiting}
                show="none"
              />
              {read.some((p) => !p.readAt) || delivered.some((p) => !p.deliveredAt) ? (
                <p className="border-t border-border pt-3 text-xs text-text-subtle">
                  Times are kept from 9 Nov 2026. Earlier marks show who, not when.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
