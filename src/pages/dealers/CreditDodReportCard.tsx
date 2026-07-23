import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Share2,
} from 'lucide-react';
import * as React from 'react';

import { Button, Dialog, useToast } from '@/components/ui';
import {
  useCreditDodSnapshot,
  useShareCreditDodSnapshot,
} from '@/hooks/api/useCreditDod';
import { ApiError } from '@/lib/api';
import { formatDate, inrFormat } from '@/lib/format';
import type { CreditDodRunOutput } from '@/types/serviceRun';

interface Props {
  output: CreditDodRunOutput;
  runId: string;
  /** Signed URL for the rendered card image (`credit_dod_card.png`). */
  cardImageUrl?: string;
}

export function CreditDodReportCard({ output, runId, cardImageUrl }: Props) {
  const toast = useToast();
  const { card } = output;

  const { data: snapshot } = useCreditDodSnapshot(output.snapshotId);
  const shareMutation = useShareCreditDodSnapshot(output.snapshotId, runId);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const alreadyShared = !!snapshot?.shared;

  async function onConfirmShare() {
    try {
      const result = await shareMutation.mutateAsync();
      toast.success(
        result?.alreadyShared ? 'Already shared' : 'Card shared with dealer',
      );
      setConfirmOpen(false);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to share';
      toast.error(msg);
    }
  }

  return (
    <div className="grid gap-4">
      {/* Card image on top, full width (capped), never overlapping. */}
      {cardImageUrl ? (
        <img
          src={cardImageUrl}
          alt="Credit & DOD card"
          className="h-auto w-full rounded-md border border-border bg-surface-2"
          style={{ maxWidth: 520 }}
        />
      ) : (
        <div
          className="flex h-40 w-full items-center justify-center rounded-md border border-dashed border-border bg-surface-2 text-xs text-text-muted"
          style={{ maxWidth: 520 }}
        >
          Card image not available
        </div>
      )}

      {/* Values as a single-column, wrap-safe definition list (label left,
          value right). Avoids the 2-up grid that overlapped in the modal. */}
      <dl className="rounded-md border border-border">
        <DefRow label="Due amount" value={inrFormat(card.dueAmount)} />
        <DefRow
          label="Due date"
          value={card.dueDate ? formatDate(card.dueDate) : '-'}
        />
        <DefRow label="Current limit" value={inrFormat(card.currentLimit)} />
        <DefRow label="Availed limit" value={inrFormat(card.availedLimit)} />
        <DefRow
          label="Available limit"
          value={inrFormat(card.availableLimit)}
        />
        <DefRow label="Form of limit" value={card.formOfLimit} />
      </dl>

      {output.openingCarriedForward ? (
        <div className="flex items-start gap-2 rounded-md border border-warning bg-warning-soft p-2.5 text-xs font-medium text-warning">
          <AlertTriangle
            width={14}
            height={14}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0"
            aria-hidden
          />
          <span>
            Due date is an estimate — look-back didn&apos;t reach a balance
            reset.
          </span>
        </div>
      ) : null}

      {/* Muted metadata block. */}
      <div className="grid gap-1.5 text-xs text-text-muted">
        {snapshot?.backdated ? (
          <MetaRow
            label="As of (back-dated)"
            value={snapshot.asOf ? formatDate(snapshot.asOf) : '-'}
          />
        ) : null}
        <MetaRow label="Risk category" value={output.riskCategory ?? '-'} />
        <MetaRow
          label="Window"
          value={
            <>
              {formatDate(output.window.fromDate)} &rarr;{' '}
              {formatDate(output.window.toDate)}
            </>
          }
        />
        {typeof output.transactionCount === 'number' ? (
          <MetaRow
            label="Transactions maintained"
            value={
              <span className="tabular-nums">
                {output.transactionCount.toLocaleString('en-IN')}
              </span>
            }
          />
        ) : null}
        <ReconcileIndicator
          reconciles={output.reconciles}
          receivable={output.totalReceivableReported}
        />
      </div>

      <div>
        {alreadyShared ? (
          <Button
            variant="secondary"
            disabled
            leftIcon={<Check width={14} height={14} strokeWidth={1.75} />}
          >
            Shared
          </Button>
        ) : (
          <Button
            onClick={() => setConfirmOpen(true)}
            leftIcon={<Share2 width={14} height={14} strokeWidth={1.75} />}
          >
            Share with dealer
          </Button>
        )}
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Share with dealer"
        description="Share this Credit & DOD card with the dealer's chat? This will message the dealer."
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={shareMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={onConfirmShare} loading={shareMutation.isPending}>
              Share
            </Button>
          </>
        }
      >
        {output.reconciles === false ? (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-warning bg-warning-soft p-2.5 text-xs font-medium text-warning">
            <AlertTriangle
              width={14}
              height={14}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0"
              aria-hidden
            />
            <span>
              This card did not reconcile with SDMS&apos;s own receivable —
              review before sharing.
            </span>
          </div>
        ) : null}
        <p className="text-sm text-text-muted">
          The rendered card and its values will be posted to the dealer&apos;s
          chat.
        </p>
      </Dialog>
    </div>
  );
}

function DefRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border px-3 py-2 text-sm last:border-b-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className="break-words text-right font-medium tabular-nums text-text">
        {value}
      </dd>
    </div>
  );
}

function MetaRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span>{label}</span>
      <span className="text-right text-text">{value}</span>
    </div>
  );
}

function ReconcileIndicator({
  reconciles,
  receivable,
}: {
  reconciles: boolean;
  receivable: number | null;
}) {
  const receivableText =
    receivable === null ? 'not reported' : inrFormat(receivable);
  return (
    <p
      className={
        reconciles
          ? 'mt-0.5 flex items-center gap-1.5 font-medium text-green-600'
          : 'mt-0.5 flex items-center gap-1.5 font-medium text-danger'
      }
    >
      {reconciles ? (
        <CheckCircle2 width={14} height={14} strokeWidth={1.75} />
      ) : (
        <AlertCircle width={14} height={14} strokeWidth={1.75} />
      )}
      {reconciles ? 'Reconciles' : 'Does not reconcile'} (SDMS receivable{' '}
      {receivableText})
    </p>
  );
}
