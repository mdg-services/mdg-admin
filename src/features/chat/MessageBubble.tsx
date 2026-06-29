import { Check, CheckCheck, Clock } from 'lucide-react';

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

export function MessageBubble({
  message,
  currentUserId,
}: MessageBubbleProps) {
  const own = message.senderId === currentUserId;

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-1',
        own ? 'items-end' : 'items-start',
      )}
    >
      {!own && message.senderName ? (
        <span className="px-1 text-xs text-text-subtle">
          {message.senderName}
        </span>
      ) : null}
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm',
          own
            ? 'rounded-br-md bg-brand text-text-inverse'
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
              own ? 'justify-end' : 'justify-start',
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
          own ? 'flex-row-reverse' : '',
        )}
      >
        <span>{formatTime(message.createdAt)}</span>
        {own ? <MessageTicks message={message} /> : null}
      </div>
    </div>
  );
}
