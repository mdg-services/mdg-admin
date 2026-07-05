import { Check, CheckCheck, Clock, FileText } from 'lucide-react';

import { cn } from '@/lib/cn';
import type { Message } from '@dk/shared';

import { AttachmentPreview } from './AttachmentPreview';

interface MessageBubbleProps {
  message: Message;
  currentUserId: string;
  isLastOwn?: boolean;
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

export function MessageBubble({
  message,
  currentUserId,
}: MessageBubbleProps) {
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
          'max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm',
          own
            ? 'rounded-br-md bg-brand text-text-inverse'
            : adminSide
              ? 'rounded-br-md bg-brand-soft text-brand'
              : 'rounded-bl-md bg-surface-2 text-text',
        )}
      >
        {message.body ? (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
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
}
