import { AlertTriangle, Download } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui';
import {
  useDsrSetupDraft,
  type DsrDiscoveredProduct,
  type DsrSetupDraft,
} from '@/hooks/api/useDsr';

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
  monthOpening?: { month: string; sales: number };
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
  keep?: { month: string; sales: number },
): DsrProductFormValue {
  return {
    key: p.key,
    labelEn: p.labelEn,
    labelHi: p.labelHi,
    tankLabel: p.tankLabel,
    prodCodes: p.prodCodes,
    tankNos: p.tankNos,
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
      seedReceipts: 0,
      seedTesting: 0,
    },
  };
}

interface Props {
  dealerId: string;
  config: Record<string, unknown>;
  onConfigChange: (next: Record<string, unknown>) => void;
}

export function DsrLayoutPrefill({ dealerId, config, onConfigChange }: Props) {
  const draft = useDsrSetupDraft(dealerId);
  const [applied, setApplied] = React.useState<DsrSetupDraft | null>(null);

  async function handleRead() {
    const res = await draft.refetch();
    const data = res.data;
    if (!data) return;
    setApplied(data);
    const openings = new Map(
      (Array.isArray(config.products) ? config.products : [])
        .map((x) => x as { key?: string; monthOpening?: { month: string; sales: number } })
        .filter((x) => x.key && x.monthOpening)
        .map((x) => [x.key!, x.monthOpening!]),
    );
    onConfigChange({
      ...config,
      ...(data.inspection ? { sinceDate: data.inspection.date } : {}),
      products: data.products.map((p) => toFormProduct(p, openings.get(p.key))),
    });
  }

  const existingProducts = Array.isArray(config.products) ? config.products.length : 0;

  return (
    <div className="grid gap-2 rounded-md border border-border bg-surface-2 p-3">
      <div className="flex items-start justify-between gap-3">
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
          className="shrink-0"
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
          <ul className="grid gap-1">
            {applied.products.map((p) => (
              <li key={p.key} className="text-xs text-text">
                <span className="font-semibold">{p.key}</span>{' '}
                <span className="text-text-muted">
                  ({p.labelEn}) &middot; tank {p.tankNos.join(', ')} &middot; nozzle{' '}
                  {p.nozzleNos.join(', ')}
                </span>
                {p.provisional && (
                  <span className="ml-1 text-warning">
                    &mdash; unknown grade &ldquo;{p.prodCodes.join('/')}&rdquo;, check its name and
                    leakage allowance
                  </span>
                )}
                {p.inspection?.assignment === 'BY_READING' && (
                  <span className="ml-1 text-warning">
                    &mdash; the report&rsquo;s nozzle numbers did not fit today&rsquo;s readings, so
                    each was matched to the nozzle it can belong to
                  </span>
                )}
                {p.inspection?.nozzlesWithoutBaseline?.length ? (
                  <span className="ml-1 text-warning">
                    &mdash; no inspection reading for nozzle{' '}
                    {p.inspection.nozzlesWithoutBaseline.join(', ')}
                  </span>
                ) : null}
                {p.meterScale && Object.keys(p.meterScale).length > 0 && (
                  <span className="ml-1 text-warning">
                    &mdash; nozzle{' '}
                    {Object.entries(p.meterScale)
                      .map(([n, s]) => `${n} (\u00d7${s})`)
                      .join(', ')}{' '}
                    report off-scale and are being corrected
                  </span>
                )}
                {p.tanks.length > 1 && (
                  <span className="ml-1 text-text-muted">
                    &mdash; stock is the sum of {p.tanks.length} tanks (
                    {p.tanks
                      .map((t) => `T${t.tankNo} ${t.stock === null ? '—' : Math.round(t.stock)} L`)
                      .join(', ')}
                    ); the report prints a dip, water dip and stock column for each, in this
                    order
                  </span>
                )}
              </li>
            ))}
          </ul>
          {applied.products.some((p) => Object.keys(p.currentMeterByNozzle).length > 0) && (
            <details className="text-xs text-text-muted">
              <summary className="cursor-pointer">
                Today&rsquo;s readings, to check the inspection figures against
              </summary>
              <ul className="mt-1 grid gap-0.5 pl-3">
                {applied.products.map((p) => (
                  <li key={p.key}>
                    {p.key}: stock {p.currentStock ?? '—'} L
                    {Object.entries(p.currentMeterByNozzle).map(([n, r]) => (
                      <span key={n}> &middot; n{n} {Number.isFinite(r) ? r : '—'}</span>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {applied.warnings.length > 0 && (
            <ul className="grid gap-1">
              {applied.warnings.map((w) => (
                <li key={w} className="flex items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
