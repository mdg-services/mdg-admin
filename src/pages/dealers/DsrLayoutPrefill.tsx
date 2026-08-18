import { AlertTriangle, Download } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui';
import {
  useDsrSetupDraft,
  type DsrDiscoveredProduct,
  type DsrSetupDraft,
} from '@/hooks/api/useDsr';

/**
 * "Read the layout from IRAS data" — the button that takes the DSR setup form
 * from thirteen typed fields per product down to the four numbers only a
 * physical inspection can produce.
 *
 * The layout is not a decision anyone makes. Which grades an outlet sells, which
 * tank holds each and which nozzles draw from them is a fact the portal states
 * in every shift snapshot, and typing it again was both tedious and the most
 * dangerous part of the form: a mistyped nozzle number does not fail validation,
 * it quietly drops that pump's litres out of the dealer's sales for as long as
 * nobody notices.
 *
 * So this fills in everything derivable and leaves the inspection baselines
 * blank — with one box per real nozzle, already labelled, and today's reading
 * shown beside it so a digit dropped or a pump confused is visible before it
 * becomes three months of wrong variation.
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
  inspection: {
    openingStock?: number;
    meterByNozzle: Record<string, number | undefined>;
    seedReceipts: number;
    seedTesting: number;
  };
}

function toFormProduct(p: DsrDiscoveredProduct): DsrProductFormValue {
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
    inspection: {
      // One key per real nozzle, so the operator types into labelled boxes
      // instead of inventing the map.
      meterByNozzle: Object.fromEntries(p.nozzleNos.map((n) => [String(n), undefined])),
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
    onConfigChange({
      ...config,
      products: data.products.map(toFormProduct),
    });
  }

  const existingProducts = Array.isArray(config.products) ? config.products.length : 0;

  return (
    <div className="grid gap-2 rounded-md border border-border bg-surface-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">Read the layout from IRAS data</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Fills in this outlet&rsquo;s products, tanks, nozzles and allowances from their most
            recent shift snapshot. You then enter only the last inspection&rsquo;s figures.
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
            From the shift of {applied.businessDate}.
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
                {p.tanks.length > 1 && (
                  <span className="ml-1 text-text-muted">
                    &mdash; stock is the sum of {p.tanks.length} tanks; the report prints tank{' '}
                    {p.tankNos[0]}&rsquo;s dip, so put the tank you dip first
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
