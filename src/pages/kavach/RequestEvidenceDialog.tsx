import { PhoneCall, Send } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Callout,
  Dialog,
  HowThisWorks,
  Label,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  useKavachItemQuery,
  useRequestKavachEvidence,
} from '@/hooks/api/useKavachQueue';
import { ApiError } from '@/lib/api';
import {
  dealerCodeLabel,
  type KavachEvidenceMode,
  type KavachWorkQueueRow,
} from '@dk/shared';

/**
 * After this many asks in one cycle, the screen stops offering "ask again" as
 * though it were a plan. Three unanswered messages is not a dealer who missed
 * the notification; it is a dealer who needs a phone call, and an admin who
 * sends a fourth is spending their morning on something already known not to
 * work.
 */
const STOP_CHASING_AFTER = 3;

const EVIDENCE_ASK: Record<KavachEvidenceMode, string> = {
  NONE: 'confirmation',
  PHOTO: 'a photo',
  NOTE: 'a written note',
  PHOTO_OR_NOTE: 'a photo or a written note',
};

export interface RequestEvidenceDialogProps {
  open: boolean;
  onClose: () => void;
  /** Fired only after the ask actually reached the dealer, never on cancel. */
  onSent?: () => void;
  /** The row being chased. `null` renders nothing. */
  row: KavachWorkQueueRow | null;
}

/**
 * Ask the dealer to send us what we need, with an optional line of our own.
 *
 * Nothing sent from here scores anything. The ask opens (or re-opens) the
 * evidence exchange; whatever comes back still lands in an admin's queue to be
 * ruled on.
 */
export function RequestEvidenceDialog({
  open,
  onClose,
  onSent,
  row,
}: RequestEvidenceDialogProps) {
  const toast = useToast();
  const [message, setMessage] = React.useState('');
  const itemQ = useKavachItemQuery(row?.itemId, open);
  const request = useRequestKavachEvidence();

  // A fresh dialog per row: a message typed for one dealer must never ride along
  // to the next one the admin opens.
  React.useEffect(() => {
    if (open) setMessage('');
  }, [open, row?.itemId]);

  if (!row) return null;

  const askedCount = itemQ.data?.request.askedCount ?? 0;
  const overAsked = askedCount >= STOP_CHASING_AFTER;
  const wanted = EVIDENCE_ASK[row.evidence];

  async function handleSend() {
    if (!row) return;
    try {
      await request.mutateAsync({
        itemId: row.itemId,
        dealerId: row.dealerId,
        body: message.trim() ? { message: message.trim() } : {},
      });
      toast.success(`Asked ${dealerCodeLabel(row.dealerCode)} for ${wanted}`);
      onSent?.();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not send the request',
      );
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          Ask the dealer for evidence
          <HowThisWorks
            surface="admin-kavach-request-evidence"
            label="Ask the dealer for evidence"
            variant="icon"
          />
        </span>
      }
      description={`${row.labelEn} — ${dealerCodeLabel(row.dealerCode)}`}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={request.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSend()}
            loading={request.isPending}
            leftIcon={
              request.isPending ? null : (
                <Send width={16} height={16} strokeWidth={1.75} />
              )
            }
          >
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {itemQ.isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : itemQ.isError ? (
          <Callout intent="warning" onRetry={() => void itemQ.refetch()}>
            Could not read how many times we have already asked.
          </Callout>
        ) : overAsked ? (
          <Callout intent="warning">
            <span>
              We have asked {askedCount} times in this cycle and still have
              nothing. Phone the dealer instead — a fourth message is unlikely to
              land.
            </span>
          </Callout>
        ) : (
          <p className="text-sm text-text-muted">
            {askedCount === 0
              ? 'We have not asked for this yet in the current cycle.'
              : `Asked ${askedCount} ${askedCount === 1 ? 'time' : 'times'} in this cycle.`}
          </p>
        )}

        <p className="text-sm text-text">
          The dealer will be asked for{' '}
          <strong className="font-semibold">{wanted}</strong> for{' '}
          <strong className="font-semibold">{row.labelEn}</strong>.
        </p>

        <div>
          <Label htmlFor="kavach-ask-message" hint="optional">
            Extra line for the dealer
          </Label>
          <Textarea
            id="kavach-ask-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. A photo of the stock board taken after the evening dip."
            rows={3}
            maxLength={500}
          />
          <p className="mt-1 text-xs text-text-subtle">
            Shown to the dealer as written. Leave it blank for the standard ask.
          </p>
        </div>

        {overAsked ? (
          <p className="flex items-start gap-1.5 text-xs text-text-muted">
            <PhoneCall
              width={14}
              height={14}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0"
            />
            <span>
              You can still send this, but treat it as a record of the chase, not
              as the thing that gets it done.
            </span>
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
