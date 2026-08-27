import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
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
  ClampedText,
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
  useBankHolidayMonthQuery,
  useConfirmBankHolidayMonth,
} from '@/hooks/api/useBankHolidays';
import { ApiError } from '@/lib/api';
import type { BankHolidayMonthRow } from '@dk/shared';
import type { ConfirmBankHolidayMonthInput } from '@dk/shared/schemas';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Sat, 15 Aug 2026" from the calendar date + its weekday (0=Sun…6=Sat). */
function formatHolidayDate(date: string, weekday: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  const day = d.getUTCDate();
  const monthName = d.toLocaleDateString(undefined, {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${WEEKDAY_LABELS[weekday] ?? ''}, ${day} ${monthName} ${d.getUTCFullYear()}`;
}

/** "August 2026" for the given year + 1-based month. */
function monthLabelOf(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/** Two-digit padded date string, e.g. year 2026 month 8 day 1 -> "2026-08-01". */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function BankHolidaysPage() {
  const toast = useToast();
  const [search, setSearch] = useSearchParams();

  // Default to the COMING month (next calendar month from today).
  const { defaultYear, defaultMonth } = React.useMemo(() => {
    const d = new Date();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return { defaultYear: next.getFullYear(), defaultMonth: next.getMonth() + 1 };
  }, []);

  const year = Number(search.get('year')) || defaultYear;
  const month = Number(search.get('month')) || defaultMonth;
  const monthLabel = monthLabelOf(year, month);

  const monthQ = useBankHolidayMonthQuery(year, month);
  const confirm = useConfirmBankHolidayMonth();

  // Local editable copy of the fetched rows. Nothing persists until Save.
  const [rows, setRows] = React.useState<BankHolidayMonthRow[]>([]);
  const [addOpen, setAddOpen] = React.useState(false);

  // Reset the local draft whenever the fetched month (or its data revision)
  // changes — a fresh fetch, a month switch, or a confirmed save all land here.
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

  function addRow(row: BankHolidayMonthRow) {
    setRows((prev) =>
      [...prev, row].sort((a, b) => a.date.localeCompare(b.date)),
    );
  }

  /* Whether the local draft has drifted from what the server sent. Save used to
     be the only clue that anything was unsaved, and on a phone it sits at the
     top of a list 900-1800px long — so the admin edited names, scrolled away,
     and had no way to tell. Both arrays are date-sorted (the server sends them
     that way and `addRow` re-sorts), so a positional compare is enough. */
  const dirty = React.useMemo(() => {
    const saved = monthQ.data?.rows ?? [];
    if (saved.length !== rows.length) return true;
    return rows.some((r, i) => {
      const was = saved[i];
      return (
        !was ||
        was.date !== r.date ||
        was.name !== r.name ||
        was.enabled !== r.enabled
      );
    });
  }, [rows, monthQ.data]);

  async function save() {
    // An enabled date with no name would silently vanish server-side — block it.
    if (rows.some((r) => r.enabled && !r.name.trim())) {
      toast.error('Every enabled holiday needs a name.');
      return;
    }
    const input: ConfirmBankHolidayMonthInput = {
      year,
      month,
      holidays: rows
        .filter((r) => r.name.trim())
        .map((r) => ({
          date: r.date,
          name: r.name.trim(),
          source: r.source,
          type: r.type,
          enabled: r.enabled,
        })),
    };
    try {
      await confirm.mutateAsync(input);
      toast.success(`Bank holidays confirmed for ${monthLabel}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save holidays');
    }
  }

  return (
    <div>
      <PageHeader
        title="Bank holidays"
        subtitle="Confirm the bank & national holidays the Credit & DOD engine treats as non-working days."
        actions={
          // Below md this moves to the StickyActionBar at the foot of the page;
          // `hidden` beats `Button`'s own `inline-flex` (Tailwind emits
          // `.hidden` last), and `md:inline-flex` puts it back at md.
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

      <HowItWorksNote />

      <Card>
        {/* `action`, not a second child. As a child, "Add holiday" was one more
            item in a `justify-between` row that cannot wrap: 240px of month nav
            + 120px of button needs 372px, the header has 296px at 360px, and
            `main` is `overflow-x-hidden` — so the button was not scrolled off,
            it was CUT off. And once a month has any rows the empty-state CTA
            stops rendering, so that button was the only way to add a state or
            bank holiday from a phone. */}
        <CardHeader
          action={
            // Below md the same action is the `+` at the end of the month row,
            // where it costs nothing; as a header `action` it would still buy a
            // whole 52px line of its own for one small button.
            <Button
              className="hidden md:inline-flex"
              variant="secondary"
              size="sm"
              onClick={() => setAddOpen(true)}
              leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
            >
              Add holiday
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
            {/* The 9rem floor is a desktop nicety — it stops the label jumping
                between "May 2026" and "September 2026". Below md it is 144px
                the two arrows would rather have. */}
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
            <IconButton
              className="md:hidden"
              variant="secondary"
              size="sm"
              onClick={() => setAddOpen(true)}
              aria-label="Add holiday"
            >
              <Plus width={16} height={16} strokeWidth={1.75} />
            </IconButton>
          </div>
        </CardHeader>

        {/* The body is the month's list, so below md it runs to the card's own
            edges. `md:p-4` is md+ unchanged: `cn` is clsx and `.p-4` is emitted
            after `.p-0`, so the old call-site `p-0` never won there either. */}
        <CardContent padding="none" className="md:p-4">
          {monthQ.isLoading ? (
            <ListSkeleton />
          ) : monthQ.isError ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load bank holidays"
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
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<CalendarDays width={28} height={28} strokeWidth={1.75} />}
              title={`No holidays for ${monthLabel}`}
              description="The library has no national holidays this month. Add any state or bank holidays that apply."
              cta={
                <Button
                  size="sm"
                  onClick={() => setAddOpen(true)}
                  leftIcon={<Plus width={14} height={14} strokeWidth={1.75} />}
                >
                  Add holiday
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
                      <TH>Holiday name</TH>
                      <TH>Source</TH>
                      <TH>Type</TH>
                      <TH className="text-center">Enabled</TH>
                      <TH className="text-right">Actions</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {rows.map((r) => (
                      <TRow key={r.date} className={r.enabled ? undefined : 'opacity-60'}>
                        <TD className="whitespace-nowrap font-medium">
                          {formatHolidayDate(r.date, r.weekday)}
                        </TD>
                        <TD>
                          <Input
                            value={r.name}
                            onChange={(e) => updateName(r.date, e.target.value)}
                            placeholder="Holiday name"
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
                        <TD className="text-text-muted">{r.type ?? '—'}</TD>
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
                    ))}
                  </TBody>
                </Table>
              </div>

              {/* Mobile card-stack (< md) */}
              <MobileCardList
                variant="rows"
                cards={rows.map((r) => ({
                  key: r.date,
                  // `muted` is the phone counterpart of the desktop row's
                  // `opacity-60`: without it a date that will NOT count read
                  // exactly like one that will, apart from a checkbox state.
                  tone: r.enabled ? 'default' : 'muted',
                  primary: (
                    <span className="font-medium text-text">
                      {formatHolidayDate(r.date, r.weekday)}
                    </span>
                  ),
                  // `clamp`, because the default right rail is `shrink-0`: two
                  // badges at max-content took ~215px of a 280px card and
                  // squeezed "Sat, 15 Aug 2026" onto four lines.
                  primaryRightWidth: 'clamp',
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
                      placeholder="Holiday name"
                      aria-label={`Name for ${r.date}`}
                    />
                  ),
                  // A manually added date carries `type: 'manual'`, which is
                  // word-for-word the badge already sitting on the same row —
                  // so every manual holiday printed "Manual" twice, once in a
                  // badge and once in grey underneath it. Only show the type
                  // where it says something the badge does not ('public',
                  // 'bank'). The desktop table has its own Source and Type
                  // columns and is untouched.
                  meta:
                    r.type && r.type.toLowerCase() !== r.source.toLowerCase() ? (
                      <span>{r.type}</span>
                    ) : undefined,
                  actions: (
                    <div className="flex items-center justify-between gap-2">
                      {/* This tick is what decides whether the date pushes a
                          Credit & DOD due date. It was a 16px box in a 20px
                          line; the whole label is now a 44px target. */}
                      <Checkbox
                        label="Counts as holiday"
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
                }))}
              />

              {monthQ.isFetching ? (
                <p className="px-3 pb-2 text-xs text-text-subtle">Refreshing...</p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {/* Below md the Save that lives in the PageHeader is 900-1800px above the
          edits it commits. The tab bar is an in-flow flex child, so a sticky
          bar inside `main` already rests above it — no z-index, no 56px
          arithmetic — and `StickyActionBar` carries its own bottom inset. */}
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

      <AddHolidayDialog
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

/**
 * The 330-character standing instruction above the month.
 *
 * At 294px of `text-sm` that is nine lines — ~206px of a 740px screen, every
 * visit, above a list the admin came here to edit. Below md it shows the first
 * two lines with a control that opens the rest; the sentence about unchecking
 * versus Remove is the one that stops a suggested holiday being deleted by
 * mistake, so it has to stay reachable rather than be clamped away. From md up
 * the whole paragraph is printed as it always has been and the toggle is gone.
 *
 * `ClampedText` rather than the hand-rolled clamp this used to be: it measures
 * the overflow, so "Show more" no longer sits under a paragraph that already
 * fits — a permanent toggle that does nothing is one the admin stops reading.
 * Its `<p className="text-sm text-text-muted">` is the same element
 * `CardSubtitle` drew, and at md it is unclamped with no toggle, which is what
 * `md:line-clamp-none` plus `md:hidden` rendered before.
 */
function HowItWorksNote() {
  return (
    <Card className="mb-4">
      <CardContent className="py-3">
        <ClampedText
          className="text-sm text-text-muted"
          moreLabel="Show more"
          lessLabel="Show less"
        >
          Enabled dates push the Credit &amp; DOD payment deadline to the next
          working day — just like Sundays and 2nd &amp; 4th Saturdays. Library
          suggestions are national holidays; add state or bank-specific
          holidays manually. To exclude a suggested national holiday, uncheck
          its Enabled box and save (Remove is for manually-added dates).
        </ClampedText>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────── Add holiday dialog ───────────────────────────── */

function AddHolidayDialog({
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
  onAdd: (row: BankHolidayMonthRow) => void;
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
      toast.error('Enter a holiday name.');
      return;
    }
    const d = new Date(`${date}T00:00:00Z`);
    if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month) {
      toast.error(`Date must fall in ${monthLabel}.`);
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
    });
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Add holiday"
      description={`Add a state or bank holiday for ${monthLabel}. Save the month to persist it.`}
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
          <Label htmlFor="bh-date" required>
            Date
          </Label>
          <Input
            id="bh-date"
            type="date"
            value={date}
            min={monthStart}
            max={monthEnd}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="bh-name" required>
            Holiday name
          </Label>
          <Input
            id="bh-name"
            value={name}
            placeholder="e.g. Maharashtra Day"
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
