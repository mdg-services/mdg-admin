import { AlertTriangle, CheckCircle2, Eye } from 'lucide-react';
import * as React from 'react';

import {
  EmptyState,
  ImageLightbox,
  MobileCardList,
  Skeleton,
  Spinner,
  StatusChip,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  Dialog,
  Button,
  DownloadButton,
} from '@/components/ui';
import { useCreditDodSnapshot } from '@/hooks/api/useCreditDod';
import { useRunDetail } from '@/hooks/api/useRunDetail';
import { useRunsQuery } from '@/hooks/api/useRuns';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { cn } from '@/lib/cn';
import { formatDateTime, formatDuration } from '@/lib/format';
import { describeRunFailure } from '@/lib/runFailure';
import { serviceLabel } from '@/lib/serviceLabel';
import type {
  CreditDodRunOutput,
  ServiceRunWithSteps,
} from '@/types/serviceRun';
import type { ServiceRun } from '@dk/shared';

import { CreditDodFailurePanel } from './CreditDodFailurePanel';
import {
  CreditDodReportCard,
  snapshotFromRunOutput,
} from './CreditDodReportCard';
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
  const isSuperAdmin = useIsSuperAdmin();
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

  const runName = (id: string) => (isSuperAdmin ? id : serviceLabel(id));

  // A `backfill` is a run one service started on another's behalf — the DSR
  // collecting the IRAS shift data it needs before it can report on a day.
  // Unlabelled it reads as an unexplained extra run sitting in the history right
  // beside the report that caused it. The parent is almost always on this same
  // page, so naming the service that asked for it costs no extra request; when
  // it isn't, the badge still says the run was automatic.
  const serviceOfRun = new Map(data.items.map((r) => [r.id, r.serviceId]));
  const backfillFor = (r: ServiceRun): string | null => {
    if (r.trigger !== 'backfill') return null;
    const parentService = r.parentRunId
      ? serviceOfRun.get(r.parentRunId)
      : undefined;
    return parentService ? `Auto · for ${serviceLabel(parentService)}` : 'Auto';
  };

  return (
    <>
      {/* Desktop table (≥ md) */}
      <div className="hidden md:block">
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
                <TD className="font-medium">
                  {runName(r.serviceId)}
                  <TriggerBadge label={backfillFor(r)} />
                </TD>
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
      </div>

      {/* Mobile card-stack (< md) */}
      <MobileCardList
        className="p-3"
        cards={data.items.map((r) => ({
          key: r.id,
          onClick: () => setOpenRunId(r.id),
          // `truncate` implies `white-space: nowrap`, and `TriggerBadge` is
          // itself `whitespace-nowrap` — so the badge was forced onto the same
          // line and clipped off every card. Its text ("Auto · for Daily Sales
          // Report") is the entire explanation of why a run nobody asked for is
          // sitting in the history, which is the reason the badge was written.
          primary: (
            <span className="block truncate font-medium text-text">
              {runName(r.serviceId)}
            </span>
          ),
          primaryRight: <StatusChip kind="run" value={r.status} />,
          meta: (
            <span className="flex flex-wrap items-center gap-x-1">
              <TriggerBadge label={backfillFor(r)} />
              <span>
                {formatDateTime(r.startedAt)} · {formatDuration(r.durationMs)}
              </span>
            </span>
          ),
        }))}
      />

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

/**
 * Run detail. A plain admin sees the OUTCOME only — the report card, or a calm
 * "in progress" / "didn't finish" / "completed" notice. Everything that
 * describes HOW the run went (steps, raw error + stack, raw output JSON, the
 * plugin slug, the dealer's ObjectId, diagnostic artifacts) is super-admin only.
 */
function RunDetail({
  runId,
  fallback,
}: {
  runId: string;
  fallback: ServiceRun | null;
}) {
  const isSuperAdmin = useIsSuperAdmin();
  const { data, isLoading } = useRunDetail(runId, { pollWhileRunning: true });
  /** The image artifact being looked at full-size, if any. */
  const [viewing, setViewing] = React.useState<{
    src: string;
    name: string;
    downloadUrl?: string;
  } | null>(null);
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
  // token-gated route only when the run predates `artifactUrls`. This one carries
  // `Content-Disposition: attachment`, so an <a download> to the bucket origin
  // actually saves instead of navigating — the `download` attribute alone is
  // ignored cross-origin.
  const resolveArtifactUrl = (artifactId: string) =>
    run.artifactUrls?.[artifactId] ?? buildArtifactUrl(artifactId);

  // The `inline` twin, for artifacts we render in place rather than hand over.
  const resolveArtifactViewUrl = (artifactId: string) =>
    run.artifactViewUrls?.[artifactId] ?? resolveArtifactUrl(artifactId);

  const cardArtifact = artifacts.find(
    (a) => a.filename === CARD_IMAGE_FILENAME,
  );
  const cardImageUrl = cardArtifact
    ? resolveArtifactViewUrl(cardArtifact.id)
    : undefined;

  const isCreditDod = run.serviceId === CREDIT_DOD_SERVICE_ID;
  // PENDING/RUNNING is not a failure — a credit-dod run legitimately has no
  // output until it finishes, so "no output" only means failure once it's done.
  const isInProgress = run.status === 'PENDING' || run.status === 'RUNNING';
  const isCreditDodFailure =
    isCreditDod && !isInProgress && (run.status === 'FAILED' || !run.output);
  const failureCopy = describeRunFailure(run);

  // A plain admin sees the run's DELIVERABLES (the API already withheld
  // everything diagnostic). Files the report card above already offers are
  // dropped so the same download isn't listed twice — but only when that card is
  // actually showing them, i.e. on a credit-dod run with output. A super-admin
  // keeps the full list: they use this dialog as the raw view of what the run
  // wrote, and the card's own links depend on a snapshot that may not resolve.
  const alreadyInReportCard = new Set(
    isCreditDod && run.output ? [CARD_IMAGE_FILENAME, 'pad_statement.html'] : [],
  );
  const visibleArtifacts = isSuperAdmin
    ? artifacts
    : artifacts
        .filter((a) => a.kind !== 'diagnostic')
        .filter((a) => !alreadyInReportCard.has(a.filename));

  return (
    <div className="grid gap-3 text-sm">
      {/* One column below md. Two 150px columns inside the Dialog cannot hold a
          24-character ObjectId, and `main` clips rather than scrolls. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-2">
        <Field
          label="Service"
          value={isSuperAdmin ? run.serviceId : serviceLabel(run.serviceId)}
        />
        <Field
          label="Status"
          value={<StatusChip kind="run" value={run.status} />}
        />
        <Field label="Started" value={formatDateTime(run.startedAt)} />
        <Field label="Finished" value={formatDateTime(run.finishedAt)} />
        <Field label="Duration" value={formatDuration(run.durationMs)} />
        {run.trigger === 'backfill' ? (
          <Field
            label="Started by"
            value="Another service, automatically — it needed this data"
          />
        ) : null}
        {isSuperAdmin ? (
          <Field label="Dealer" value={run.dealerId} identifier />
        ) : null}
        {isSuperAdmin && run.parentRunId ? (
          <Field label="Parent run" value={run.parentRunId} identifier />
        ) : null}
      </div>

      {isSuperAdmin && steps.length > 0 ? (
        <section>
          <SectionLabel>Steps</SectionLabel>
          <RunStepTimeline steps={steps} runStatus={run.status} />
        </section>
      ) : null}

      {isSuperAdmin && run.error && !isCreditDodFailure ? (
        <section>
          <SectionLabel>Error</SectionLabel>
          <pre className="scroll-pane overflow-auto rounded-md bg-surface-2 p-3 text-xs">
            {run.error.message}
            {run.error.stack ? `\n${run.error.stack}` : ''}
          </pre>
        </section>
      ) : null}

      {isInProgress ? (
        <RunStatusNotice
          tone="info"
          icon={<Spinner size={18} />}
          title={isCreditDod ? 'Collecting from SDMS…' : 'Running…'}
          hint={
            isCreditDod
              ? 'This usually takes about a minute. The report appears here as soon as it is ready.'
              : 'The result appears here as soon as the run finishes.'
          }
        />
      ) : isCreditDodFailure ? (
        <section>
          {isSuperAdmin ? <SectionLabel>Failure</SectionLabel> : null}
          <CreditDodFailurePanel
            run={run}
            buildArtifactUrl={resolveArtifactUrl}
            buildArtifactViewUrl={resolveArtifactViewUrl}
          />
        </section>
      ) : isCreditDod && run.output ? (
        <section>
          <SectionLabel>Report</SectionLabel>
          <CreditDodRunReport
            output={run.output as unknown as CreditDodRunOutput}
            runId={run.id}
            dealerId={run.dealerId}
            cardImageUrl={cardImageUrl}
          />
        </section>
      ) : run.status === 'FAILED' ? (
        // Super-admins already have the raw error above; everyone else gets the
        // plain-language version, keyed on the failure code the API serialises
        // for every role.
        isSuperAdmin && run.error ? null : (
          <RunStatusNotice
            tone="danger"
            icon={
              <AlertTriangle width={18} height={18} strokeWidth={1.75} />
            }
            title={failureCopy.title}
            hint={failureCopy.hint}
          />
        )
      ) : isSuperAdmin ? (
        <section>
          <SectionLabel>Output</SectionLabel>
          <pre className="scroll-pane max-h-72 overflow-auto rounded-md bg-surface-2 p-3 text-xs">
            {JSON.stringify(run.output ?? null, null, 2)}
          </pre>
        </section>
      ) : (
        <RunStatusNotice
          tone="success"
          icon={<CheckCircle2 width={18} height={18} strokeWidth={1.75} />}
          title="Completed successfully."
          hint={
            visibleArtifacts.length > 0
              ? 'The files produced by this run are listed below.'
              : 'Nothing needs your attention for this run.'
          }
        />
      )}

      {visibleArtifacts.length > 0 ? (
        <section>
          <SectionLabel>{isSuperAdmin ? 'Artifacts' : 'Downloads'}</SectionLabel>
          <ul className="grid gap-2">
            {visibleArtifacts.map((a) => (
              <li
                key={a.id}
                className="flex flex-col items-stretch gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 md:flex-row md:flex-wrap md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {a.reportCode ?? a.filename}
                  </p>
                  <p className="break-words text-xs text-text-muted">
                    {a.reportCode ? a.filename : null}
                    {a.reportCode && typeof a.size === 'number' ? ' · ' : ''}
                    {typeof a.size === 'number' ? formatBytes(a.size) : null}
                    {/* The disabled control's reason, on screen. It used to be a
                        `title`, which never fires on touch. */}
                    {run.artifactUrls?.[a.id] ? null : (
                      <span className="md:hidden">
                        {a.reportCode || typeof a.size === 'number' ? ' · ' : ''}
                        preparing a secure link
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/*
                    A failure screenshot is something you LOOK at. Offering only
                    a download meant an operator diagnosing a failed run had to
                    save a PNG and find it in Finder before they could see the
                    page the run died on — which is why the artifacts on this
                    dialog read as unopenable even though they downloaded fine.
                    The backend already signs an `inline` twin for every image.
                  */}
                  {a.contentType?.startsWith('image/') && run.artifactViewUrls?.[a.id] ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 md:flex-initial"
                      onClick={() =>
                        setViewing({
                          src: run.artifactViewUrls?.[a.id] ?? '',
                          name: a.filename,
                          downloadUrl: run.artifactUrls?.[a.id],
                        })
                      }
                      leftIcon={<Eye width={14} height={14} strokeWidth={1.75} />}
                    >
                      View
                    </Button>
                  ) : null}
                  {/*
                    Only ever offer a control that can actually fetch the file.
                    The signed URL needs no token; the legacy route needs a
                    bearer header a plain navigation cannot send, so pointing at
                    it produces a 401 and the appearance of a dead button. While
                    the detail request is still in flight we render the disabled
                    twin instead.

                    It was a cross-origin `<a href download>`: `download` is
                    ignored across origins, so in the shell the tap either
                    navigated the WebView off the SPA — tearing down this very
                    dialog — or did nothing and said nothing. On a failed run
                    these artifacts ARE the diagnosis.
                  */}
                  {run.artifactUrls?.[a.id] ? (
                    <DownloadButton
                      className="flex-1 md:flex-initial"
                      url={run.artifactUrls[a.id]}
                      filename={a.filename}
                      {...(a.contentType ? { contentType: a.contentType } : {})}
                      kind={
                        a.contentType?.startsWith('image/') ? 'image' : 'file'
                      }
                    />
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 md:flex-initial"
                      disabled
                    >
                      Preparing…
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ImageLightbox
        open={viewing !== null}
        onClose={() => setViewing(null)}
        src={viewing?.src ?? ''}
        alt={viewing?.name ?? ''}
        title={viewing?.name}
        downloadUrl={viewing?.downloadUrl}
      />
    </div>
  );
}

/**
 * The report as seen from a RUN. The card itself is snapshot-driven so it looks
 * and behaves identically to the one in Report history; this just resolves the
 * run's `output.snapshotId` to that snapshot, falling back to the run output
 * while the fetch is in flight (or if the snapshot was deleted).
 */
function CreditDodRunReport({
  output,
  runId,
  dealerId,
  cardImageUrl,
}: {
  output: CreditDodRunOutput;
  runId: string;
  dealerId: string;
  cardImageUrl?: string;
}) {
  const { data: snapshot, isPending } = useCreditDodSnapshot(output.snapshotId);
  const resolved = snapshot ?? snapshotFromRunOutput(output, { dealerId });
  return (
    <CreditDodReportCard
      snapshot={resolved}
      runId={runId}
      cardImageUrl={cardImageUrl}
      // The reconstruction can't know whether this report was already shared, so
      // suppress the action rather than risk offering "Share with dealer" on one
      // that already went out. `isPending` distinguishes "still loading" (which
      // resolves on its own) from "unavailable" (which does not), so the copy can
      // tell the admin the right thing.
      shareDisabled={snapshot ? undefined : isPending ? 'loading' : 'unavailable'}
    />
  );
}

/** Explains a run nobody pressed a button for. Renders nothing otherwise. */
function TriggerBadge({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <span className="ml-2 whitespace-nowrap rounded-full border border-border px-2 py-0.5 align-middle text-[11px] font-normal text-text-muted">
      {label}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
      {children}
    </p>
  );
}

/**
 * A calm one-line status for admins: what happened and what (if anything) to do
 * about it. Replaces the step timeline / raw error dump outside the super-admin
 * view.
 */
function RunStatusNotice({
  tone,
  icon,
  title,
  hint,
}: {
  tone: 'info' | 'success' | 'danger';
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md border p-4',
        tone === 'danger'
          ? 'border-danger bg-danger-soft'
          : 'border-border bg-surface-2',
      )}
    >
      <span
        className={cn(
          'mt-0.5 shrink-0',
          tone === 'danger'
            ? 'text-danger'
            : tone === 'success'
              ? 'text-success'
              : 'text-info',
        )}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm font-semibold',
            tone === 'danger' ? 'text-danger' : 'text-text',
          )}
        >
          {title}
        </p>
        <p className="mt-1 text-sm text-text-muted">{hint}</p>
      </div>
    </div>
  );
}

/**
 * `identifier` is `break-all`, not `break-words`: a 24-character hex ObjectId
 * has no break opportunity at all, so `break-words` leaves it overflowing its
 * own column and `main`'s `overflow-x-hidden` then makes it unreadable rather
 * than merely wide.
 */
function Field({
  label,
  value,
  identifier = false,
}: {
  label: string;
  value: React.ReactNode;
  identifier?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-text-subtle">
        {label}
      </p>
      <p
        className={cn(
          'min-w-0 break-words text-text',
          identifier && 'break-all font-mono',
        )}
      >
        {value}
      </p>
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
