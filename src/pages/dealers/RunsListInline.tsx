import { Download } from 'lucide-react';
import * as React from 'react';

import {
  EmptyState,
  Skeleton,
  StatusChip,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  Dialog,
  Button,
} from '@/components/ui';
import { useRunDetail } from '@/hooks/api/useRunDetail';
import { useRunsQuery } from '@/hooks/api/useRuns';
import { formatDateTime, formatDuration } from '@/lib/format';
import type {
  CreditDodRunOutput,
  ServiceRunWithSteps,
} from '@/types/serviceRun';
import type { ServiceRun } from '@dk/shared';

import { CreditDodFailurePanel } from './CreditDodFailurePanel';
import { CreditDodReportCard } from './CreditDodReportCard';
import { RunStepTimeline } from './RunStepTimeline';

const CREDIT_DOD_SERVICE_ID = 'credit-dod-monitoring';
const CARD_IMAGE_FILENAME = 'credit_dod_card.png';

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:4000/api/v1';

interface Props {
  dealerId?: string;
  serviceId?: string;
}

export function RunsListInline({ dealerId, serviceId }: Props) {
  const { data, isLoading } = useRunsQuery({
    dealerId,
    serviceId,
    page: 1,
    pageSize: 25,
  });
  const [openRunId, setOpenRunId] = React.useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-4">
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }
  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        title="No runs yet"
        description="Once the service runs, results will appear here."
      />
    );
  }
  const openRun = openRunId
    ? data.items.find((r) => r.id === openRunId) ?? null
    : null;

  return (
    <>
      <Table>
        <THead>
          <TRow>
            <TH>Service</TH>
            <TH>Status</TH>
            <TH>Started</TH>
            <TH>Duration</TH>
          </TRow>
        </THead>
        <TBody>
          {data.items.map((r) => (
            <TRow key={r.id} clickable onClick={() => setOpenRunId(r.id)}>
              <TD className="font-medium">{r.serviceId}</TD>
              <TD>
                <StatusChip kind="run" value={r.status} />
              </TD>
              <TD className="text-text-muted">
                {formatDateTime(r.startedAt)}
              </TD>
              <TD className="text-text-muted">
                {formatDuration(r.durationMs)}
              </TD>
            </TRow>
          ))}
        </TBody>
      </Table>

      <Dialog
        open={!!openRunId}
        onClose={() => setOpenRunId(null)}
        title={openRun ? `Run ${openRun.id.slice(-8)}` : ''}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setOpenRunId(null)}>
            Close
          </Button>
        }
      >
        {openRunId ? (
          <RunDetail runId={openRunId} fallback={openRun} />
        ) : null}
      </Dialog>
    </>
  );
}

function RunDetail({
  runId,
  fallback,
}: {
  runId: string;
  fallback: ServiceRun | null;
}) {
  const { data, isLoading } = useRunDetail(runId, { pollWhileRunning: true });
  const run: ServiceRunWithSteps | null =
    (data as ServiceRunWithSteps | undefined) ??
    (fallback as ServiceRunWithSteps | null);

  if (!run) {
    return isLoading ? (
      <Skeleton className="h-40 w-full" />
    ) : (
      <p className="text-sm text-text-muted">Run not found.</p>
    );
  }

  const steps = run.steps ?? [];
  const artifacts = run.artifacts ?? [];

  // Token-gated legacy route; only usable as a fallback for older runs that
  // predate signed URLs (a plain <img>/<a> can't send a bearer token).
  const buildArtifactUrl = (artifactId: string) =>
    `${API_BASE_URL.replace(/\/$/, '')}/runs/${run.id}/artifacts/${artifactId}/download`;

  // Prefer the short-lived signed URL (no auth header needed); fall back to the
  // token-gated route only when the run predates `artifactUrls`.
  const resolveArtifactUrl = (artifactId: string) =>
    run.artifactUrls?.[artifactId] ?? buildArtifactUrl(artifactId);

  const cardArtifact = artifacts.find(
    (a) => a.filename === CARD_IMAGE_FILENAME,
  );
  const cardImageUrl = cardArtifact
    ? resolveArtifactUrl(cardArtifact.id)
    : undefined;

  const isCreditDod = run.serviceId === CREDIT_DOD_SERVICE_ID;
  const isCreditDodFailure =
    isCreditDod && (run.status === 'FAILED' || !run.output);

  return (
    <div className="grid gap-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Service" value={run.serviceId} />
        <Field
          label="Status"
          value={<StatusChip kind="run" value={run.status} />}
        />
        <Field label="Started" value={formatDateTime(run.startedAt)} />
        <Field label="Finished" value={formatDateTime(run.finishedAt)} />
        <Field label="Duration" value={formatDuration(run.durationMs)} />
        <Field label="Dealer" value={run.dealerId} />
      </div>

      {steps.length > 0 ? (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Steps
          </p>
          <RunStepTimeline steps={steps} />
        </section>
      ) : null}

      {run.error && !isCreditDodFailure ? (
        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Error
          </p>
          <pre className="overflow-auto rounded-md bg-surface-2 p-3 text-xs">
            {run.error.message}
            {run.error.stack ? `\n${run.error.stack}` : ''}
          </pre>
        </section>
      ) : null}

      {isCreditDodFailure ? (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Failure
          </p>
          <CreditDodFailurePanel
            run={run}
            buildArtifactUrl={resolveArtifactUrl}
          />
        </section>
      ) : (
        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Output
          </p>
          {isCreditDod && run.output ? (
            <CreditDodReportCard
              output={run.output as unknown as CreditDodRunOutput}
              runId={run.id}
              cardImageUrl={cardImageUrl}
            />
          ) : (
            <pre className="max-h-72 overflow-auto rounded-md bg-surface-2 p-3 text-xs">
              {JSON.stringify(run.output ?? null, null, 2)}
            </pre>
          )}
        </section>
      )}

      {artifacts.length > 0 ? (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Artifacts
          </p>
          <ul className="grid gap-2">
            {artifacts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {a.reportCode ?? a.filename}
                  </p>
                  <p className="text-xs text-text-muted">
                    {a.reportCode ? a.filename : null}
                    {a.reportCode && typeof a.size === 'number' ? ' · ' : ''}
                    {typeof a.size === 'number' ? formatBytes(a.size) : null}
                  </p>
                </div>
                <a
                  href={resolveArtifactUrl(a.id)}
                  download
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm font-semibold text-text hover:bg-surface-2"
                >
                  <Download width={14} height={14} strokeWidth={1.75} />
                  Download
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-text-subtle">
        {label}
      </p>
      <p className="text-text">{value}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}
