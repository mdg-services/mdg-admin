import { Droplets, Share2 } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Callout,
  DataList,
  EmptyState,
  HowThisWorks,
  Label,
  Select,
  Skeleton,
  useToast,
  type DataColumn,
} from '@/components/ui';
import { useWaterIngressCard, useWaterIngressDays } from '@/hooks/api/useWaterIngress';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatYmd, istTodayYmd } from '@/lib/format';
import { shareActionLabel, shareSavedImage } from '@/lib/shareCard';
import { dealerCodeLabel, type WaterIngressDayLog, type WaterIngressSlotRecord } from '@dk/shared';

import type { DealerVaultPaneProps } from './types';

/**
 * Water Ingress Testing, one day at a time.
 *
 * The service has been writing a document per dealer per day since it shipped
 * and nothing could read it, so this is the first screen over that record. The
 * question it answers is the one a compliance conversation actually starts with
 * — "which two-hour windows did this outlet miss, and on which day" — which is
 * why the grid is the body of the pane rather than a drill-in.
 *
 * A window can only be filled in while the clock is inside it. That makes a
 * missed window permanent, and it is why this pane distinguishes a window that
 * is STILL OPEN from one that closed unrecorded: on today's date the two look
 * identical in the stored record and mean opposite things.
 */

/** Minutes past IST midnight, right now — the same clock the backend keys on. */
function istNowMinutes(): number {
  const ist = new Date(Date.now() + 330 * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

interface SlotRow extends WaterIngressSlotRecord {
  /** Today only: the window has not finished, so it is not yet a miss. */
  stillOpen: boolean;
}

const COLUMNS: DataColumn<SlotRow>[] = [
  { id: 'slot', header: 'Time slot', mobile: 'primary', cell: (s) => s.label },
  {
    id: 'status',
    header: 'Status',
    mobile: 'primaryRight',
    mobileLabel: 'Status',
    cell: (s) =>
      s.recorded ? (
        <Badge intent="success">Recorded</Badge>
      ) : s.stillOpen ? (
        <Badge intent="neutral">Still open</Badge>
      ) : (
        <Badge intent="danger">Missed</Badge>
      ),
  },
  {
    id: 'ingress',
    header: 'Water ingress',
    mobileLabel: 'Water ingress',
    // Only a row THIS service wrote is known to say "no ingress" — it is what
    // the service writes by definition. A row filled in at the outlet could say
    // anything and we never read it back, so it gets a dash, not an assumed N.
    cell: (s) => (s.markedByServiceAt ? 'None found' : '—'),
  },
  {
    id: 'updated',
    header: 'Updated on',
    mobileLabel: 'Updated on',
    cell: (s) => s.updatedOn || '—',
  },
  {
    id: 'by',
    header: 'Recorded by',
    mobileLabel: 'Recorded by',
    cell: (s) => (s.recorded ? (s.markedByServiceAt ? 'MDG automation' : 'At the outlet') : '—'),
  },
];

/** One figure in the day's header strip. */
function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">{label}</p>
      <p
        className={`mt-1 break-words text-xl font-semibold tabular-nums md:text-2xl ${
          tone === 'bad' ? 'text-danger' : tone === 'good' ? 'text-success' : 'text-text'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function DealerWaterIngressPane({ dealer }: DealerVaultPaneProps) {
  const toast = useToast();
  const q = useWaterIngressDays(dealer.id);
  const days = React.useMemo(() => q.data?.days ?? [], [q.data]);

  const [date, setDate] = React.useState<string | null>(null);
  const day = days.find((d) => d.businessDate === date) ?? days[0] ?? null;

  /**
   * The picture comes from the SERVER, not from this page.
   *
   * A finished day is archived the moment its last window is recorded — at
   * eleven at night, with no browser open anywhere — so the server has to be
   * able to draw it. Once it can, having the admin draw its own copy as well
   * would mean two renderers of one card, quietly drifting apart. So there is
   * one, and this asks it for the file.
   */
  const card = useWaterIngressCard(dealer.id);
  const [pending, setPending] = React.useState<string | null>(null);
  const onShare = React.useCallback(
    async (businessDate: string) => {
      setPending(businessDate);
      try {
        const urls = await card.mutateAsync(businessDate);
        const res = await shareSavedImage(urls);
        if (res.outcome === 'downloaded') toast.success('Image saved to your Downloads.');
        else if (res.outcome === 'failed') {
          toast.error(res.reason ?? 'The image could not be saved.');
        }
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : 'The image for that day could not be prepared.',
        );
      } finally {
        setPending(null);
      }
    },
    [card, toast],
  );

  const historyColumns: DataColumn<WaterIngressDayLog>[] = React.useMemo(
    () => [
      {
        id: 'day',
        header: 'Day',
        mobile: 'primary',
        cell: (d) => (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="whitespace-nowrap">{formatYmd(d.businessDate, { weekday: true })}</span>
            {d.businessDate === date ? <Badge intent="info">Showing</Badge> : null}
          </span>
        ),
      },
      {
        id: 'compliance',
        header: 'Compliance',
        mobile: 'primaryRight',
        mobileLabel: 'Compliance',
        numeric: true,
        cell: (d) => `${d.compliancePercent}%`,
      },
      {
        id: 'windows',
        header: 'Windows',
        mobileLabel: 'Windows',
        numeric: true,
        cell: (d) => `${d.recordedSlots} of ${d.totalSlots}`,
      },
      {
        id: 'saved',
        header: 'Image',
        mobileLabel: 'Image',
        cell: (d) =>
          d.card ? (
            <Badge intent="success">Saved</Badge>
          ) : (
            <span className="text-text-muted">Not saved yet</span>
          ),
      },
      {
        id: 'get',
        header: '',
        cell: (d) => (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Share2 width={15} height={15} strokeWidth={1.75} />}
            loading={pending === d.businessDate}
            // The row itself selects the day; this must not do both.
            onClick={(e) => {
              e.stopPropagation();
              void onShare(d.businessDate);
            }}
          >
            {shareActionLabel()}
          </Button>
        ),
      },
    ],
    [date, onShare, pending],
  );

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <EmptyState
        icon={<Droplets width={28} height={28} strokeWidth={1.75} />}
        title={notFound ? 'This dealer was not found' : 'Could not load the water ingress record'}
        description={q.error instanceof Error ? q.error.message : 'Please try again.'}
      />
    );
  }

  if (!day) {
    return (
      <EmptyState
        icon={<Droplets width={28} height={28} strokeWidth={1.75} />}
        title="Nothing recorded yet"
        description="Water Ingress Testing has not logged a day for this dealer. Attach the service, or wait for its first run to read the portal's grid."
      />
    );
  }

  const isToday = day.businessDate === istTodayYmd();
  const nowMinutes = istNowMinutes();
  const rows: SlotRow[] = day.slots.map((s) => ({
    ...s,
    stillOpen: isToday && s.endMinutes > nowMinutes && !s.recorded,
  }));
  const missed = rows.filter((s) => !s.recorded && !s.stillOpen);
  const open = rows.filter((s) => s.stillOpen).length;

  return (
    <div className="space-y-3 md:space-y-4">
      <Card>
        <CardHeader
          action={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                leftIcon={<Share2 width={16} height={16} strokeWidth={1.75} />}
                onClick={() => void onShare(day.businessDate)}
                loading={pending === day.businessDate}
              >
                {shareActionLabel()}
              </Button>
              <HowThisWorks
                surface="admin-dealer-vault-water-ingress"
                label="Water ingress"
                variant="icon"
              />
            </div>
          }
        >
          <CardTitle>{dealerCodeLabel(q.data?.outletCode)} · water ingress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs">
            <Label htmlFor="wi-date">Day</Label>
            <Select
              id="wi-date"
              value={day.businessDate}
              onChange={(e) => setDate(e.target.value)}
            >
              {days.map((d) => (
                <option key={d.businessDate} value={d.businessDate}>
                  {formatYmd(d.businessDate, { weekday: true })} — {d.recordedSlots}/{d.totalSlots}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:gap-5 lg:grid-cols-4">
            <Stat label="Windows recorded" value={`${day.recordedSlots} of ${day.totalSlots}`} />
            {/* Neutral while windows are still open: a 24-hour outlet that has
                missed nothing reads 17% at breakfast, and red would say the
                opposite of the "0 missed" tile beside it. */}
            <Stat
              label="Compliance"
              value={`${day.compliancePercent}%`}
              tone={open > 0 ? undefined : day.compliancePercent === 100 ? 'good' : 'bad'}
            />
            <Stat
              label="Missed"
              value={String(missed.length)}
              tone={missed.length > 0 ? 'bad' : 'good'}
            />
            <Stat label="Last checked" value={formatDateTime(day.lastRunAt)} />
          </div>

          {missed.length > 0 ? (
            <Callout intent="warning">
              {missed.length === 1 ? 'One window' : `${missed.length} windows`} closed without being
              recorded: {missed.map((s) => s.label).join(', ')}. A window can only be filled in
              while the clock is inside it, so these cannot be recovered.
            </Callout>
          ) : null}

          {isToday && open > 0 ? (
            <Callout intent="info">
              This day is still running — {open === 1 ? 'one window has' : `${open} windows have`}{' '}
              yet to close, so the compliance figure is not final.
            </Callout>
          ) : null}

          {day.lastOutcome === 'FAILED' && day.lastFailure ? (
            <Callout intent="warning">
              The last attempt did not complete ({day.lastFailure.reason}), so the grid below is as
              of the last successful read rather than right now.
            </Callout>
          ) : null}
        </CardContent>
      </Card>

      <DataList
        rows={rows}
        rowKey={(s) => s.label}
        columns={COLUMNS}
        minWidth="46rem"
        freezeFirstColumn
        empty={
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
            The portal listed no observation windows for this day.
          </p>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="max-w-prose text-sm text-text-muted">
            A day is saved as a picture the moment its last window is recorded — nothing about it
            can change after that, because a window can only be filled in while the clock is inside
            it. Days from before this existed, and days that ended short, are drawn the first time
            somebody asks for them.
          </p>
          <DataList
            rows={days}
            rowKey={(d) => d.businessDate}
            columns={historyColumns}
            onRowClick={(d) => setDate(d.businessDate)}
            minWidth="42rem"
            freezeFirstColumn
            empty={
              <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
                No days recorded yet.
              </p>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
