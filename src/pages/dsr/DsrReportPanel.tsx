import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileWarning,
  History,
  Share2,
} from 'lucide-react';
import * as React from 'react';


import { AssurancePanel } from '@/components/dsr/AssurancePanel';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DownloadButton,
  ImageLightbox,
  KeyValueList,
  WideReportViewer,
  useToast,
  type KeyValueItem,
} from '@/components/ui';
import { useAssuranceReport } from '@/hooks/api/useAssurance';
import { useShareDsr, type DsrReportView } from '@/hooks/api/useDsr';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import { isHolding, shareBlockedReason } from '@/lib/assurance';
import { cn } from '@/lib/cn';
import { formatDateTime, formatLitres } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import {
  bandParts,
  type DsrAdvisoryKind,
  type DsrDayRow,
  type DsrProductReport,
  type DsrTankReading,
  type DsrVariationSummary,
} from '@dk/shared';

import { DsrStaleNotice } from './DsrStaleNotice';

/** `YYYY-MM-DD` → `Thu, 23 Jul 2026`, read as a calendar date, not an instant. */
export function dsrDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * What the saved file should be called: outlet and day, not the S3 key.
 *
 * A signed artifact URL's last path segment is a storage key — `a1f3…-dsr.xlsx`
 * — and on a phone that is the name in the notification shade and in Downloads.
 * Naming it by the day it reports on is what makes two of them distinguishable
 * after the fact.
 */
export function dsrArtifactName(
  report: DsrReportView,
  ext: 'xlsx' | 'json',
): string {
  const code = report.outletCode || report.digest.outletCode || 'DSR';
  return `DSR-${code}-${report.businessDate}.${ext}`;
}

// Both out-of-limit kinds are `danger`: they are only ever reached when the
// variation is already outside the permissible band, which under guideline
// 5.1.11 draws samples either way. HIGH used to be `warning`, which read as the
// milder of the two — exactly backwards, since a positive variation suspends
// sales and supplies of all products immediately.
const ADVISORY_INTENT: Record<DsrAdvisoryKind, Intent> = {
  WITHIN_LIMIT: 'success',
  LOW: 'danger',
  HIGH: 'danger',
};

const ADVISORY_LABEL: Record<DsrAdvisoryKind, string> = {
  WITHIN_LIMIT: 'Within limit',
  LOW: 'Short beyond limit',
  HIGH: 'Over beyond limit',
};

interface Props {
  report: DsrReportView;
  /** Rendered top-right of the report hero header (download / regenerate). */
  actions?: React.ReactNode;
  /** How tall the inline HTML report should be. */
  frameClassName?: string;
}

/**
 * The report, output-first: the self-contained HTML deliverable fills the hero,
 * then the per-product stock-variation cards restate the headline the dealer
 * acts on. Data-quality warnings sit above both so a partial report is never
 * mistaken for a clean one.
 */
export function DsrReportPanel({
  report,
  actions,
  frameClassName = 'h-[72vh] min-h-[520px]',
}: Props) {
  const { digest } = report;

  return (
    // The `order-*` below md is the whole point of this being a flex column:
    // the day book itself is a wide sheet nothing can make narrow, so on a
    // phone the READABLE restatement of it leads and the sheet follows. At md
    // the sheet is on screen and legible, so every child goes back to source
    // order. Warnings carry no `order`, which keeps them at 0 and therefore
    // first in both shapes.
    <div className="flex flex-col gap-3 md:gap-4">
      {/* Above the warnings: "these figures no longer match their inputs" is a
          stronger caveat than "this figure was missing a nozzle". */}
      <DsrStaleNotice report={report} />

      <DsrWarningsBanner warnings={report.warnings} />

      {/* The deliverable itself — the hero. */}
      <Card className="order-2 overflow-hidden md:order-none">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5 md:px-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">
              Daily Sales Report
            </p>
            <p className="text-xs text-text-subtle">
              {dsrDateLabel(report.businessDate)}
              {report.outletCode ? ` · Outlet ${report.outletCode}` : ''}
            </p>
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
        {report.htmlUrl ? (
          // `p-3 md:p-0` — at md the frame stays flush to the card edge exactly
          // as it always has; below md the tap card needs its own gutter.
          <div className="p-3 md:p-0">
            <WideReportViewer
              kind="html"
              src={report.htmlUrl}
              title={`Daily Sales Report — ${dsrDateLabel(report.businessDate)}`}
              desktopHeightClass={frameClassName}
              // The full-screen view is a scaled picture of a spreadsheet, and
              // a picture of a spreadsheet is not a way to read one. The same
              // digest that leads the page goes into the sheet's own view, so
              // the numbers are reachable without closing it again.
              figures={<DsrFigureList report={report} />}
              preview={
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">
                    Open the day book full screen
                  </span>
                  <span className="mt-0.5 block text-xs text-text-subtle">
                    The sheet exactly as the dealer receives it. Every figure on
                    it is also listed below.
                  </span>
                </span>
              }
              actions={
                report.xlsxUrl ? (
                  <DownloadButton
                    url={report.xlsxUrl}
                    filename={dsrArtifactName(report, 'xlsx')}
                    kind="file"
                    variant="secondary"
                    label="Download Excel"
                  />
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center md:px-6 md:py-16">
            <FileWarning
              width={28}
              height={28}
              strokeWidth={1.75}
              className="text-text-subtle"
            />
            <p className="text-sm font-medium text-text">
              The rendered report is not available
            </p>
            <p className="max-w-sm text-sm text-text-muted">
              The HTML artifact could not be signed. The figures below still come
              straight from the generated report.
            </p>
          </div>
        )}
        {/* Desktop only. Below md the frame is not inline at all, so "open it in
            a new tab" has nothing to escape from — the tap card above IS the
            escape, and a 16px-tall text link would be under the touch floor. */}
        {report.htmlUrl ? (
          <div className="hidden border-t border-border px-4 py-2 text-right md:block">
            <a
              href={report.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
            >
              Open full report in a new tab
              <ExternalLink width={13} height={13} strokeWidth={1.75} />
            </a>
          </div>
        ) : null}
      </Card>

      {/* The figures, in a shape a phone can read. */}
      <DsrFigureList report={report} className="order-1 md:order-none" />

      {/* Supporting: per-product stock variation. Desktop only — below md
          every figure on these cards, the advisory included, is already in
          `ProductFigures` above, and printing them twice put roughly 900px of
          duplicate numbers under the report on a three-grade dealer. */}
      {digest.products.length > 0 ? (
        <div className="hidden md:block">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Stock variation
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {digest.products.map((p) => (
              <VariationCard key={p.productKey} variation={p.variation} />
            ))}
          </div>
        </div>
      ) : null}

      {/* The dealer deliverable: the two shareable cards + the share action. */}
      <DsrShareSection report={report} className="order-3 md:order-none" />
    </div>
  );
}

/**
 * The report's data-quality notes.
 *
 * Not a plain `<ul>`, because of how these notes are written: each one is
 * per-product and starts `MS: `, `HSD: `, `XP95: `, so a four-grade dealer with
 * ONE underlying problem gets four notes carrying the same three sentences,
 * differing only in the grade and the litres. On a 360px screen that is roughly
 * 240px of repeated prose standing between the top of the DSR tab and the first
 * figure on it. Below md the first note is shown in full and the rest wait
 * behind a toggle — the heading still states the real count, so nothing is
 * hidden without saying so.
 *
 * The branch is taken in JS rather than with a `md:` class so the toggle does
 * not exist at all from md up: a desktop shows every note, exactly as before.
 */
function DsrWarningsBanner({ warnings }: { warnings: string[] }) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const [showAll, setShowAll] = React.useState(false);
  if (warnings.length === 0) return null;

  const collapsible = !isMd && warnings.length > 1;
  const shown = collapsible && !showAll ? warnings.slice(0, 1) : warnings;
  const rest = warnings.length - 1;

  return (
    <div className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-sm text-warning">
      <AlertTriangle
        width={16}
        height={16}
        strokeWidth={1.75}
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0">
        <p className="font-medium">
          This report has {warnings.length} data-quality note
          {warnings.length === 1 ? '' : 's'}
        </p>
        <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
          {shown.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
        {collapsible ? (
          // Underlined rather than coloured: this sits on an amber ground in
          // amber text, and `text-brand` on `bg-warning-soft` is the one pairing
          // in the palette that stops looking like a link in sunlight.
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="inline-flex min-h-11 items-center font-medium underline underline-offset-2"
          >
            {showAll
              ? 'Show fewer notes'
              : `Show the other ${rest} note${rest === 1 ? '' : 's'}`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Every figure on the day book, restated natively — the other half of the
 * full-screen viewer above.
 *
 * The report is an HTML artifact we render but do not own: a spreadsheet-shaped
 * sheet with a dip, water-dip and stock column PER TANK (15E's diesel sits in
 * three) plus a meter column per nozzle. Nothing makes that narrow. Opening it
 * full screen gives it the whole device instead of a 296px slot, but it is
 * still a wide sheet being panned, and panning a sheet is not reading it.
 *
 * So the same numbers are also listed here, stacked, one block per product with
 * each tank stating itself — which is exactly what {@link DsrTankReading} exists
 * for. `Σ (stock)` over the tanks IS the row's opening stock; this discloses
 * what that figure is made of rather than offering a second, competing one.
 *
 * Below md only. At md the sheet itself is on screen and this would be the same
 * figures twice.
 */
function DsrFigureList({
  report,
  className,
}: {
  report: DsrReportView;
  className?: string;
}) {
  const { digest } = report;
  if (digest.products.length === 0) return null;
  return (
    <section className={cn('md:hidden', className)}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        The day&apos;s figures
      </p>
      <div className="grid gap-3">
        {digest.products.map((p) => (
          <ProductFigures
            key={p.productKey}
            product={p}
            businessDate={digest.businessDate}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * One tank's readings, whatever the row can tell us about them.
 *
 * Rows written before per-tank readings existed carry only the product-level
 * `dip` / `waterDip` / `openingStock`, which belong to the FIRST configured tank
 * that reported. Printing them under that tank's own number is honest; printing
 * blanks for every tank because the array is missing is not.
 */
function tankReadingsOf(row: DsrDayRow, tankNos: number[]): DsrTankReading[] {
  if (row.tanks && row.tanks.length > 0) return row.tanks;
  return [
    {
      tankNo: tankNos[0] ?? 0,
      dip: row.dip,
      waterDip: row.waterDip,
      stock: row.openingStock,
    },
  ];
}

/**
 * A figure that may not have arrived at all, said in words rather than printed.
 *
 * An absent figure is not the figure zero — a tank nobody dipped is not an empty
 * tank, and a nozzle that sent no reading is not a nozzle that sold nothing — so
 * the panel says so instead of showing a number that would be read as one.
 *
 * Non-finite counts as absent as well as `null`. The engine marks a missing
 * meter with `NaN`; the stored row and the wire carry that as `null` (JSON has
 * no `NaN`), and this guard covers both so neither path can ever print the
 * string "NaN" beside a real litre figure.
 */
function measured(
  value: number | null | undefined,
  render: (n: number) => string,
  absent = 'not measured',
): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? absent
    : render(value);
}

/**
 * A tank reading as whole centimetres, which is how the report prints it.
 *
 * IRAS hands back a float, and a raw one reached this panel: the admin read
 * `56.497299999999996 cm` beside a day book that printed `56` for the same tank.
 * Two answers for one figure is the fault this codebase keeps having to fix —
 * the screen a person checks against has to say what the deliverable says.
 * `renderDigestHtml`'s own `L()` rounds; so does this, and the two must not
 * drift apart.
 */
function cm(n: number): string {
  return `${Math.round(n)} cm`;
}

function ProductFigures({
  product,
  businessDate,
}: {
  product: DsrProductReport;
  businessDate: string;
}) {
  const rows = product.rows ?? [];
  // The report's own day, not simply the last row: `rows` is a window
  // [yesterday, today] and a regeneration can extend it backwards.
  const row = rows.find((r) => r.businessDate === businessDate) ?? rows.at(-1);
  const tankNos = product.tankNos ?? [];
  const v = product.variation;
  const tanks = row ? tankReadingsOf(row, tankNos) : [];
  // One tank needs no surface of its own to be told apart from anything, and
  // the heading "Tank 5" only repeats what the product's own subtitle already
  // says. Its dip and water dip fold into the day's list instead, ahead of the
  // stock they were read against — which also stops "Stock" appearing twice.
  //
  // `tankNos` is checked as well as the readings: a three-tank product where
  // only one tank reported still has to name which tank the dip came from, so
  // that case keeps its labelled block.
  const singleTank = tanks.length === 1 && tankNos.length <= 1;

  const dayItems: KeyValueItem[] = row
    ? [
        ...(singleTank
          ? [
              {
                key: 'dip',
                label: 'Dip',
                value: measured(tanks[0]!.dip, cm),
                numeric: true,
              },
              {
                key: 'water',
                label: 'Water dip',
                value: measured(tanks[0]!.waterDip, (n) => String(Math.round(n))),
                numeric: true,
              },
            ]
          : []),
        {
          key: 'stock',
          label: tankNos.length > 1 ? 'Stock, all tanks' : 'Stock',
          value: formatLitres(row.openingStock),
          numeric: true,
        },
        // A nozzle can reach the ledger with no reading at all — the portal
        // sent none, or the pump did not run — and that day's row stores it as
        // `null`. Printing it raw crashed this whole panel for 16E, whose dead
        // pumps report nothing every morning; printing it as 0 would have been
        // worse, since the meter is a lifetime totaliser and a zero there reads
        // as the pump having sold its entire throughput back.
        ...row.pumps.map((pump) => ({
          key: `nozzle-${pump.nozzleNo}`,
          label: `Nozzle ${pump.nozzleNo} meter`,
          value: measured(pump.reading, (n) => n.toLocaleString('en-IN'), 'no reading'),
          numeric: true,
        })),
        {
          key: 'receipt',
          label: 'Receipts today',
          value: formatLitres(row.receipt),
          numeric: true,
        },
        {
          key: 'testing',
          label: 'Testing today',
          value: formatLitres(row.testing),
          numeric: true,
        },
        {
          key: 'sales',
          label: "Today's sales",
          // A day's sales are the difference between its meters and the next
          // day's, so the current day is open until tomorrow's run closes it.
          // "—" would read as zero litres sold.
          value:
            row.sales === null
              ? 'closes on tomorrow’s report'
              : formatLitres(row.sales),
          numeric: true,
        },
        {
          key: 'cumulative',
          label: 'This month so far',
          value:
            row.cumulativeSales === null
              ? 'closes with the day'
              : formatLitres(row.cumulativeSales),
          numeric: true,
        },
      ]
    : [];

  const variationItems: KeyValueItem[] = [
    {
      key: 'variation',
      label: 'Stock variation',
      value: formatLitres(v.variation, { sign: true }),
      numeric: true,
    },
    {
      key: 'band',
      label: 'Permissible band',
      value: `± ${formatLitres(v.permissibleVariation)}`,
      numeric: true,
    },
    ...(v.variationNotWithinLimit !== 0
      ? [
          {
            key: 'outside',
            label: 'Outside the band',
            value: formatLitres(v.variationNotWithinLimit),
            numeric: true,
          },
        ]
      : []),
    {
      key: 'receipts-since',
      label: `Receipts since ${dsrDateLabel(v.sinceDate)}`,
      value: formatLitres(v.totalReceiptSinceInspection),
      numeric: true,
    },
    {
      key: 'testing-since',
      label: `Testing since ${dsrDateLabel(v.sinceDate)}`,
      value: formatLitres(v.totalTestSinceInspection),
      numeric: true,
    },
  ];

  return (
    <Card>
      {/* No `p-4` here: `cn` appends, and `p-4` is emitted after the
          primitive's own `p-3 md:p-4`, so passing it pinned the phone back to
          the desktop inset. The prop's default is already what this wants. */}
      <CardContent className="grid gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-text">
            {product.productLabelEn}
          </p>
          <p className="text-xs text-text-subtle">
            {dsrDateLabel(row?.businessDate ?? businessDate)}
            {tankNos.length > 0
              ? ` · tank ${tankNos.join(', ')}`
              : ''}
          </p>
        </div>

        {row ? (
          <>
            {singleTank
              ? null
              : tanks.map((t) => (
                  <div
                    key={t.tankNo}
                    className="rounded-md bg-surface-2 p-2.5 md:p-3"
                  >
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Tank {t.tankNo}
                    </p>
                    <KeyValueList
                      items={[
                        {
                          key: 'dip',
                          label: 'Dip',
                          value: measured(t.dip, cm),
                          numeric: true,
                        },
                        {
                          key: 'water',
                          label: 'Water dip',
                          value: measured(t.waterDip, (n) => String(Math.round(n))),
                          numeric: true,
                        },
                        {
                          key: 'stock',
                          label: 'Stock',
                          value: measured(t.stock, (n) => formatLitres(n)),
                          numeric: true,
                        },
                      ]}
                    />
                  </div>
                ))}
            <KeyValueList items={dayItems} />
          </>
        ) : (
          <p className="text-sm text-text-muted">
            This report has no ledger row for {dsrDateLabel(businessDate)}.
          </p>
        )}

        <div className="border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Stock variation
            </p>
            <Badge intent={ADVISORY_INTENT[v.advisory.kind]} className="shrink-0">
              {ADVISORY_LABEL[v.advisory.kind]}
            </Badge>
          </div>
          <KeyValueList items={variationItems} />
          <p className="mt-2 text-xs text-text-subtle">{bandNote(v)}</p>
          {/* The one sentence that says what to DO about the figures above.
              It used to live only on `VariationCard`, which is now desktop
              only, so it moves here rather than disappearing off the phone. */}
          <div
            className={cn(
              'mt-3 rounded-md px-3 py-2 text-sm',
              ADVISORY_INTENT[v.advisory.kind] === 'success'
                ? 'bg-success-soft text-success'
                : ADVISORY_INTENT[v.advisory.kind] === 'danger'
                  ? 'bg-danger-soft text-danger'
                  : 'bg-warning-soft text-warning',
            )}
          >
            <p className="font-medium">{v.advisory.messageHi}</p>
            <p className="mt-0.5 opacity-90">{v.advisory.messageEn}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The two cards the dealer receives (Variation + Daily Sales) with the
 * admin-approved Share action — the DSR twin of the Credit & DOD share card.
 * An admin reviews the images, then Share posts them plus a bilingual summary to
 * the dealer's chat. Idempotent: once shared, the button becomes a disabled
 * "Shared" with a timestamp.
 *
 * TWO GATES, NOT ONE. `alreadyShared` has always been here. The second is the
 * pre-send correctness check, and it exists because nothing posted to a dealer
 * can be recalled — there is no message delete and no message edit endpoint
 * anywhere. 1E's 2,646,765 L report was flagged, marked stale, and still one
 * confirm click from the dealer's phone. So a held report takes the button away
 * rather than warning beside it.
 */
function DsrShareSection({
  report,
  className,
}: {
  report: DsrReportView;
  className?: string;
}) {
  const toast = useToast();
  const share = useShareDsr(report.id);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const alreadyShared = !!report.shared;
  // Evaluated live rather than read off `report.assurance`: a re-baseline marks
  // an EXISTING report stale hours after it was generated, which is exactly how
  // 1E slipped through, so the stored verdict is not the last word. Same query
  // key as the panel below, so this costs no second request.
  //
  // A verdict we could not fetch is deliberately NOT a hold: `isHolding` is
  // false for a missing one. The server refuses on its own under ENFORCE and the
  // refusal arrives as a toast carrying the findings; taking Share away from
  // every dealer because one request failed would be the worse failure.
  const assuranceQ = useAssuranceReport(report.id);
  const held = isHolding(assuranceQ.data);
  // A verdict still IN FLIGHT is a different state from one that failed, and the
  // rule above covers only the second. While the request is outstanding we do not
  // yet know whether this report may be sent, and the honest reading of "do not
  // know" on the last click before something unrecallable is "wait".
  const verdictPending = assuranceQ.isPending;
  const shareBlocked = held || verdictPending;
  const blockedReason = held
    ? shareBlockedReason(assuranceQ.data)
    : 'Checking this report before it can be sent…';
  const cards: {
    url?: string;
    label: string;
    alt: string;
    /** What the mobile tile says it opens. */
    tapLabel: string;
    tapNote: string;
  }[] = [
    {
      url: report.variationCardUrl,
      label: 'Stock variation',
      alt: 'DSR stock-variation card',
      tapLabel: 'Open the stock-variation card',
      tapNote: 'The card the dealer receives, with real zoom.',
    },
    {
      url: report.salesCardUrl,
      label: 'Daily sales',
      alt: 'DSR daily-sales card',
      tapLabel: 'Open the day book',
      tapNote: 'The eight-column daily-sales card, with real zoom.',
    },
  ];
  const haveImages = cards.some((c) => c.url);
  // Branched in JS, not with `md:hidden`: a CSS branch keeps both trees mounted,
  // and the inline one holds two <img> that a phone would then fetch for a card
  // it is never shown. These artifacts are hundreds of KB on a 2G connection.
  const isMd = useMediaQuery('(min-width: 768px)');
  // Pinch zoom is off app-wide, so a card shown at column width cannot be read
  // closely at either size. Tapping one used to be a `target="_blank"` the shell
  // hands to the OS — i.e. it left the report mid-review. The lightbox keeps
  // the review in the app and gives the artwork real zoom.
  const [viewing, setViewing] = React.useState<{
    url: string;
    label: string;
    alt: string;
  } | null>(null);

  async function onConfirm() {
    // Re-checked at the moment of the click, not only when the dialog opened.
    // The verdict refetches on window focus, so a report can become held while
    // this dialog sits open — and `disabled` on the button that OPENED it does
    // nothing about the button inside it. The server refuses too, but this is the
    // last click before a message that cannot be deleted or edited.
    if (isHolding(assuranceQ.data)) {
      setConfirmOpen(false);
      toast.error(shareBlockedReason(assuranceQ.data) ?? 'This report is being withheld.');
      return;
    }
    try {
      const result = await share.mutateAsync();
      toast.success(
        result?.alreadyShared
          ? 'This report had already been shared with the dealer.'
          : 'Cards shared with the dealer.',
      );
      setConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to share');
    }
  }

  return (
    <div className={className}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Share with dealer
      </p>
      <Card>
        <CardContent className="grid gap-3 md:gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            {cards.map(({ url, label, alt, tapLabel, tapNote }) =>
              url ? (
                isMd ? (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setViewing({ url, label, alt })}
                    aria-label={`Open the ${label.toLowerCase()} card full size`}
                    className="block w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <img
                      src={url}
                      alt={alt}
                      draggable={false}
                      className="h-auto w-full rounded-md border border-border bg-surface-2"
                    />
                  </button>
                ) : (
                  // A LABELLED TILE, NOT A THUMBNAIL. These cards are rendered
                  // at a desktop width and were being drawn ~310px wide here, so
                  // the day book's eight columns of type landed at 2-3 CSS px —
                  // grey mush, with pinch-zoom off app-wide and no way to tell
                  // from it whether the figures are right. The renderer has a
                  // phone stylesheet now, so a freshly generated card is fine,
                  // but every card already in the vault is not, and an
                  // unreadable preview is worse than none: it invites an
                  // approve-without-reading. The tile says what it opens and the
                  // lightbox behind it is where the card can actually be read.
                  <button
                    key={label}
                    type="button"
                    onClick={() => setViewing({ url, label, alt })}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-left hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-text">
                        {tapLabel}
                      </span>
                      <span className="mt-0.5 block text-xs text-text-subtle">
                        {tapNote}
                      </span>
                    </span>
                    <ChevronRight
                      width={18}
                      height={18}
                      strokeWidth={1.75}
                      aria-hidden
                      className="shrink-0 text-text-subtle"
                    />
                  </button>
                )
              ) : (
                <div
                  key={label}
                  className="flex h-24 items-center justify-center rounded-md border border-dashed border-border bg-surface-2 px-4 text-center text-xs text-text-muted md:h-40"
                >
                  The {label.toLowerCase()} card will be generated when you
                  share.
                </div>
              ),
            )}
          </div>

          {/* The dealer already has an EARLIER version of this day, and a
              regeneration is what took the "Shared" chip away. Saying so here is
              the difference between the operator remembering to re-share a
              corrected report and the dealer acting on the old figures. */}
          {!alreadyShared && report.sharedSuperseded ? (
            <div className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-sm text-warning">
              <History width={16} height={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">
                  The dealer already has an older version of this report
                </p>
                <p className="mt-0.5">
                  Shared {formatDateTime(report.sharedSuperseded.at)}, and rebuilt since
                  ({formatDateTime(report.sharedSuperseded.supersededAt)}). Share it again so they
                  are looking at the corrected figures — and tell them what changed.
                </p>
              </div>
            </div>
          ) : null}

          {/* What the check made of these figures — the detail behind the
              disabled button below, and the place the release form lives. */}
          <AssurancePanel report={report} />

          {/* min-w-0: this is a grid item, and a grid track is sized by its
              item's min-content — a long withheld-reason sentence otherwise
              widens the card past `main`, which is `overflow-x-hidden`, so the
              overhang is clipped rather than scrollable. */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {alreadyShared ? (
                <>
                  <Button
                    variant="secondary"
                    disabled
                    leftIcon={<Check width={14} height={14} strokeWidth={1.75} />}
                  >
                    Shared
                  </Button>
                  <span className="text-xs text-text-subtle">
                    {formatDateTime(report.shared?.at)}
                  </span>
                </>
              ) : (
                <>
                  <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={shareBlocked}
                    leftIcon={<Share2 width={14} height={14} strokeWidth={1.75} />}
                  >
                    Share with dealer
                  </Button>
                  {!haveImages && !shareBlocked ? (
                    <span className="text-xs text-text-subtle">
                      The cards render when you share.
                    </span>
                  ) : null}
                </>
              )}
            </div>
            {/* The reason the button is dead, as TEXT UNDER IT. Not a `title`
                and not an `aria-disabled` hint: `title` never fires on touch,
                and this admin is used on phones, so a tooltip is a reason
                nobody reads. */}
            {!alreadyShared && blockedReason ? (
              <p className="mt-2 text-sm text-text-muted">{blockedReason}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Share with dealer"
        description="Post both cards and a bilingual summary to the dealer's chat? This will message the dealer."
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={share.isPending}
            >
              Cancel
            </Button>
            <Button onClick={onConfirm} loading={share.isPending}>
              Share
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">
          The Variation and Daily Sales cards will be posted to the dealer&apos;s
          chat, along with a short summary they can read.
        </p>
      </Dialog>

      <ImageLightbox
        open={viewing !== null}
        onClose={() => setViewing(null)}
        src={viewing?.url ?? ''}
        alt={viewing?.alt ?? ''}
        title={viewing?.label}
        downloadUrl={viewing?.url}
      />
    </div>
  );
}

const INTENT_TEXT: Record<Intent, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  neutral: 'text-text',
};

/** A rate like `4%` / `0.25%`, trimmed of trailing zeros. */
function pct(n: number): string {
  return `${Number(n.toFixed(2))}%`;
}

/**
 * The permissible band spelled out as the allowances guideline 5.1.11 grants.
 * Shares `bandParts` with the dealer-facing card and the printable report, so
 * all three quote the same arithmetic.
 */
function bandNote(variation: DsrVariationSummary): string {
  const b = bandParts(variation);
  // Whole litres, as the dealer's card and the printed sheet both round to.
  const stock = `${b.stockPct === null ? '4%' : pct(b.stockPct)} of stock (${formatLitres(Math.round(b.stockLitres))})`;
  if (!b.leakageApplies) return `${stock} — no evaporation allowance on a surplus`;
  const rate = b.leakagePct === null ? '' : `${pct(b.leakagePct)} `;
  return `${stock} + ${rate}evaporation (${formatLitres(Math.round(b.leakageLitres))})`;
}

/**
 * The per-product variation card — rendered from md up only. Below md the same
 * figures, the same band note and the same advisory are part of
 * {@link ProductFigures}, where they sit with the day's own numbers instead of
 * repeating them a second time further down the page.
 */
function VariationCard({ variation }: { variation: DsrVariationSummary }) {
  const kind = variation.advisory.kind;
  const intent = ADVISORY_INTENT[kind];
  const withinLimit = variation.variationNotWithinLimit === 0;

  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-3">
        {/* Below md the advisory badge takes its own line. "Short beyond limit"
            is ~115px of a 296px card, and beside it "XtraPremium 95 Petrol"
            truncated to "XtraPremium 95 Pe…" — the product name is the one label
            a per-product variation card cannot afford to lose. `md:truncate`
            keeps the desktop single line exactly as it was. */}
        <div className="flex flex-col items-start gap-2 md:flex-row md:justify-between">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-text md:truncate">
              {variation.productLabel}
            </p>
            <p className="text-xs text-text-subtle">
              Since {dsrDateLabel(variation.sinceDate)}
            </p>
          </div>
          <Badge intent={intent} className="shrink-0 gap-1">
            {kind === 'WITHIN_LIMIT' ? (
              <CheckCircle2 width={12} height={12} strokeWidth={2} />
            ) : kind === 'LOW' ? (
              <ArrowDownRight width={12} height={12} strokeWidth={2} />
            ) : (
              <ArrowUpRight width={12} height={12} strokeWidth={2} />
            )}
            {ADVISORY_LABEL[kind]}
          </Badge>
        </div>

        <div>
          <p
            className={cn(
              'text-2xl font-semibold tabular-nums',
              INTENT_TEXT[intent],
            )}
          >
            {formatLitres(variation.variation, { sign: true })}
          </p>
          <p className="mt-0.5 text-xs text-text-subtle">
            Permissible band ± {formatLitres(variation.permissibleVariation)}
            {withinLimit
              ? ''
              : ` · ${formatLitres(variation.variationNotWithinLimit)} outside`}
          </p>
          {/* The same split the dealer's card shows, so whoever fields the "why
              is my band 1,145?" call is reading the identical breakdown. */}
          <p className="mt-0.5 text-xs text-text-subtle">{bandNote(variation)}</p>
        </div>

        {/* One column below md: each cell is itself a label/value row, and at
            360px a two-column split leaves ~118px for "Receipts" + "6,06,000 L". */}
        <dl className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-xs md:grid-cols-2">
          <Figure
            label="Receipts"
            value={formatLitres(variation.totalReceiptSinceInspection)}
          />
          <Figure
            label="Testing"
            value={formatLitres(variation.totalTestSinceInspection)}
          />
        </dl>

        <div
          className={cn(
            'mt-auto rounded-md px-3 py-2 text-sm',
            intent === 'success'
              ? 'bg-success-soft text-success'
              : intent === 'danger'
                ? 'bg-danger-soft text-danger'
                : 'bg-warning-soft text-warning',
          )}
        >
          <p className="font-medium">{variation.advisory.messageHi}</p>
          <p className="mt-0.5 opacity-90">{variation.advisory.messageEn}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-text-subtle">{label}</dt>
      <dd className="tabular-nums font-medium text-text">{value}</dd>
    </div>
  );
}
