import { Info } from 'lucide-react';
import * as React from 'react';

import { Card, CardContent, CardHeader, CardTitle, Input, Label, SegmentedControl } from '@/components/ui';
import type { DsrPnlResponse } from '@/hooks/api/useDsr';
import { formatLitres, formatYmd } from '@/lib/format';
import { defaultRatesFor, RATE_DEFAULTS_SOURCE, type FuelPnlSettings, type LossBasis } from '@/lib/fuelPnl';

/**
 * Every number that is NOT a measurement, on the screen, above the answer.
 *
 * The point of this panel is that a fuel profit figure is three parts measured
 * litres and one part assumption, and the assumption half has historically been
 * invisible. Two rates nobody collects, one question about testing that nobody
 * has ever answered, and a valuation convention that moves the result by lakhs
 * — all of them sitting behind a single confident-looking rupee figure.
 *
 * So they are inputs, not constants buried in a file. An admin who disagrees
 * with the answer can see exactly which of the four they disagree with, change
 * it, and watch the figure move.
 *
 * The lower block is read-only: the constants the DSR engine itself was run
 * with. They are not editable here because changing them means regenerating the
 * dealer's reports, not re-rendering this page — but they belong on it, because
 * `testingPerActivePumpLitres` in particular decides most of the reported loss
 * and is otherwise visible nowhere in the product.
 */

export interface PnlAssumptionsProps {
  data: DsrPnlResponse;
  settings: FuelPnlSettings;
  onChange: (next: FuelPnlSettings) => void;
}

const LOSS_OPTIONS: { value: LossBasis; label: string }[] = [
  { value: 'COST', label: 'What it cost' },
  { value: 'RETAIL', label: 'Pump price' },
];

/** A rate field. Empty means "not known", which is different from zero. */
function RateField({
  id,
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  /** What the figure is, in the admin's words — the definition belongs on the
   *  screen, not in a source comment, on a page whose whole premise is that
   *  every assumption is visible. */
  hint?: string;
  value: number | null;
  /** Greyed out while the figure it is derived from is missing. */
  disabled?: boolean;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.01"
        placeholder="not known"
        disabled={disabled}
        // `?? ''` and not `|| ''`: a rate of 0 is a real, if odd, entry and must
        // not be silently blanked back to "not known" on every render.
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value.trim();
          const n = Number(raw);
          onChange(raw === '' || !Number.isFinite(n) ? null : n);
        }}
      />
    </div>
  );
}

/** One read-only constant the engine itself ran with. */
function EngineConstant({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-text-subtle">{label}</dt>
      <dd className="mt-0.5 break-words text-sm tabular-nums text-text">{value}</dd>
      {hint ? <p className="mt-0.5 text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}

export function PnlAssumptions({ data, settings, onChange }: PnlAssumptionsProps) {
  const setRate = (key: string, field: 'buyPerLitre' | 'sellPerLitre', v: number | null) => {
    const current = settings.rates[key] ?? { buyPerLitre: null, sellPerLitre: null };
    onChange({ ...settings, rates: { ...settings.rates, [key]: { ...current, [field]: v } } });
  };

  /**
   * The litres flipping this switch actually moves the shortage by.
   *
   * NOT this window's testing total, which is what the line under the switch
   * used to quote. The engine's variation is cumulative from the inspection
   * date, and `variationUnder` adds `testingSinceInspection` — the whole
   * since-inspection testing charge — straight back onto it. Quoting the
   * window's own testing instead named a figure the arithmetic never reads,
   * and at a busy outlet the two differ by an order of magnitude.
   */
  const testingSinceInspection = data.products.reduce(
    (sum, p) => sum + (p.variation?.testingSinceInspection ?? 0),
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assumptions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 md:space-y-6">
        <p className="flex items-start gap-2 text-sm text-text-muted">
          <Info width={16} height={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Every litre on this page is counted. These four things are not — no portal we read
            gives a fuel price, and nobody measures the testing. Change any one of them and every
            figure on the page moves.
          </span>
        </p>
        <p className="-mt-3 text-xs text-text-muted">
          The rates below start from {RATE_DEFAULTS_SOURCE} They are a starting point for one outlet
          on one day — VAT differs by state and the pump price changes daily — so replace them with
          this dealer&rsquo;s own figures when you have them.
        </p>

        {/* ── the rates ───────────────────────────────────────────────── */}
        <div className="space-y-4">
          {data.products.map((p) => {
            const r = settings.rates[p.productKey] ?? { buyPerLitre: null, sellPerLitre: null };
            const margin =
              r.buyPerLitre !== null && r.sellPerLitre !== null
                ? r.sellPerLitre - r.buyPerLitre
                : null;
            return (
              <div
                key={p.productKey}
                className="rounded-md border border-border bg-surface-2 p-2.5 md:p-4"
              >
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  {/* h4: the card's own `CardTitle` ("Assumptions") is the h3. */}
                  <h4 className="text-sm font-semibold text-text">{p.labelEn}</h4>
                  {margin !== null && margin < 0 ? (
                    <p className="text-xs font-medium text-danger">
                      Selling below cost — check these figures
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <RateField
                    id={`buy-${p.productKey}`}
                    label="Cost per litre (₹)"
                    hint="off the tanker invoice"
                    value={r.buyPerLitre}
                    onChange={(v) => setRate(p.productKey, 'buyPerLitre', v)}
                  />
                  <RateField
                    id={`sell-${p.productKey}`}
                    label="Pump price per litre (₹)"
                    hint="what a customer pays"
                    value={r.sellPerLitre}
                    onChange={(v) => setRate(p.productKey, 'sellPerLitre', v)}
                  />
                  {/*
                    The margin, typed directly.

                    It is not a third independent figure — margin is pump price
                    minus cost, and only two of the three can be free. So this
                    writes back to the PUMP PRICE and leaves the cost alone,
                    because the cost is the half we can eventually read off the
                    tanker invoice on our own, while the margin is the half a
                    dealer actually knows by heart ("I get ₹2.50 on diesel").
                    Someone who knows their commission but not today's exact
                    pump price can now say so and get an answer.
                  */}
                  <RateField
                    id={`margin-${p.productKey}`}
                    label="Margin per litre (₹)"
                    hint={
                      r.buyPerLitre === null ? 'enter the cost first' : 'or type this instead'
                    }
                    disabled={r.buyPerLitre === null}
                    value={margin}
                    onChange={(v) =>
                      setRate(
                        p.productKey,
                        'sellPerLitre',
                        v === null || r.buyPerLitre === null ? null : r.buyPerLitre + v,
                      )
                    }
                  />
                </div>
                {/* What the starting figures for THIS grade rest on. The premium
                    grades have no invoice line of their own yet, and a note that
                    says so is the difference between a default and a guess. */}
                {defaultRatesFor(p.productKey) ? (
                  <p className="mt-2 text-xs text-text-muted">
                    {defaultRatesFor(p.productKey)!.note}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* ── the two judgement calls ─────────────────────────────────── */}
        {/* A `<label htmlFor>` cannot name these: `SegmentedControl` renders a
            `role="group"` div with no id, so the association pointed at nothing
            and clicking the words did nothing either. The group carries its own
            `aria-label`, so what is left here is a visible caption. */}
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="mb-1 block text-sm font-medium text-text">Testing fuel was…</p>
            <p className="text-sm text-text">
              {settings.testing === 'SOLD' ? 'Sold' : 'Poured back into the tank'}
              <span className="text-text-muted"> — set in “Was the testing fuel sold?” above.</span>
            </p>
            <p className="mt-1.5 text-xs text-text-muted">
              The report assumes it went back in the tank, so it counts as neither a sale nor a
              loss.
              {testingSinceInspection > 0 ? (
                <>
                  {' '}
                  Say it was sold and the shortage shrinks by{' '}
                  <span className="tabular-nums">{formatLitres(testingSinceInspection)}</span> — all
                  the testing charged since the {formatYmd(data.config.sinceDate)} inspection.
                </>
              ) : null}
            </p>
          </div>
          <div>
            <p className="mb-1 block text-sm font-medium text-text">Lost fuel valued at…</p>
            <SegmentedControl
              aria-label="Lost fuel valued at"
              value={settings.lossBasis}
              onChange={(v) => onChange({ ...settings, lossBasis: v })}
              options={LOSS_OPTIONS}
            />
            <p className="mt-1.5 text-xs text-text-muted">
              This does not change the profit &mdash; it changes how the profit is explained. Cost
              is the cash that went out of the door on fuel that vanished; pump price is the
              revenue those litres will never bring in. The two arrive at the same answer from
              opposite ends.
            </p>
          </div>
        </div>

        <p className="text-xs text-text-subtle">
          These four answers are saved in this browser, for this dealer. They never reach the
          server, and the dealer never sees them.
        </p>

        {/* ── what the engine itself ran with ─────────────────────────── */}
        <div className="rounded-md border border-border p-2.5 md:p-4">
          {/* h4: the card's own `CardTitle` ("Assumptions") is the h3. */}
          <h4 className="mb-1 text-sm font-semibold text-text">
            What the report itself was set to
          </h4>
          <p className="mb-3 text-xs text-text-muted">
            Read-only here. Changing any of these means regenerating this dealer&rsquo;s reports,
            not re-rendering this page.
          </p>
          {/* One column below md. Each constant is a wrapped uppercase micro-label
              over a wrapped sentence-shaped value ("meter moved 20 L or more"),
              and two 128px columns of that is TALLER than one 296px column, not
              shorter. */}
          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-4">
            <EngineConstant
              label="Testing charged"
              value={`${data.config.testingPerActivePumpLitres} L / pump / day`}
              hint="Assumed, never measured"
            />
            <EngineConstant
              label="Pump counts as active"
              value={`meter moved ${data.config.testingMinDeltaLitres} L or more`}
            />
            <EngineConstant
              label="Delivery figure used"
              value={data.config.receiptBasis === 'INVOICE' ? 'Invoiced litres' : 'Dipped-in litres'}
              hint="Rounded up to the next 500 L"
            />
            <EngineConstant
              label="Variation counted since"
              value={formatYmd(data.config.sinceDate)}
              hint="The last inspection"
            />
            {data.products.map((p) => (
              <EngineConstant
                key={p.productKey}
                label={`${p.labelEn} allowances`}
                value={`${p.leakagePct}% evaporation + ${p.permissiblePct}% stock`}
                hint="What the report forgives before calling it a loss"
              />
            ))}
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}
