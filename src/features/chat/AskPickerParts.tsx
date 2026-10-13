import { BookOpen, FileText, Paperclip, ShieldCheck, type LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { holdsAnotherAnswer, OPEN_REQUEST_STATUS_LABEL } from '@/lib/chatAsk';
import { cn } from '@/lib/cn';
import type { Attachment, ChatAskKind, DealerOpenRequest, Message } from '@dk/shared';

/** One glyph per kind of request, so the three read apart at a glance. */
export const REQUEST_KIND_ICON: Record<ChatAskKind, LucideIcon> = {
  document: FileText,
  register: BookOpen,
  kavach: ShieldCheck,
};

/** The badge beside a request: whose move it is. */
export function RequestStatusBadge({ status }: { status: DealerOpenRequest['status'] }) {
  return (
    <Badge intent={status === 'sent' ? 'warning' : 'neutral'}>
      {OPEN_REQUEST_STATUS_LABEL[status]}
    </Badge>
  );
}

/**
 * The dealer's picture or file, small, so the admin can see what they are about
 * to mark. With more than one on the message each is a button that picks which
 * one is filed (the server takes an attachment index); with one it is plain.
 */
export function AnswerPreview({
  message,
  indexes,
  selectedIndex,
  onSelect,
}: {
  message: Message;
  /** Positions of the pictures and files on the message — never a voice note. */
  indexes: number[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  if (indexes.length === 0) return null;
  const choosable = indexes.length > 1;
  return (
    <div>
      {choosable ? (
        <p className="mb-1 text-xs text-text-muted">
          This message has {indexes.length} pictures or files. Choose the one to file.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {indexes.map((i) => {
          const a: Attachment | undefined = message.attachments[i];
          if (!a) return null;
          const selected = i === selectedIndex;
          const body =
            a.kind === 'image' && a.url ? (
              <img
                src={a.url}
                alt={a.filename}
                className="h-20 w-20 rounded-md object-cover"
                loading="lazy"
              />
            ) : (
              <span className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-md bg-surface-2 px-2 text-center text-xs text-text-muted">
                <Paperclip width={16} height={16} strokeWidth={1.75} aria-hidden />
                <span className="line-clamp-2 break-all">{a.filename}</span>
              </span>
            );
          if (!choosable) {
            return (
              <div key={a.storageKey} className="overflow-hidden rounded-md border border-border">
                {body}
              </div>
            );
          }
          return (
            <button
              key={a.storageKey}
              type="button"
              aria-pressed={selected}
              aria-label={`File ${a.filename}`}
              onClick={() => onSelect(i)}
              className={cn(
                'overflow-hidden rounded-md border-2 p-0.5',
                selected ? 'border-brand' : 'border-transparent opacity-70',
              )}
            >
              {body}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A request's title with its day after it, the day kept whole — "11 Oct" is not
 * a place to break a line.
 */
export function RequestTitle({
  request,
}: {
  request: Pick<DealerOpenRequest, 'titleEn' | 'periodLabel'>;
}) {
  return (
    <>
      {request.titleEn}
      {request.periodLabel ? (
        <span className="whitespace-nowrap text-text-muted"> · {request.periodLabel}</span>
      ) : null}
    </>
  );
}

/**
 * One request as a radio row: what it is and whose move it is on one line. MDG's
 * own words, and a plain warning when a different photo is already waiting on it,
 * appear only once the row is the chosen one — four requests with a note and a
 * warning each pushed the date box off the bottom of the dialog.
 */
export function RequestRadio({
  name,
  request,
  checked,
  disabled,
  messageId,
  onChange,
}: {
  name: string;
  request: DealerOpenRequest;
  checked: boolean;
  disabled?: boolean;
  /** The message being acted on, to tell "this photo" from "another photo". */
  messageId: string | undefined;
  onChange: (ref: string) => void;
}) {
  const Icon = REQUEST_KIND_ICON[request.kind];
  const other = holdsAnotherAnswer(request, messageId);
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md border p-2.5',
        checked ? 'border-brand bg-brand-soft' : 'border-border bg-surface',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        type="radio"
        name={name}
        value={request.ref}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(request.ref)}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
      />
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex items-center gap-1.5">
            <Icon
              width={14}
              height={14}
              strokeWidth={1.75}
              className="shrink-0 text-text-muted"
              aria-hidden
            />
            <span className="text-sm font-medium text-text">
              <RequestTitle request={request} />
            </span>
          </span>
          <RequestStatusBadge status={request.status} />
        </span>
        {checked && request.note ? (
          <span className="mt-1 line-clamp-2 block text-xs text-text-muted" title={request.note}>
            MDG asked: {request.note}
          </span>
        ) : null}
        {checked && other ? (
          <span className="mt-1 block text-xs text-warning-strong md:text-warning">
            A different photo from the dealer is already waiting on this. Mark that one received, or
            send it back first.
          </span>
        ) : null}
      </span>
    </label>
  );
}
