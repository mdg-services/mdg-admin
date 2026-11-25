import { ChevronRight } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Callout,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  SegmentedControl,
  Skeleton,
  useToast,
} from '@/components/ui';
import { KavachSwitch, PctRing } from '@/features/kavach/KavachSwitch';
import {
  useKavachOutletsQuery,
  useSetKavachOutletOn,
  useSwitchKavachOutlets,
} from '@/hooks/api/useKavach';
import { filterOutlets, type OutletFilter, outletFigures, outletsWord } from '@/lib/kavachWords';
import type { KavachOutletRow } from '@dk/shared';

/**
 * Every outlet and whether Kavach is running for it: the switch, how much is
 * done, what is to do, late and waiting for a person. Kavach starts off for
 * every outlet; this page (or Start services, for a new one) turns it on.
 */
export function KavachOutletsPage() {
  const toast = useToast();
  const outletsQ = useKavachOutletsQuery();
  const setOn = useSetKavachOutletOn();
  const switchMany = useSwitchKavachOutlets();
  const [filter, setFilter] = React.useState<OutletFilter>('all');
  const [query, setQuery] = React.useState('');
  const [allOpen, setAllOpen] = React.useState(false);
  const [turnOff, setTurnOff] = React.useState<KavachOutletRow | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const rows = React.useMemo(() => outletsQ.data ?? [], [outletsQ.data]);
  const shown = React.useMemo(() => filterOutlets(rows, filter, query), [rows, filter, query]);
  const offRows = rows.filter((r) => !r.on);
  const onCount = rows.length - offRows.length;

  function flip(row: KavachOutletRow, on: boolean) {
    setBusyId(row.dealerId);
    setOn.mutate(
      { dealerId: row.dealerId, on },
      {
        onSuccess: () => toast.success(`Kavach is ${on ? 'on' : 'off'} for ${row.dealerCode}.`),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'That did not go through. Try again.'),
        onSettled: () => {
          setBusyId(null);
          setTurnOff(null);
        },
      },
    );
  }

  return (
    <div>
      <PageHeader
        title="Kavach outlets"
        subtitle={
          outletsQ.isSuccess ? `On for ${onCount} of ${outletsWord(rows.length)}` : 'Where Kavach is running'
        }
        actions={
          <Button
            variant="secondary"
            disabled={offRows.length === 0 || switchMany.isPending}
            onClick={() => setAllOpen(true)}
          >
            Turn on for all
          </Button>
        }
      />

      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
        <SegmentedControl<OutletFilter>
          aria-label="Show outlets"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
        <Input
          type="search"
          aria-label="Find an outlet"
          placeholder="Find an outlet"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="md:max-w-xs"
        />
      </div>

      {outletsQ.isError ? (
        <Callout onRetry={() => void outletsQ.refetch()}>The outlets could not be loaded.</Callout>
      ) : outletsQ.isLoading ? (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            title={rows.length === 0 ? 'No outlets yet' : 'No outlet matches'}
            description={rows.length === 0 ? undefined : 'Change the filter or the search.'}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div
            aria-hidden
            className="hidden grid-cols-[minmax(0,2fr)_6rem_5rem_5rem_5rem_6rem_1.5rem] items-center gap-3 border-b border-border px-3 py-2 text-xs font-medium text-text-muted md:grid"
          >
            <span>Outlet</span>
            <span>Kavach</span>
            <span className="text-right">Done</span>
            <span className="text-right">To do</span>
            <span className="text-right">Late</span>
            <span className="text-right">To check</span>
            <span />
          </div>
          <ul>
            {shown.map((r) => (
              <OutletRow
                key={r.dealerId}
                row={r}
                busy={busyId === r.dealerId}
                onToggle={(on) => (on ? flip(r, true) : setTurnOff(r))}
              />
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={allOpen}
        onCancel={() => setAllOpen(false)}
        title={`Turn Kavach on for ${outletsWord(offRows.length)}?`}
        description="Checks open for each of them, their app shows the Kavach tab, and the morning push starts."
        confirmLabel={`Turn on for ${outletsWord(offRows.length)}`}
        loading={switchMany.isPending}
        onConfirm={() =>
          switchMany.mutate(
            { dealerIds: offRows.map((r) => r.dealerId), on: true },
            {
              onSuccess: () => {
                toast.success(`Kavach is on for ${outletsWord(offRows.length)}.`);
                setAllOpen(false);
              },
              onError: (e) => {
                toast.error(e instanceof Error ? e.message : 'That did not go through. Try again.');
                setAllOpen(false);
              },
            },
          )
        }
      />
      <ConfirmDialog
        open={!!turnOff}
        onCancel={() => setTurnOff(null)}
        title={turnOff ? `Turn Kavach off for ${turnOff.dealerCode}?` : ''}
        description="New checks stop opening, the Kavach tab goes from their app and the pushes stop. What was already sent stays here."
        confirmLabel="Turn off"
        confirmVariant="danger"
        loading={setOn.isPending}
        onConfirm={() => turnOff && flip(turnOff, false)}
      />
    </div>
  );
}

function OutletRow({
  row,
  busy,
  onToggle,
}: {
  row: KavachOutletRow;
  busy: boolean;
  onToggle: (on: boolean) => void;
}) {
  const f = outletFigures(row);
  const pct = row.on && row.summary ? row.summary.pct : null;
  const href = `/dealers/${row.dealerId}?tab=kavach`;

  return (
    <li className="border-b border-border last:border-0">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 md:grid-cols-[minmax(0,2fr)_6rem_5rem_5rem_5rem_6rem_1.5rem]">
        {/* Outlet: the name opens its Kavach tab. */}
        <div className="col-span-2 min-w-0 md:col-span-1">
          <Link
            to={href}
            className="block min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <span className="text-sm font-semibold text-text">{row.dealerCode}</span>
            <span className="ml-2 break-words text-sm text-text-muted">{row.dealerName}</span>
          </Link>
          {row.oilCompany ? <span className="text-xs text-text-subtle">{row.oilCompany}</span> : null}
        </div>

        <div className="flex items-center gap-1 justify-self-end md:justify-self-start">
          <KavachSwitch
            on={row.on}
            busy={busy}
            label={`Kavach for ${row.dealerCode}`}
            onChange={onToggle}
          />
          <span className="w-7 text-xs text-text-muted">{row.on ? 'On' : 'Off'}</span>
        </div>

        {/* Figures. Off outlets have none. */}
        <div className="col-span-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm md:contents">
          <div className="flex items-center gap-2 md:justify-end">
            <PctRing pct={pct} size={32} />
            <span className="text-xs text-text-muted md:sr-only">done</span>
          </div>
          <Figure label="to do" value={row.on ? f.todo : null} />
          <Figure label="late" value={row.on ? f.late : null} danger />
          <Figure label="to check" value={row.on ? f.waiting : null} />
          <Link
            to={href}
            aria-label={`Open Kavach for ${row.dealerCode}`}
            className="hidden justify-self-end text-text-subtle md:block"
          >
            <ChevronRight width={16} height={16} strokeWidth={1.75} aria-hidden />
          </Link>
        </div>
      </div>
    </li>
  );
}

function Figure({ label, value, danger = false }: { label: string; value: number | null; danger?: boolean }) {
  if (value === null) {
    return (
      <span className="text-sm text-text-subtle md:text-right">
        <span aria-hidden>–</span>
        <span className="sr-only">{label}: none</span>
      </span>
    );
  }
  return (
    <span className="text-sm tabular-nums text-text md:text-right">
      {danger && value > 0 ? <Badge intent="danger">{value} {label}</Badge> : (
        <>
          <span className="font-medium">{value}</span>{' '}
          <span className="text-xs text-text-muted md:sr-only">{label}</span>
        </>
      )}
    </span>
  );
}
