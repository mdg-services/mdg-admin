import { Truck } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Callout,
  Dialog,
  Input,
  Label,
  MIN_SELECTABLE_YMD,
  Skeleton,
  useToast,
} from '@/components/ui';
import {
  useDsrDayReceipts,
  useDsrReceiptHistory,
  useSaveDsrReceipts,
  type DsrReceiptEntryInput,
} from '@/hooks/api/useDsr';
import { ApiError } from '@/lib/api';
import { formatLitres, formatYmd, istTodayYmd, isYmd } from '@/lib/format';

/**
 * "Receipts" — opens {@link DsrReceiptsDialog} for a dealer, defaulting to the
 * date on screen. A component rather than four copies of the same open/close
 * state, because the editor belongs everywhere a DSR is generated: beside the
 * date picker, and in the empty state of a dealer who has no report yet.
 */
export function DsrReceiptsButton({
  dealerId,
  businessDate,
  className,
}: {
  dealerId: string;
  businessDate?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className={className}
        leftIcon={<Truck width={14} height={14} strokeWidth={1.75} />}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        Receipts
      </Button>
      {open ? (
        <DsrReceiptsDialog
          dealerId={dealerId}
          businessDate={businessDate}
          open={open}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** One product's row in the editor, as the admin is currently filling it in. */
interface Draft {
  /** Blank means "use whatever IRAS reports" — the field's placeholder shows it. */
  litres: string;
  invoiceNo: string;
  note: string;
}

const EMPTY: Draft = { litres: '', invoiceNo: '', note: '' };

/**
 * Enter the day's receipts by hand.
 *
 * A receipt is the only DSR figure nobody measures — the portal learns of a
 * decantation when somebody enters it there, so it is routinely missing, late or
 * wrong while the dips and meter readings for the same day are fine. Here an
 * admin states the real number for any past date, and it overrides IRAS for that
 * product until the field is cleared again.
 *
 * Saving deliberately does NOT regenerate anything: it flags the reports the
 * change invalidated (this day and every later one, because the stock variation
 * is cumulative) and leaves the rebuild — which can drive a portal collection —
 * to a deliberate click on the notice that then appears.
 */
export function DsrReceiptsDialog({
  dealerId,
  businessDate,
  open,
  onClose,
}: {
  dealerId: string;
  /** The date the editor opens on; the admin can change it. */
  businessDate?: string;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const today = istTodayYmd();
  const [date, setDate] = React.useState(businessDate ?? today);
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  // The date the drafts below belong to. Re-seeding on a date change has to be
  // driven by the data arriving, not by the change itself, or the previous day's
  // figures sit in the fields while the new day loads.
  const [seededFor, setSeededFor] = React.useState<string | null>(null);

  const dateValid = isYmd(date) && date >= MIN_SELECTABLE_YMD && date <= today;
  const dayQ = useDsrDayReceipts(dealerId, open && dateValid ? date : undefined);
  const historyQ = useDsrReceiptHistory(dealerId, open);
  const save = useSaveDsrReceipts(dealerId);

  // Re-open on a different report's date without carrying the last one over.
  React.useEffect(() => {
    if (!open) return;
    setDate(businessDate ?? today);
    setSeededFor(null);
    // `today` is recomputed each render; including it would re-run this on every
    // render while the dialog is open and stamp over what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, businessDate]);

  // Seed the fields from what is on record, once per (day) load.
  const day = dayQ.data;
  React.useEffect(() => {
    if (!day || seededFor === day.businessDate) return;
    const next: Record<string, Draft> = {};
    for (const p of day.products) {
      next[p.productKey] = p.manual
        ? {
            litres: String(p.manual.litres),
            invoiceNo: p.manual.invoiceNo ?? '',
            note: p.manual.note ?? '',
          }
        : { ...EMPTY };
    }
    setDrafts(next);
    setSeededFor(day.businessDate);
  }, [day, seededFor]);

  const entries: DsrReceiptEntryInput[] = React.useMemo(() => {
    if (!day) return [];
    return day.products.map((p) => {
      const d = drafts[p.productKey] ?? EMPTY;
      const raw = d.litres.trim();
      return {
        productKey: p.productKey,
        litres: raw === '' ? null : Number(raw),
        invoiceNo: d.invoiceNo.trim() || null,
        note: d.note.trim() || null,
      };
    });
  }, [day, drafts]);

  const invalid = entries.some(
    (e) => e.litres !== null && (!Number.isFinite(e.litres) || e.litres < 0),
  );

  async function onSave() {
    if (!day || invalid) return;
    try {
      const result = await save.mutateAsync({ businessDate: day.businessDate, entries });
      if (result.changes.length === 0) {
        toast.info('Nothing changed — the receipts on record already match.');
      } else if (result.staleDates.length === 0) {
        toast.success('Receipts saved. No generated report is affected yet.');
      } else {
        toast.success(
          `Receipts saved. ${result.staleDates.length} report${
            result.staleDates.length === 1 ? '' : 's'
          } now need regenerating.`,
        );
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the receipts');
    }
  }

  const history = historyQ.data?.receipts ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Receipts"
      description="Enter the litres decanted for a day. What you enter replaces the figure IRAS reports."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void onSave()}
            loading={save.isPending}
            disabled={!day || invalid}
          >
            Save receipts
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div>
          <Label htmlFor="dsr-receipt-date">Business date</Label>
          <Input
            id="dsr-receipt-date"
            type="date"
            value={date}
            min={MIN_SELECTABLE_YMD}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
        </div>

        {!dateValid ? (
          <Callout>Pick a date on or before today.</Callout>
        ) : dayQ.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : dayQ.isError ? (
          <Callout>
            {dayQ.error instanceof ApiError
              ? dayQ.error.message
              : 'Could not load this day’s receipts.'}
          </Callout>
        ) : day ? (
          <>
            {!day.hasSnapshot ? (
              <Callout intent="info">
                No shift data has been collected for {formatYmd(day.businessDate)} yet, so
                there is nothing from IRAS to compare against. A receipt entered now
                will be used the moment that day is generated.
              </Callout>
            ) : null}

            <div className="grid gap-3">
              {day.products.map((p) => {
                const d = drafts[p.productKey] ?? EMPTY;
                const set = (patch: Partial<Draft>) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [p.productKey]: { ...(prev[p.productKey] ?? EMPTY), ...patch },
                  }));
                return (
                  <div
                    key={p.productKey}
                    className="grid gap-2 rounded-md border border-border p-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-text">
                        {p.labelEn}{' '}
                        <span className="font-normal text-text-subtle">{p.tankLabel}</span>
                      </p>
                      <p className="text-xs text-text-subtle">
                        IRAS reports{' '}
                        <span className="font-medium tabular-nums">
                          {p.irasLitres === null ? '—' : formatLitres(p.irasLitres)}
                        </span>
                      </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                      <div>
                        <Label htmlFor={`litres-${p.productKey}`}>Receipt (litres)</Label>
                        <Input
                          id={`litres-${p.productKey}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={d.litres}
                          placeholder={
                            p.irasLitres === null ? 'Use IRAS' : String(p.irasLitres)
                          }
                          onChange={(e) => set({ litres: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`invoice-${p.productKey}`}>
                          Invoice / DSN (optional)
                        </Label>
                        <Input
                          id={`invoice-${p.productKey}`}
                          value={d.invoiceNo}
                          maxLength={64}
                          onChange={(e) => set({ invoiceNo: e.target.value })}
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor={`note-${p.productKey}`}>Reason (optional)</Label>
                      <Input
                        id={`note-${p.productKey}`}
                        value={d.note}
                        maxLength={500}
                        placeholder="e.g. tanker decanted, not entered in IRAS"
                        onChange={(e) => set({ note: e.target.value })}
                      />
                    </div>

                    {p.manual ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-text-subtle">
                        <span>
                          Entered manually · was {formatLitres(p.manual.litres)}
                        </span>
                        <button
                          type="button"
                          className="font-semibold text-brand underline"
                          onClick={() => set({ litres: '', invoiceNo: '', note: '' })}
                        >
                          Clear and use IRAS
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-text-subtle">
                        Leave blank to keep using the IRAS figure.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        {history.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Entered by hand so far
            </p>
            <ul className="grid gap-1 text-xs text-text-muted">
              {history.slice(0, 10).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-2">
                  <Truck width={12} height={12} strokeWidth={1.75} className="shrink-0" />
                  <span className="font-medium text-text">{formatYmd(r.businessDate)}</span>
                  <span>{r.productKey}</span>
                  <span className="tabular-nums">{formatLitres(r.litres)}</span>
                  {r.irasLitres !== null && r.irasLitres !== undefined ? (
                    <span className="text-text-subtle">
                      (IRAS: {formatLitres(r.irasLitres)})
                    </span>
                  ) : null}
                  {r.note ? <span className="text-text-subtle">· {r.note}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
