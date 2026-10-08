import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Lock,
  Plus,
  Trash2,
} from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Dialog,
  EmptyState,
  IconButton,
  Input,
  Label,
  MobileCardList,
  Skeleton,
  StickyActionBar,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  useToast,
} from '@/components/ui';
import {
  useConfirmDepotHolidayMonth,
  useDepotHolidayMonthQuery,
} from '@/hooks/api/useDepotHolidays';
import { ApiError } from '@/lib/api';
import {
  buildConfirmHolidays,
  formatHolidayDate,
  isRowEditable,
  monthLabelOf,
  pad2,
  rowsDirty,
  rowsMissingName,
} from '@/pages/depotHolidaysFormat';
import type { DepotHolidayMonthRow } from '@dk/shared';

export function DepotHolidaysPage() {
  const toast = useToast();
  const [search, setSearch] = useSearchParams();

  // Default to the COMING month (next calendar month from today) — the admin
  // opens this screen to plan ahead of a closure, not to look back.
  const { defaultYear, defaultMonth } = React.useMemo(() => {
    const d = new Date();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return { defaultYear: next.getFullYear(), defaultMonth: next.getMonth() + 1 };
  }, []);

  const year = Number(search.get('year')) || defaultYear;
  const month = Number(search.get('month')) || defaultMonth;
  const monthLabel = monthLabelOf(year, month);

  const monthQ = useDepotHolidayMonthQuery(year, month);
  const confirm = useConfirmDepotHolidayMonth();

  // Local editable copy of the fetched rows (weekly Sundays included, but
  // never edited). Nothing persists until Save.
  const [rows, setRows] = React.useState<DepotHolidayMonthRow[]>([]);
  const [addOpen, setAddOpen] = React.useState(false);

  React.useEffect(() => {
    if (monthQ.data) {
      setRows(monthQ.data.rows.map((r) => ({ ...r })));
    }
  }, [monthQ.data, year, month]);

  function goToMonth(y: number, m: number) {
    const next = new URLSearchParams(search);
    next.set('year', String(y));
    next.set('month', String(m));
    setSearch(next, { replace: true });
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    goToMonth(d.getFullYear(), d.getMonth() + 1);
  }

  function updateName(date: string, name: string) {
    setRows((prev) => prev.map((r) => (r.date === date ? { ...r, name } : r)));
  }

  function toggleEnabled(date: string) {
    setRows((prev) =>
      prev.map((r) => (r.date === date ? { ...r, enabled: !r.enabled } : r)),
    );
  }

  function removeRow(date: string) {
    setRows((prev) => prev.filter((r) => r.date !== date));
  }

  function addRow(row: DepotHolidayMonthRow) {
    setRows((prev) =>
      [...prev, row].sort((a, b) => a.date.localeCompare(b.date)),
    );
  }

  const dirty = React.useMemo(
    () => rowsDirty(monthQ.data?.rows ?? [], rows),
    [rows, monthQ.data],
  );

  async function save() {
    if (rowsMissingName(rows)) {
      toast.error('Every enabled closure needs a name.');
      return;
    }
    try {
      await confirm.mutateAsync({
        year,
        month,
        holidays: buildConfirmHolidays(rows),
      });
      toast.success(`Depot holidays confirmed for ${monthLabel}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save depot holidays');
    }
  }

  const editableRows = rows.filter(isRowEditable);

  return (
    <div>
      <PageHeader
        title="Depot holidays"
        subtitle="Days the depot (Barauni Terminal) loads no tankers. The Load Planner asks dealers to order earlier before these days. Sundays are always closed."
        actions={
          <Button
            className="hidden md:inline-flex"
            onClick={save}
            loading={confirm.isPending}
            disabled={monthQ.isLoading || !monthQ.data}
          >
            Save {monthLabel}
          </Button>
        }
      />

      <Card>
        <CardHeader
          action={
            <Button
              className="hidden md:inline-flex"
              variant="secondary"
              size="sm"
              onClick={() => setAddOpen(true)}
              leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
            >
              Add closure
            </Button>
          }
        >
          <div className="flex items-center gap-2">
            <IconButton
              variant="secondary"
              size="sm"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft width={16} height={16} strokeWidth={1.75} />
            </IconButton>
            <div className="min-w-0 flex-1 text-center text-base font-semibold text-text md:min-w-[9rem] md:flex-initial">
              {monthLabel}
            </div>
            <IconButton
              variant="secondary"
              size="sm"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
            >
              <ChevronRight width={16} height={16} strokeWidth={1.75} />
            </IconButton>
          </div>
          <div className="mt-2 md:hidden">
            <Button
              className="w-full"
              variant="secondary"
              onClick={() => setAddOpen(true)}
              leftIcon={<Plus width={16} height={16} strokeWidth={1.75} />}
            >
              Add closure
            </Button>
          </div>
        </CardHeader>

        <CardContent padding="none" className="md:p-4">
          {monthQ.isLoading ? (
            <ListSkeleton />
          ) : monthQ.isError ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load depot holidays"
              description={
                monthQ.error instanceof ApiError
                  ? monthQ.error.message
                  : 'Please try again.'
              }
              cta={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void monthQ.refetch()}
                >
                  Retry
                </Button>
              }
            />
          ) : (
            <>
              {/* Desktop table (>= md) */}
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Date</TH>
                      <TH>Closure name</TH>
                      <TH>Source</TH>
                      <TH className="text-center">Depot closed</TH>
                      <TH className="text-right">Actions</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {rows.map((r) =>
                      r.weekly ? (
                        <TRow key={r.date} className="opacity-60">
                          <TD className="whitespace-nowrap font-medium">
                            {formatHolidayDate(r.date, r.weekday)}
                          </TD>
                          <TD className="text-text-muted">{r.name}</TD>
                          <TD>
                            <Badge intent="neutral">Every Sunday</Badge>
                          </TD>
                          <TD className="text-center">
                            <Lock
                              width={14}
                              height={14}
                              strokeWidth={1.75}
                              className="mx-auto text-text-subtle"
                              aria-label="Always closed"
                            />
                          </TD>
                          <TD className="text-right">
                            <span className="text-xs text-text-subtle">Always closed</span>
                          </TD>
                        </TRow>
                      ) : (
                        <TRow key={r.date}>
                          <TD className="whitespace-nowrap font-medium">
                            {formatHolidayDate(r.date, r.weekday)}
                          </TD>
                          <TD>
                            <Input
                              value={r.name}
                              onChange={(e) => updateName(r.date, e.target.value)}
                              placeholder="Closure name"
                              aria-label={`Name for ${r.date}`}
                            />
                          </TD>
                          <TD>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge intent={r.source === 'library' ? 'info' : 'neutral'}>
                                {r.source === 'library' ? 'Suggested' : 'Manual'}
                              </Badge>
                              {r.source === 'library' && !r.persisted ? (
                                <Badge intent="warning">Needs confirmation</Badge>
                              ) : null}
                            </div>
                          </TD>
                          <TD className="text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-border-strong accent-brand"
                              checked={r.enabled}
                              onChange={() => toggleEnabled(r.date)}
                              aria-label={`Enable ${r.name || r.date}`}
                            />
                          </TD>
                          <TD className="text-right">
                            {r.source === 'manual' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeRow(r.date)}
                                leftIcon={<Trash2 width={14} height={14} strokeWidth={1.75} />}
                              >
                                Remove
                              </Button>
                            ) : (
                              <span className="text-xs text-text-subtle">
                                Uncheck to exclude
                              </span>
                            )}
                          </TD>
                        </TRow>
                      ),
                    )}
                  </TBody>
                </Table>
              </div>

              {/* Mobile card-stack (< md) */}
              <MobileCardList
                variant="rows"
                cards={rows.map((r) =>
                  r.weekly
                    ? {
                        key: r.date,
                        tone: 'muted' as const,
                        primary: (
                          <span className="font-medium text-text">
                            {formatHolidayDate(r.date, r.weekday)}
                          </span>
                        ),
                        primaryRightWidth: 'clamp' as const,
                        primaryRight: <Badge intent="neutral">Every Sunday</Badge>,
                        secondary: (
                          <span className="text-text-muted">{r.name}</span>
                        ),
                        actions: (
                          <span className="text-xs text-text-subtle">Always closed</span>
                        ),
                      }
                    : {
                        key: r.date,
                        tone: r.enabled ? ('default' as const) : ('muted' as const),
                        primary: (
                          <span className="font-medium text-text">
                            {formatHolidayDate(r.date, r.weekday)}
                          </span>
                        ),
                        primaryRightWidth: 'clamp' as const,
                        primaryRight: (
                          <>
                            <Badge intent={r.source === 'library' ? 'info' : 'neutral'}>
                              {r.source === 'library' ? 'Suggested' : 'Manual'}
                            </Badge>
                            {r.source === 'library' && !r.persisted ? (
                              <Badge intent="warning">Needs confirmation</Badge>
                            ) : null}
                          </>
                        ),
                        secondary: (
                          <Input
                            value={r.name}
                            onChange={(e) => updateName(r.date, e.target.value)}
                            placeholder="Closure name"
                            aria-label={`Name for ${r.date}`}
                          />
                        ),
                        actions: (
                          <div className="flex items-center justify-between gap-2">
                            <Checkbox
                              label="Depot closed"
                              labelClassName="min-w-0 flex-1"
                              checked={r.enabled}
                              onChange={() => toggleEnabled(r.date)}
                              aria-label={`Enable ${r.name || r.date}`}
                            />
                            {r.source === 'manual' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="shrink-0"
                                onClick={() => removeRow(r.date)}
                                leftIcon={<Trash2 width={14} height={14} strokeWidth={1.75} />}
                              >
                                Remove
                              </Button>
                            ) : null}
                          </div>
                        ),
                      },
                )}
              />

              {editableRows.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays width={28} height={28} strokeWidth={1.75} />}
                  title={`No extra closures for ${monthLabel}`}
                  description="Sundays are already closed above. Add any festival or local closure the depot observes."
                  cta={
                    <Button
                      size="sm"
                      onClick={() => setAddOpen(true)}
                      leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
                    >
                      Add closure
                    </Button>
                  }
                />
              ) : null}

              {monthQ.isFetching ? (
                <p className="px-3 pb-2 text-xs text-text-subtle">Refreshing...</p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <StickyActionBar
        visibility="below-md"
        summary={dirty ? 'Unsaved changes' : 'No unsaved changes'}
        summaryOnMobile
      >
        <Button
          onClick={save}
          loading={confirm.isPending}
          disabled={monthQ.isLoading || !monthQ.data}
        >
          Save {monthLabel}
        </Button>
      </StickyActionBar>

      <AddClosureDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        year={year}
        month={month}
        monthLabel={monthLabel}
        existingDates={rows.map((r) => r.date)}
        onAdd={addRow}
      />
    </div>
  );
}

/* ─────────────────────────── Add closure dialog ───────────────────────────── */

function AddClosureDialog({
  open,
  onClose,
  year,
  month,
  monthLabel,
  existingDates,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  year: number;
  month: number;
  monthLabel: string;
  existingDates: string[];
  onAdd: (row: DepotHolidayMonthRow) => void;
}) {
  const toast = useToast();
  const [date, setDate] = React.useState('');
  const [name, setName] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setDate('');
      setName('');
    }
  }, [open]);

  const monthStart = `${year}-${pad2(month)}-01`;
  const monthEnd = `${year}-${pad2(month)}-${pad2(new Date(year, month, 0).getDate())}`;

  function submit() {
    if (!date) {
      toast.error('Pick a date.');
      return;
    }
    if (!name.trim()) {
      toast.error('Enter a closure name.');
      return;
    }
    const d = new Date(`${date}T00:00:00Z`);
    if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month) {
      toast.error(`Date must fall in ${monthLabel}.`);
      return;
    }
    if (d.getUTCDay() === 0) {
      toast.error('Sundays are already closed every week — no need to add one.');
      return;
    }
    if (existingDates.includes(date)) {
      toast.error('That date is already listed.');
      return;
    }
    onAdd({
      id: null,
      date,
      weekday: d.getUTCDay(),
      name: name.trim(),
      source: 'manual',
      enabled: true,
      persisted: false,
      weekly: false,
    });
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Add closure"
      description={`Add a day the depot does not load, for ${monthLabel}. Save the month to persist it.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Add</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div>
          <Label htmlFor="dh-date" required>
            Date
          </Label>
          <Input
            id="dh-date"
            type="date"
            value={date}
            min={monthStart}
            max={monthEnd}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="dh-name" required>
            Closure name
          </Label>
          <Input
            id="dh-name"
            value={name}
            placeholder="e.g. Maintenance shutdown"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-2 p-3 md:p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-11" />
      ))}
    </div>
  );
}
