import { CheckCheck } from 'lucide-react';
import * as React from 'react';

import { Dialog } from '@/components/ui/Dialog';
import { formatDateTime } from '@/lib/format';
import type { Conversation, Message } from '@dk/shared';

interface MessageInfoDialogProps {
  /** The (live) message whose receipts are shown; null = closed. */
  message: Message | null;
  conversation: Conversation | null;
  onClose: () => void;
}

/**
 * Resolve receipt user ids to display rows. Dealer participants get their
 * names; any admin ids (not in the participant list) collapse into a single
 * "Support team" row — teammates' individual read state isn't surfaced.
 */
function receiptRows(ids: string[], conversation: Conversation | null): string[] {
  const rows: string[] = [];
  let hasSupport = false;
  for (const id of ids) {
    const participant = conversation?.participants?.find((p) => p.userId === id);
    if (participant) rows.push(participant.name ?? participant.title ?? 'Member');
    else hasSupport = true;
  }
  if (hasSupport) rows.push('Support team');
  return rows;
}

function ReceiptSection({
  title,
  icon,
  rows,
  emptyLabel,
}: {
  title: string;
  icon: React.ReactNode;
  rows: string[];
  emptyLabel: string;
}) {
  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-subtle">
        {icon}
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((name, i) => (
            <li key={`${name}-${i}`} className="text-sm text-text">
              {name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Read/delivered receipts for one of the current admin's own messages. */
export function MessageInfoDialog({
  message,
  conversation,
  onClose,
}: MessageInfoDialogProps) {
  let readRows: string[] = [];
  let deliveredRows: string[] = [];
  if (message) {
    const readIds = (message.readBy ?? []).filter(
      (id) => id && id !== message.senderId,
    );
    const readSet = new Set(readIds);
    const deliveredIds = (message.deliveredTo ?? []).filter(
      (id) => id && id !== message.senderId && !readSet.has(id),
    );
    readRows = receiptRows(readIds, conversation);
    deliveredRows = receiptRows(deliveredIds, conversation);
  }

  return (
    <Dialog open={!!message} onClose={onClose} title="Message info" size="sm">
      {message ? (
        <div className="space-y-4">
          <ReceiptSection
            title="Read by"
            icon={
              <CheckCheck
                width={14}
                height={14}
                strokeWidth={2}
                className="text-[#34b7f1]"
              />
            }
            rows={readRows}
            emptyLabel="No one yet"
          />
          <ReceiptSection
            title="Delivered to"
            icon={<CheckCheck width={14} height={14} strokeWidth={2} />}
            rows={deliveredRows}
            emptyLabel="No one else"
          />
          <p className="border-t border-border pt-3 text-xs text-text-subtle">
            Sent {formatDateTime(message.createdAt)}
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}
