import { AlertCircle, DownloadCloud, Gauge, ImageOff, Plug, Truck } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  EmptyState,
  ImageLightbox,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useDealerServicesQuery } from '@/hooks/api/useDealerServices';
import {
  useCollectTtDensity,
  useTtDensitySummary,
  useTtRegisterDayPhotoUrl,
  useTtRegisterDays,
} from '@/hooks/api/useTtDensity';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatYmd, istTodayYmd } from '@/lib/format';
import {
  TT_REGISTER_ADMIN_BACKDATE_DAYS,
  dealerCodeLabel,
  type TtInvoiceSummary,
} from '@dk/shared';

import { DayMarkCalendar } from './ttDensity/DayMarkCalendar';
import { DensityHero } from './ttDensity/DensityHero';
import {
  adminEarliestMarkableYmd,
  canMarkDay,
  dayCellState,
  markedByLine,
  monthRange,
  paneSubtitle,
  type DayMark,
} from './ttDensity/format';
import { InvoicePdfDrawer } from './ttDensity/InvoicePdfDrawer';
import { InvoiceTable } from './ttDensity/InvoiceTable';
import { UploadDayPhotoDialog } from './ttDensity/UploadDayPhotoDialog';
import { useTtDensityRunWatcher } from './ttDensity/useTtDensityRunWatcher';
import type { DealerVaultPaneProps } from './types';

/**
 * A dealer's TT Density: the figure every tanker was certified at, and whether
 * the outlet's own register page was photographed each day.
 *
 * The order on screen is the order of importance and is not negotiable — the
 * densities are the top of the pane in the largest type the app has, because
 * they are the only reason the service exists. Everything under them is
 * provenance: which invoice each figure came from, the PDF behind it, and the
 * separate daily photo that has nothing to do with the portal at all.
 *
 * THE READ-ONLY CALLOUT IS PERMANENT AND NOT DISMISSIBLE. The portal screen this
 * service reads also carries Vehicle Condition, Check Ack Status and Acknowledge
 * Receipt, and acknowledging a receipt is a legal act by the dealer. We never
 * touch those three, and the guarantee has to be visible to the operator, not
 * only true in the collector. There is deliberately no Acknowledge control
 * anywhere in this pane in any state — a greyed-out one would imply we could
 * enable it.
 *
 * The register calendar renders even when the portal side is empty. A dealer who
 * has never been collected still sends their photo, and hiding the calendar
 * behind a fetch that has not happened would make a chore the dealer IS doing
 * look like one they are not.
 */

/** Which days the calendar's `?vault=` view opens on: this month, in IST. */
function currentMonth(todayYmd: string): { year: number; month: number } {
  return { year: Number(todayYmd.slice(0, 4)), month: Number(todayYmd.slice(5, 7)) };
}

export function DealerTtDensityPane({ dealer }: DealerVaultPaneProps) {
  const toast = useToast();
  const summaryQ = useTtDensitySummary(dealer.id);
  const collect = useCollectTtDensity(dealer.id);

  // No URL params reach a per-dealer vault pane, so the open invoice, the picked
  // day and the shown month are local. The pane itself is already addressable as
  // `?tab=data-vault&vault=tt-density`.
  const today = summaryQ.data?.today ?? istTodayYmd();
  const [shown, setShown] = React.useState(() => currentMonth(istTodayYmd()));
  const [selectedYmd, setSelectedYmd] = React.useState<string | null>(null);
  const [openInvoice, setOpenInvoice] = React.useState<TtInvoiceSummary | null>(null);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);

  // "Fetch invoices now" answers 202 and then drives a browser for about a
  // minute. Without this the pane would only ever re-read the figures that were
  // already on screen at the moment of the click, and a run that FAILED — wrong
  // SDMS credentials, most often — would never be reported at all.
  const runWatch = useTtDensityRunWatcher(dealer.id);

  const range = React.useMemo(() => monthRange(shown.year, shown.month), [shown]);
  const daysQ = useTtRegisterDays(dealer.id, range);
  const photoQ = useTtRegisterDayPhotoUrl(dealer.id, selectedYmd ?? undefined);

  // The month before the service was attached has nothing to say, so the arrows
  // stop there and its days render inert rather than as failures.
  const servicesQ = useDealerServicesQuery(dealer.id);
  const attachedAt = servicesQ.data?.find((s) => s.serviceId === 'tt-density')?.createdAt;
  const minYmd = attachedAt ? attachedAt.slice(0, 10) : dealer.onboardingDate.slice(0, 10);
  // The server refuses a photo for a day older than this, and the upload dialog
  // PUTs to the bucket before it posts the day — so offering a day past the
  // window would strand the operator's photograph in storage for a 400.
  const earliestMarkableYmd = adminEarliestMarkableYmd(today);

  const marks: Record<string, DayMark | undefined> = React.useMemo(() => {
    const out: Record<string, DayMark | undefined> = {};
    for (const day of daysQ.data ?? []) {
      if (day.status !== 'MARKED' || !day.markedAt) continue;
      out[day.businessDate] = {
        source: day.uploadedBy?.kind === 'admin' ? 'ADMIN' : 'DEALER',
        at: day.markedAt,
        byName: day.uploadedBy?.name ?? null,
      };
    }
    return out;
  }, [daysQ.data]);

  function runFetch() {
    collect.mutate(undefined, {
      onSuccess: (res) => {
        runWatch.watch(res.runId);
        toast.success(
          'Fetch queued — the portal takes about a minute. This pane refreshes when it lands.',
        );
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Could not start the fetch'),
    });
  }

  const fetching = collect.isPending || runWatch.busy;

  const fetchButton = (
    <Button
      variant="secondary"
      size="sm"
      loading={fetching}
      leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
      onClick={runFetch}
      className="w-full sm:w-auto"
    >
      Fetch invoices now
    </Button>
  );

  const readOnlyNotice = (
    <Callout intent="info">
      We only read this page. Vehicle Condition, Check Ack Status and Acknowledge
      are never touched — acknowledging a receipt is the dealer&apos;s own legal
      act.
    </Callout>
  );

  if (summaryQ.isLoading) {
    return (
      <div className="grid gap-4">
        {readOnlyNotice}
        <DensityHero products={[]} loading />
        <Card>
          <CardContent className="grid gap-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (summaryQ.isError) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load TT Density"
        description={
          summaryQ.error instanceof ApiError ? summaryQ.error.message : 'Please try again.'
        }
        cta={fetchButton}
      />
    );
  }

  const summary = summaryQ.data!;
  const failed = summary.lastOutcome === 'FAILED' || !!summary.lastFailure;
  const neverFetched = !summary.lastRunAt;
  const selectedMark = selectedYmd ? marks[selectedYmd] : undefined;

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text">TT Density</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            {paneSubtitle({
              invoiceCount: summary.invoiceCount,
              lastRunAt: summary.lastRunAt,
              failed,
              formatWhen: formatDateTime,
            })}
          </p>
        </div>
        {fetchButton}
      </div>

      {readOnlyNotice}

      {/* A failed refresh never blanks a good figure — the hero below renders
          the last known readings and this says the newest fetch did not land. */}
      {failed ? (
        <Card className="border-danger/40 bg-danger-soft/40">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle
              width={18}
              height={18}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-danger"
            />
            <div>
              <p className="text-sm font-semibold text-text">
                The latest fetch did not complete
              </p>
              <p className="text-sm text-text-muted">
                {summary.lastFailure?.reason ??
                  'The portal could not be read. Everything already captured is kept below.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <DensityHero products={summary.latest} />

      {summary.pdfFailedCount > 0 ? (
        <Callout intent="warning">
          {summary.pdfFailedCount === 1
            ? 'One invoice PDF was given up on after three attempts and needs an engineer.'
            : `${summary.pdfFailedCount} invoice PDFs were given up on after three attempts and need an engineer.`}
        </Callout>
      ) : null}

      {servicesQ.isSuccess && !attachedAt && neverFetched && summary.invoiceCount === 0 ? (
        /* The vault fails open when `GET /dealers/:id/services` errors, so this
           pane can be opened for a dealer that does not have the service. Left
           to the never-fetched state below, its Fetch button would post
           `/collect` and answer a red toast instead of naming the cause. */
        <Card>
          <CardContent className="p-4">
            <EmptyState
              icon={<Plug width={28} height={28} strokeWidth={1.75} />}
              title={`TT Density is not attached to ${dealerCodeLabel(dealer.code)}`}
              description="Attach it from the Services tab and this pane fills in."
            />
          </CardContent>
        </Card>
      ) : neverFetched && summary.invoiceCount === 0 ? (
        <Card>
          <CardContent className="p-4">
            <EmptyState
              icon={<Gauge width={28} height={28} strokeWidth={1.75} />}
              title="No tanker invoices captured yet"
              description={`Once TT Density runs for ${dealerCodeLabel(dealer.code)}, the Density@15 for each product appears here, with the invoice PDF behind every figure.`}
              cta={fetchButton}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-border p-4">
              <div>
                <p className="text-base font-semibold text-text">Tanker invoices</p>
                {/* The summary carries a fixed-length recent list, not the whole
                    history, so this counts what is actually below it — the badge
                    beside it prints the true total and would make any wider
                    claim visibly false. */}
                <p className="text-sm text-text-muted">
                  {summary.recent.length === 1
                    ? 'The last delivery.'
                    : `The last ${summary.recent.length} deliveries, newest first.`}
                </p>
              </div>
              <Badge intent="neutral" className="tabular-nums">
                {summary.invoiceCount.toLocaleString('en-IN')}{' '}
                {summary.invoiceCount === 1 ? 'invoice' : 'invoices'}
              </Badge>
            </div>

            {summary.recent.length === 0 ? (
              <EmptyState
                icon={<Truck width={28} height={28} strokeWidth={1.75} />}
                title="No tanker deliveries in this window"
                description={`The last fetch listed no invoices for ${dealerCodeLabel(dealer.code)}. A week without a tanker is an ordinary week.`}
              />
            ) : (
              <InvoiceTable invoices={summary.recent} onOpen={setOpenInvoice} />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="mb-3">
            <p className="text-base font-semibold text-text">
              Density register photos
            </p>
            <p className="text-sm text-text-muted">
              One photo of the outlet&apos;s own register page marks a day done.
            </p>
          </div>

          {daysQ.isError ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load the register photos"
              description={
                daysQ.error instanceof ApiError ? daysQ.error.message : 'Please try again.'
              }
              cta={
                <Button variant="secondary" size="sm" onClick={() => void daysQ.refetch()}>
                  Retry
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-[352px_minmax(0,1fr)] xl:items-start xl:gap-6">
              <div>
                <DayMarkCalendar
                  year={shown.year}
                  month={shown.month}
                  marks={marks}
                  minYmd={minYmd}
                  earliestMarkableYmd={earliestMarkableYmd}
                  todayYmd={today}
                  selectedYmd={selectedYmd}
                  onSelect={setSelectedYmd}
                  onMonthChange={(year, month) => {
                    setShown({ year, month });
                    setSelectedYmd(null);
                  }}
                  loading={daysQ.isLoading}
                />
                {!daysQ.isLoading && Object.keys(marks).length === 0 ? (
                  <p className="mt-3 text-xs text-text-subtle">
                    No register photos yet. The dealer sends one a day from their
                    app, or you can add one here.
                  </p>
                ) : null}
              </div>

              <SelectedDayPanel
                selectedYmd={selectedYmd}
                mark={selectedMark}
                todayYmd={today}
                minYmd={minYmd}
                earliestMarkableYmd={earliestMarkableYmd}
                dealerCode={dealer.code}
                photoUrl={photoQ.data?.viewUrl ?? null}
                photoLoading={photoQ.isLoading}
                onUpload={() => setUploadOpen(true)}
                onFullSize={() => setLightboxOpen(true)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <InvoicePdfDrawer
        dealerId={dealer.id}
        invoice={openInvoice}
        onClose={() => setOpenInvoice(null)}
        onFetch={runFetch}
        fetching={fetching}
      />

      {selectedYmd ? (
        <UploadDayPhotoDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          dealerId={dealer.id}
          businessDate={selectedYmd}
          replacing={!!selectedMark}
        />
      ) : null}

      <ImageLightbox
        open={lightboxOpen && !!photoQ.data}
        onClose={() => setLightboxOpen(false)}
        src={photoQ.data?.viewUrl ?? ''}
        alt={selectedYmd ? `Register page for ${formatYmd(selectedYmd)}` : 'Register page'}
        title={selectedYmd ? `Register page — ${formatYmd(selectedYmd)}` : undefined}
        downloadUrl={photoQ.data?.downloadUrl}
      />
    </div>
  );
}

/** The day a cell was clicked: its photo, who sent it, and what can be done about it. */
function SelectedDayPanel({
  selectedYmd,
  mark,
  todayYmd,
  minYmd,
  earliestMarkableYmd,
  dealerCode,
  photoUrl,
  photoLoading,
  onUpload,
  onFullSize,
}: {
  selectedYmd: string | null;
  mark: DayMark | undefined;
  todayYmd: string;
  minYmd: string;
  earliestMarkableYmd: string;
  dealerCode: string;
  photoUrl: string | null;
  photoLoading: boolean;
  onUpload: () => void;
  onFullSize: () => void;
}) {
  if (!selectedYmd) {
    return (
      <p className="text-sm text-text-muted">Pick a day to see its register photo.</p>
    );
  }

  const state = dayCellState(selectedYmd, mark, todayYmd, minYmd, earliestMarkableYmd);
  // One gate for both buttons: the route refuses a photo for a day outside the
  // window whether it is the first one or a replacement, and it refuses it only
  // AFTER the dialog has already put the bytes in the bucket.
  const canMark = canMarkDay(state);

  if (state === 'future') {
    return <p className="text-sm text-text-muted">Not yet — this day hasn&apos;t happened.</p>;
  }
  if (state === 'before-start') {
    return (
      <p className="text-sm text-text-subtle">
        Before TT Density started for {dealerCodeLabel(dealerCode)}.
      </p>
    );
  }

  if (!mark) {
    return (
      <div>
        <p className="text-sm font-medium text-text">
          {formatYmd(selectedYmd, { weekday: true })}
        </p>
        <div className="mt-2 flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-6 py-10 text-center">
          <ImageOff
            width={24}
            height={24}
            strokeWidth={1.75}
            className="text-text-subtle"
            aria-hidden
          />
          <p className="text-sm text-text-muted">No photo for this day</p>
        </div>
        {canMark ? (
          <Button className="mt-3 w-full sm:w-auto" onClick={onUpload}>
            Upload on the dealer&apos;s behalf
          </Button>
        ) : (
          <p className="mt-3 text-sm text-text-subtle">
            This day is closed — a register photo can only be filed for the last{' '}
            {TT_REGISTER_ADMIN_BACKDATE_DAYS} days. It stays counted as missing.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-text">
        {formatYmd(selectedYmd, { weekday: true })}
      </p>
      {photoLoading ? (
        <Skeleton className="mt-2 h-40 w-full rounded-md" />
      ) : photoUrl ? (
        <button
          type="button"
          onClick={onFullSize}
          className="mt-2 block w-full overflow-hidden rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          aria-label="See the register photo full size"
        >
          <img
            src={photoUrl}
            alt={`Register page for ${formatYmd(selectedYmd)}`}
            draggable={false}
            className="h-40 w-full object-cover"
          />
        </button>
      ) : (
        <p className="mt-2 text-sm text-text-muted">
          The photo could not be loaded. Try again in a moment.
        </p>
      )}

      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-muted">
        <span>
          {markedByLine(mark)} · {formatDateTime(mark.at)}
        </span>
        {mark.source === 'ADMIN' ? <Badge intent="info">Added by MDG</Badge> : null}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onFullSize} disabled={!photoUrl}>
          See full size
        </Button>
        {canMark ? (
          <Button variant="ghost" onClick={onUpload}>
            Replace photo
          </Button>
        ) : null}
      </div>
    </div>
  );
}
