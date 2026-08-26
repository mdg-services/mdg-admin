import { AlertTriangle, ChevronDown, ChevronRight, Download } from 'lucide-react';
import * as React from 'react';

import { Button, KeyValueList } from '@/components/ui';
import {
  useDsrSetupDraft,
  type DsrDiscoveredProduct,
  type DsrSetupDraft,
} from '@/hooks/api/useDsr';
import type { DsrMonthOpening } from '@dk/shared';

/**
 * The button that fills the DSR setup form in from the dealer's own portal data.
 *
 * Almost nothing on this form is a decision. Which grades an outlet sells, which
 * tank holds each and which nozzles draw from them is a fact every shift
 * snapshot states; the date of the last inspection, the stock dipped that day
 * and each nozzle's totaliser are on the inspection report the portal already
 * holds. Typing it back in was the slow part of onboarding a dealer and the
 * dangerous part too — a mistyped nozzle number does not fail validation, it
 * quietly drops that pump's litres out of the dealer's sales for as long as
 * nobody notices, and a wrong inspection baseline is invisible for three months.
 *
 * What is left for a person is the two figures neither source carries: the
 * receipts and testing between that inspection and the day the ledger starts.
 *
 * It shows its working rather than presenting the result as fact: today's
 * readings beside the baselines, which nozzles it had to re-derive because the
 * report's own numbering did not fit, which pumps report off-scale, and what each
 * tank of a multi-tank product currently holds.
 */

/** The shape the plugin's JSON Schema expects for one product. */
interface DsrProductFormValue {
  key: string;
  labelEn: string;
  labelHi: string;
  tankLabel: string;
  prodCodes: string[];
  tankNos: number[];
  nozzleNos: number[];
  leakagePct?: number;
  permissiblePct: number;
  meterScale?: Record<string, number>;
  monthOpening?: DsrMonthOpening;
  inspection: {
    openingStock?: number;
    meterByNozzle: Record<string, number | undefined>;
    seedReceipts: number;
    seedTesting: number;
  };
}

/**
 * @param keep this product's already-configured month opening, if the form has
 * one. The portal cannot know it — it is what the dealer's own book says they
 * had sold this month before we started — so re-reading the layout must carry it
 * across rather than silently blanking a figure a person supplied.
 */
function toFormProduct(
  p: DsrDiscoveredProduct,
  keep?: DsrMonthOpening,
  existing?: DsrProductFormValue,
): DsrProductFormValue {
  return {
    key: p.key,
    labelEn: p.labelEn,
    labelHi: p.labelHi,
    tankLabel: p.tankLabel,
    prodCodes: p.prodCodes,
    // The CONFIGURED order wins whenever the two lists describe the same tanks.
    // Discovery can only propose ascending, and that order is not cosmetic: it is
    // the left-to-right order of the report's per-tank columns, and 1E's diesel
    // is deliberately 6, 4, 8. Re-reading the layout must not quietly reshuffle
    // a dealer's sheet. A genuine change — a tank added or removed — falls
    // through to the portal's list, which is the point of re-reading.
    tankNos: sameTanks(existing?.tankNos, p.tankNos) ? existing!.tankNos : p.tankNos,
    nozzleNos: p.nozzleNos,
    // Left undefined for an unrecognised grade so the field reads as a question
    // rather than as an answer nobody checked.
    ...(p.leakagePct === null ? {} : { leakagePct: p.leakagePct }),
    permissiblePct: p.permissiblePct,
    ...(p.meterScale && Object.keys(p.meterScale).length > 0
      ? { meterScale: p.meterScale }
      : {}),
    ...(keep ? { monthOpening: keep } : {}),
    inspection: {
      ...(p.inspection?.openingStock === null || p.inspection?.openingStock === undefined
        ? {}
        : { openingStock: p.inspection.openingStock }),
      // One key per real nozzle, filled from the inspection report where it had
      // a figure and left blank where it did not, so a gap reads as a gap.
      meterByNozzle: Object.fromEntries(
        p.nozzleNos.map((n) => [String(n), p.inspection?.meterByNozzle?.[String(n)]]),
      ),
      // Carried across, NEVER re-zeroed.
      //
      // These are the litres delivered and tested between the last inspection
      // and the day the ledger starts — figures a person worked out from the
      // dealer's own book, which the portal has no way to know. 1E's diesel
      // holds 606,000 L here. Zeroing them re-bases the entire stock-versus-sales
      // sum against a starting point that never happened, and 1E's variation
      // would go from −1,776 L to a figure in the hundreds of thousands, with
      // the report telling the dealer to draw fuel back into the tank every
      // morning. The old behaviour was safe only because nobody had yet pressed
      // this button on a live dealer.
      seedReceipts: existing?.inspection?.seedReceipts ?? 0,
      seedTesting: existing?.inspection?.seedTesting ?? 0,
    },
  };
}

/** Two tank lists holding the same tanks, whatever order they are written in. */
function sameTanks(a: number[] | undefined, b: number[]): boolean {
  if (!a || a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((t, i) => t === right[i]);
}

interface Props {
  dealerId: string;
  config: Record<string, unknown>;
  onConfigChange: (next: Record<string, unknown>) => void;
}

/**
 * What the read found worth saying about one product, as data rather than as
 * markup.
 *
 * The desktop line and the phone block are genuinely different shapes — one
 * sentence versus one fact per line — so they cannot share a tree, but they
 * MUST share the sentences, or the two drift and an operator sees a different
 * warning depending on the width of their screen.
 */
interface ProductNote {
  key: string;
  tone: 'warning' | 'muted';
  text: string;
}

function productNotes(p: DsrDiscoveredProduct): ProductNote[] {
  const notes: ProductNote[] = [];
  if (p.provisional) {
    notes.push({
      key: 'provisional',
      tone: 'warning',
      text: `unknown grade “${p.prodCodes.join('/')}”, check its name and leakage allowance`,
    });
  }
  if (p.inspection?.assignment === 'BY_READING') {
    notes.push({
      key: 'by-reading',
      tone: 'warning',
      text: 'the report’s nozzle numbers did not fit today’s readings, so each was matched to the nozzle it can belong to',
    });
  }
  if (p.inspection?.nozzlesWithoutBaseline?.length) {
    notes.push({
      key: 'no-baseline',
      tone: 'warning',
      text: `no inspection reading for nozzle ${p.inspection.nozzlesWithoutBaseline.join(', ')}`,
    });
  }
  if (p.meterScale && Object.keys(p.meterScale).length > 0) {
    notes.push({
      key: 'meter-scale',
      tone: 'warning',
      text: `nozzle ${Object.entries(p.meterScale)
        .map(([n, scale]) => `${n} (×${scale})`)
        .join(', ')} report off-scale and are being corrected`,
    });
  }
  if (p.tanks.length > 1) {
    notes.push({
      key: 'multi-tank',
      tone: 'muted',
      text: `stock is the sum of ${p.tanks.length} tanks (${p.tanks
        .map(
          (t) => `T${t.tankNo} ${t.stock === null ? '—' : Math.round(t.stock)} L`,
        )
        .join(', ')}); the report prints a dip, water dip and stock column for each, in this order`,
    });
  }
  return notes;
}

/**
 * Today's stock and meter readings, to check the inspection baselines against.
 *
 * A `<summary>` is a ~16px target, and this is the only route to the comparison
 * data — so below md it is a `Button` with the 44px floor and a chevron, and the
 * readings are a two-column key/value grid rather than the inline
 * `15E: stock 12340 L · n1 123456 · n2 234567 …` ribbon, which at 360px on a
 * six-nozzle outlet wrapped into something unparseable. At md the `<details>`
 * disclosure is exactly what it was.
 */
function TodaysReadings({
  products,
}: {
  products: DsrDiscoveredProduct[];
}) {
  const [open, setOpen] = React.useState(false);
  const label = 'Today’s readings, to check the inspection figures against';

  return (
    <>
      <details className="hidden text-xs text-text-muted md:block">
        <summary className="cursor-pointer">{label}</summary>
        <ul className="mt-1 grid gap-0.5 pl-3">
          {products.map((p) => (
            <li key={p.key}>
              {p.key}: stock {p.currentStock ?? '—'} L
              {Object.entries(p.currentMeterByNozzle).map(([n, r]) => (
                <span key={n}> &middot; n{n} {Number.isFinite(r) ? r : '—'}</span>
              ))}
            </li>
          ))}
        </ul>
      </details>

      <div className="md:hidden">
        <Button
          variant="ghost"
          size="sm"
          padding="none"
          align="start"
          className="w-full justify-between"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          rightIcon={
            open ? (
              <ChevronDown width={16} height={16} strokeWidth={1.75} />
            ) : (
              <ChevronRight width={16} height={16} strokeWidth={1.75} />
            )
          }
        >
          {label}
        </Button>
        {open ? (
          <div className="mt-2 grid gap-2">
            {products.map((p) => (
              <div
                key={p.key}
                className="rounded-md border border-border bg-surface p-3"
              >
                <p className="text-sm font-semibold text-text">{p.key}</p>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-text-muted">Stock</dt>
                  <dd className="tabular-nums text-text">
                    {p.currentStock ?? '—'} L
                  </dd>
                  {Object.entries(p.currentMeterByNozzle).map(([n, r]) => (
                    <React.Fragment key={n}>
                      <dt className="whitespace-nowrap text-text-muted">
                        Nozzle {n}
                      </dt>
                      <dd className="tabular-nums text-text">
                        {Number.isFinite(r) ? r : '—'}
                      </dd>
                    </React.Fragment>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

export function DsrLayoutPrefill({ dealerId, config, onConfigChange }: Props) {
  const draft = useDsrSetupDraft(dealerId);
  const [applied, setApplied] = React.useState<DsrSetupDraft | null>(null);

  async function handleRead() {
    const res = await draft.refetch();
    const data = res.data;
    if (!data) return;
    setApplied(data);
    // Everything already configured for each product, so re-reading the layout
    // replaces what the portal knows and keeps what only a person can.
    const existingByKey = new Map(
      (Array.isArray(config.products) ? config.products : [])
        .map((x) => x as DsrProductFormValue)
        .filter((x) => x?.key)
        .map((x) => [x.key, x]),
    );
    onConfigChange({
      ...config,
      ...(data.inspection ? { sinceDate: data.inspection.date } : {}),
      products: data.products.map((p) => {
        const existing = existingByKey.get(p.key);
        return toFormProduct(p, existing?.monthOpening, existing);
      }),
    });
  }

  const existingProducts = Array.isArray(config.products) ? config.products.length : 0;

  return (
    <div className="grid gap-2 rounded-md border border-border bg-surface-2 p-3">
      {/* Stacked below md: a `shrink-0` 125px button beside this three-sentence
          paragraph leaves it ~160px, i.e. about nine lines of small grey text
          in a column beside a button. */}
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">Read this outlet&rsquo;s setup from the portal</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Products, tanks, nozzles and allowances come from their most recent shift snapshot;
            the inspection date, tank stock and nozzle readings come from their last inspection
            report. Check the figures, then add any receipts and testing since that inspection.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRead}
          loading={draft.isFetching}
          className="w-full shrink-0 md:w-auto"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Read layout
        </Button>
      </div>

      {existingProducts > 0 && !applied && (
        <p className="text-xs text-text-muted">
          This will replace the {existingProducts} product
          {existingProducts === 1 ? '' : 's'} already in the form.
        </p>
      )}

      {draft.isError && (
        <p className="text-xs text-danger">
          {draft.error instanceof Error
            ? draft.error.message
            : 'Could not read the layout.'}
        </p>
      )}

      {applied && (
        <div className="grid gap-1.5">
          <p className="text-xs text-text-muted">
            Layout from the shift of {applied.businessDate}
            {applied.inspection
              ? `; baselines from the inspection of ${applied.inspection.date}`
              : '; no inspection report captured yet, so the baselines are blank'}
            .
          </p>
          {/* Desktop (≥ md): the inline run-on line this has always been. */}
          <ul className="hidden gap-1 md:grid">
            {applied.products.map((p) => (
              <li key={p.key} className="text-xs text-text">
                <span className="font-semibold">{p.key}</span>{' '}
                <span className="text-text-muted">
                  ({p.labelEn}) &middot; tank {p.tankNos.join(', ')} &middot; nozzle{' '}
                  {p.nozzleNos.join(', ')}
                </span>
                {productNotes(p).map((n) => (
                  <span
                    key={n.key}
                    className={
                      n.tone === 'warning'
                        ? 'ml-1 text-warning'
                        : 'ml-1 text-text-muted'
                    }
                  >
                    &mdash; {n.text}
                  </span>
                ))}
              </li>
            ))}
          </ul>

          {/* Below md: one block per product.
              This screen exists to catch a mistyped nozzle before it silently
              drops a pump's litres out of a dealer's sales for months (see the
              header comment). As one inline paragraph a product ran to 14+ lines
              of 12px text at 360px, with warnings in amber and facts in grey
              interleaved mid-sentence — a wall, and a wrong nozzle number is
              invisible in a wall. Same data, one fact per line. */}
          <ul className="grid gap-2 md:hidden">
            {applied.products.map((p) => {
              const notes = productNotes(p);
              return (
                <li
                  key={p.key}
                  className="rounded-md border border-border bg-surface p-3"
                >
                  <p className="break-words text-sm font-semibold text-text">
                    {p.key}{' '}
                    <span className="font-normal text-text-muted">
                      ({p.labelEn})
                    </span>
                  </p>
                  <KeyValueList
                    className="mt-2"
                    items={[
                      {
                        key: 'tank',
                        label: p.tankNos.length === 1 ? 'Tank' : 'Tanks',
                        value: p.tankNos.join(', '),
                      },
                      {
                        key: 'nozzle',
                        label: p.nozzleNos.length === 1 ? 'Nozzle' : 'Nozzles',
                        value: p.nozzleNos.join(', '),
                      },
                    ]}
                  />
                  {notes.length > 0 ? (
                    <ul className="mt-2 grid gap-1.5">
                      {notes.map((n) => (
                        <li
                          key={n.key}
                          className={
                            n.tone === 'warning'
                              ? 'flex items-start gap-1.5 text-sm text-warning'
                              : 'flex items-start gap-1.5 text-sm text-text-muted'
                          }
                        >
                          {n.tone === 'warning' ? (
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          ) : null}
                          <span className="min-w-0 break-words">{n.text}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {applied.products.some((p) => Object.keys(p.currentMeterByNozzle).length > 0) && (
            <TodaysReadings products={applied.products} />
          )}
          {applied.warnings.length > 0 && (
            <ul className="grid gap-1">
              {applied.warnings.map((w) => (
                <li
                  key={w}
                  className="flex items-start gap-1.5 text-sm text-warning md:text-xs"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="min-w-0 break-words">{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
