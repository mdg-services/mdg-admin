import { Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Dialog,
  EmptyState,
  Input,
  Label,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import { useEffectiveWorkItems } from '@/hooks/api/useDealerWorkList';
import { useAdminAwardPoints } from '@/hooks/api/useStaff';
import { ApiError } from '@/lib/api';
import {
  domainLabel,
  DOMAIN_ORDER,
  distributionLabel,
  fmtPoints,
  makeLocalId,
  todayYmd,
  unitLabel,
} from '@/lib/staffWork';
import { WORK_NOTE_MAX, requiresDescription } from '@dk/shared';
import type {
  AwardStaffWorkSelection,
  EmployeeWithPoints,
  EffectiveWorkItem,
} from '@dk/shared';

interface Props {
  dealerId: string;
  roster: EmployeeWithPoints[];
  open: boolean;
  onClose: () => void;
}

interface WorkRow {
  _id: string;
  workItemCode: string;
  /** Text inputs; parsed to numbers on submit. */
  quantity: string;
  amountRupees: string;
  /** What was done — required for the catch-all "Other …" works. */
  note: string;
}

/** Estimated total points across the selected workers for one work row. */
function estimateWorkTotal(
  item: EffectiveWorkItem | undefined,
  row: WorkRow,
  workerCount: number,
): number {
  if (!item || workerCount === 0) return 0;
  switch (item.distribution) {
    case 'SPLIT':
      return item.points; // divided among workers → total stays the base
    case 'PER_UNIT': {
      const qty =
        item.unit === 'rupee-1000'
          ? (parseFloat(row.amountRupees) || 0) / 1000
          : parseFloat(row.quantity) || 0;
      return item.points * qty * workerCount;
    }
    default: // FLAT / EACH
      return item.points * workerCount;
  }
}

export function AwardPointsDialog({ dealerId, roster, open, onClose }: Props) {
  const toast = useToast();
  const award = useAdminAwardPoints(dealerId);
  const itemsQ = useEffectiveWorkItems(open ? dealerId : undefined);

  const activeWorkers = React.useMemo(
    () => roster.filter((e) => e.status === 'ACTIVE'),
    [roster],
  );

  const effItems = React.useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const itemsByCode = React.useMemo(() => {
    const m = new Map<string, EffectiveWorkItem>();
    for (const it of effItems) m.set(it.code, it);
    return m;
  }, [effItems]);

  const grouped = React.useMemo(() => {
    const byDomain = new Map<string, EffectiveWorkItem[]>();
    for (const it of effItems) {
      if (!it.active) continue;
      const bucket = byDomain.get(it.domain);
      if (bucket) bucket.push(it);
      else byDomain.set(it.domain, [it]);
    }
    return DOMAIN_ORDER.filter((d) => byDomain.has(d)).map((d) => ({
      domain: d,
      items: (byDomain.get(d) ?? []).sort((a, b) => a.srNo - b.srNo),
    }));
  }, [effItems]);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [rows, setRows] = React.useState<WorkRow[]>([]);
  const [workDate, setWorkDate] = React.useState<string>(todayYmd());
  const [note, setNote] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setSelected(new Set());
      setRows([]);
      setWorkDate(todayYmd());
      setNote('');
    }
  }, [open]);

  const firstCode = grouped[0]?.items[0]?.code ?? '';

  function toggleWorker(id: string) {
    setSelected((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addRow() {
    setRows((curr) => [
      ...curr,
      { _id: makeLocalId(), workItemCode: firstCode, quantity: '', amountRupees: '', note: '' },
    ]);
  }

  function updateRow(id: string, patch: Partial<WorkRow>) {
    setRows((curr) => curr.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((curr) => curr.filter((r) => r._id !== id));
  }

  const workerCount = selected.size;

  const estTotal = React.useMemo(
    () =>
      rows.reduce(
        (sum, r) =>
          sum + estimateWorkTotal(itemsByCode.get(r.workItemCode), r, workerCount),
        0,
      ),
    [rows, itemsByCode, workerCount],
  );

  async function submit() {
    if (workerCount === 0) {
      toast.error('Select at least one warrior');
      return;
    }
    const usableRows = rows.filter((r) => r.workItemCode);
    if (usableRows.length === 0) {
      toast.error('Add at least one work');
      return;
    }

    const items: AwardStaffWorkSelection[] = [];
    for (const r of usableRows) {
      const item = itemsByCode.get(r.workItemCode);
      const sel: AwardStaffWorkSelection = { workItemCode: r.workItemCode };
      if (item?.distribution === 'PER_UNIT') {
        if (item.unit === 'rupee-1000') {
          const amt = parseFloat(r.amountRupees);
          if (Number.isNaN(amt) || amt <= 0) {
            toast.error(`Enter a rupee amount for "${item.labelEn}"`);
            return;
          }
          sel.amountRupees = amt;
        } else {
          const q = parseFloat(r.quantity);
          if (Number.isNaN(q) || q <= 0) {
            toast.error(`Enter a quantity for "${item.labelEn}"`);
            return;
          }
          sel.quantity = q;
        }
      }
      // The catch-all works record nothing on their own. The server rejects an
      // undescribed one, so catch it here and name the offending row — otherwise
      // the admin just gets a 400 with nothing to act on.
      if (requiresDescription(r.workItemCode)) {
        const note = r.note.trim();
        if (!note) {
          toast.error(`Describe what was done for "${item?.labelEn ?? r.workItemCode}"`);
          return;
        }
        sel.note = note;
      } else if (r.note.trim()) {
        sel.note = r.note.trim();
      }
      items.push(sel);
    }

    try {
      const res = await award.mutateAsync({
        employeeIds: Array.from(selected),
        items,
        workDate: workDate || undefined,
        note: note.trim() || undefined,
      });
      toast.success(
        `Awarded ${fmtPoints(res.totalPoints)} pts across ${res.awards.length} entr${
          res.awards.length === 1 ? 'y' : 'ies'
        }`,
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not award points');
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Award points"
      description="Pick the warriors and the work(s) they did. Points are computed server-side from the dealer's effective work list."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={award.isPending}
            disabled={workerCount === 0 || rows.length === 0}
          >
            Award points
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {/* Workers */}
        <div>
          {/* The count sits ABOVE the list, not under it. Below md the list is
              a tall scroller, so a count printed after it is off the bottom of
              the box the moment you start scrolling through a 25-warrior
              roster — which is exactly when you want to know how many are
              ticked. */}
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <Label className="mb-0">Warriors</Label>
            <span className="shrink-0 text-xs text-text-subtle">
              {workerCount} selected
            </span>
          </div>
          {activeWorkers.length === 0 ? (
            <p className="text-sm text-text-muted">
              No active warriors. Add a warrior to the roster first.
            </p>
          ) : (
            // `max-h-40` is 160px — with 44px rows that is 3.5 warriors visible
            // at a time on a 10-25 roster, and this is the first mandatory step
            // of the whole award. 45dvh gives ~8-9. `overscroll-contain` stops a
            // flick at either end from chaining into the Dialog body behind it,
            // which read as the sheet jumping under the finger.
            <div className="grid max-h-[45dvh] grid-cols-1 gap-1 overflow-y-auto overscroll-contain rounded-sm border border-border p-2 md:max-h-40 md:grid-cols-2">
              {activeWorkers.map((w) => (
                <label
                  key={w.id}
                  className="flex min-h-11 items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-surface-2 md:min-h-0"
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-border-strong accent-brand md:h-4 md:w-4"
                    checked={selected.has(w.id)}
                    onChange={() => toggleWorker(w.id)}
                  />
                  <span className="truncate">{w.name}</span>
                  {w.designation ? (
                    <span className="truncate text-xs text-text-subtle">
                      · {w.designation}
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Works */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label className="mb-0">Work(s) done</Label>
            <Button
              variant="secondary"
              size="sm"
              onClick={addRow}
              disabled={itemsQ.isLoading || grouped.length === 0}
              leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
            >
              Add work
            </Button>
          </div>

          {itemsQ.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : grouped.length === 0 ? (
            <EmptyState
              title="No work items"
              description="This dealer's effective work list is empty. Configure it in the Work list tab."
            />
          ) : rows.length === 0 ? (
            <p className="rounded-sm border border-dashed border-border-strong px-3 py-4 text-center text-sm text-text-muted">
              No works added yet. Click “Add work” to begin.
            </p>
          ) : (
            <div className="grid gap-2">
              {rows.map((r) => {
                const item = itemsByCode.get(r.workItemCode);
                const isPerUnit = item?.distribution === 'PER_UNIT';
                const isRupee = isPerUnit && item?.unit === 'rupee-1000';
                return (
                  <div
                    key={r._id}
                    className="grid gap-2 rounded-sm border border-border p-2 md:grid-cols-[1fr_auto_auto]"
                  >
                    <Select
                      value={r.workItemCode}
                      onChange={(e) =>
                        updateRow(r._id, { workItemCode: e.target.value })
                      }
                    >
                      {grouped.map((g) => (
                        <optgroup key={g.domain} label={domainLabel(g.domain)}>
                          {g.items.map((it) => (
                            <option key={it.code} value={it.code}>
                              {it.labelEn}
                              {it.labelHi ? ` / ${it.labelHi}` : ''} (
                              {fmtPoints(it.points)} pts)
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>

                    {isPerUnit ? (
                      <div className="flex items-center gap-1">
                        {/* No width class here. `cn` is clsx, not
                            tailwind-merge, and `.w-full` is emitted after
                            `.w-28`, so the `w-28` that used to sit here never
                            won a single pixel — it only told the next reader
                            something untrue. The field flexes beside its unit
                            label, which is what it was doing anyway. */}
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder={isRupee ? '₹ amount' : 'Qty'}
                          value={isRupee ? r.amountRupees : r.quantity}
                          onChange={(e) =>
                            updateRow(
                              r._id,
                              isRupee
                                ? { amountRupees: e.target.value }
                                : { quantity: e.target.value },
                            )
                          }
                        />
                        <span className="whitespace-nowrap text-xs text-text-subtle">
                          {unitLabel(item?.unit)}
                        </span>
                      </div>
                    ) : (
                      <span className="flex items-center whitespace-nowrap text-xs text-text-subtle">
                        {item ? distributionLabel(item.distribution) : ''}
                      </span>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(r._id)}
                      aria-label="Remove work"
                      leftIcon={<Trash2 width={14} height={14} strokeWidth={1.75} />}
                    >
                      Remove
                    </Button>

                    {/* Spans the row: "Other cleaning work" says nothing on its
                        own, so it has to say what was actually done. */}
                    {requiresDescription(r.workItemCode) ? (
                      <div className="md:col-span-3">
                        <Label htmlFor={`note-${r._id}`} required>
                          What was done?
                        </Label>
                        <Input
                          id={`note-${r._id}`}
                          value={r.note}
                          maxLength={WORK_NOTE_MAX}
                          placeholder="e.g. washed the canopy"
                          onChange={(e) => updateRow(r._id, { note: e.target.value })}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <p className="text-right text-sm text-text-muted">
                Estimated total:{' '}
                <span className="font-semibold text-text tabular-nums">
                  {fmtPoints(estTotal)} pts
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Meta. The work date keeps a whole column to itself below md: the
            native date control's intrinsic width in the Android WebView is
            ~150-170px, so a two-up track is where a date field starts running
            off the right edge of the sheet — and `main` clips rather than
            scrolls. `md:`, never `sm:`; 640px is not a breakpoint any phone in
            scope reaches. */}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="award-date">Work date</Label>
            <Input
              id="award-date"
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="award-note">Note (optional)</Label>
          <Textarea
            id="award-note"
            rows={2}
            placeholder="Anything worth recording about this award…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
