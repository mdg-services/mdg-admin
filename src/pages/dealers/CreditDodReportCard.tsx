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
import type {
  CreditDodRunOutput,
  ServiceRunArtifact,
} from '@/types/serviceRun';

const CARD_IMAGE_FILENAME = 'credit_dod_card.png';

interface Props {
  output: CreditDodRunOutput;
  artifacts: ServiceRunArtifact[];
  runId: string;
  buildArtifactUrl: (artifactId: string) => string;
}

export function CreditDodReportCard({
  output,
  artifacts,
  runId,
  buildArtifactUrl,
}: Props) {
  const toast = useToast();
  const { card } = output;

  const cardImage = artifacts.find((a) => a.filename === CARD_IMAGE_FILENAME);

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
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        {cardImage ? (
          <img
            src={buildArtifactUrl(cardImage.id)}
            alt="Credit & DOD card"
            className="w-full rounded-md border border-border bg-surface-2"
            style={{ maxWidth: 480 }}
          />
        ) : (
          <div
            className="flex h-40 w-full items-center justify-center rounded-md border border-dashed border-border bg-surface-2 text-xs text-text-muted"
            style={{ maxWidth: 480 }}
          >
            Card image not available
          </div>
        )}

        <div className="min-w-0 flex-1">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <ValueRow label="Due amount" value={inrFormat(card.dueAmount)} />
            <ValueRow
              label="Due date"
              value={card.dueDate ? formatDate(card.dueDate) : '-'}
            />
            <ValueRow
              label="Current limit"
              value={inrFormat(card.currentLimit)}
            />
            <ValueRow
              label="Availed limit"
              value={inrFormat(card.availedLimit)}
            />
            <ValueRow
              label="Available limit"
              value={inrFormat(card.availableLimit)}
            />
            <ValueRow label="Form of limit" value={card.formOfLimit} />
          </dl>

          <div className="mt-3 grid gap-1 text-xs text-text-muted">
            <p>Risk category: {output.riskCategory ?? '-'}</p>
            <p>
              Window: {formatDate(output.window.fromDate)} &rarr;{' '}
              {formatDate(output.window.toDate)}
            </p>
            <ReconcileIndicator
              reconciles={output.reconciles}
              receivable={output.totalReceivableReported}
            />
          </div>
        </div>
      </div>

      <div>
        {alreadyShared ? (
          <Button variant="secondary" disabled leftIcon={<Check width={14} height={14} strokeWidth={1.75} />}>
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

function ValueRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-text-subtle">
        {label}
      </dt>
      <dd className="font-medium text-text">{value}</dd>
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
          ? 'flex items-center gap-1.5 font-medium text-green-600'
          : 'flex items-center gap-1.5 font-medium text-danger'
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
