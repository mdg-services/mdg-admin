import {
  AlertCircle,
  BellOff,
  BellRing,
  ClipboardCheck,
  Pause,
  Play,
  RotateCw,
  ShieldCheck,
} from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  Dialog,
  EmptyState,
  Select,
  Skeleton,
  useToast,
} from '@/components/ui';
import {
  useInitiateKavachProgramme,
  useKavachItemsQuery,
  useKavachProgrammeQuery,
  useSetKavachItemPaused,
  useSetKavachSosCompliance,
  useUpdateKavachProgramme,
} from '@/hooks/api/useKavach';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import {
  CADENCE_BUCKET_LABEL,
  CADENCE_BUCKET_ORDER,
  operationalIntent,
  scoreDisclosureParts,
} from '@/lib/kavach';
import {
  dealerCodeLabel,
  type Dealer,
  type KavachCadenceBucket,
  type KavachItem,
} from '@dk/shared';

import { InitiateKavachForm } from './kavach/InitiateKavachForm';
import { KavachItemRow } from './kavach/KavachItemRow';

interface Props {
  dealer: Dealer;
}

/** 00:00–23:00 IST, as a fixed reminder-hour option list. */
const REMINDER_HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: `${String(h).padStart(2, '0')}:00 IST`,
}));

/**
 * The dealer's Kavach panel: SETUP and STANDING, not a working queue.
 *
 * Certifying tasks happens in the cross-dealer work queue, where an admin faces
 * roughly ten verifications per dealer per day and closes them in one pass.
 * Doing it here, dealer by dealer, is the shape that does not scale past eight
 * outlets — so this screen deliberately has no verify control on it.
 */
export function DealerKavachTab({ dealer }: Props) {
  const toast = useToast();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [enableDealerFacingOpen, setEnableDealerFacingOpen] = React.useState(false);

  const programmeQ = useKavachProgrammeQuery(dealer.id);
  const itemsQ = useKavachItemsQuery(dealer.id);

  const initiate = useInitiateKavachProgramme(dealer.id);
  const updateProgramme = useUpdateKavachProgramme(dealer.id);
  const setPaused = useSetKavachItemPaused(dealer.id);
  const setSos = useSetKavachSosCompliance(dealer.id);

  async function withBusy(id: string, fn: () => Promise<unknown>, successMsg: string) {
    setBusyId(id);
    try {
      await fn();
      toast.success(successMsg);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  if (programmeQ.isLoading) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="mb-3 h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (programmeQ.isError) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load programme"
        description={
          programmeQ.error instanceof ApiError
            ? programmeQ.error.message
            : 'Please try again.'
        }
        cta={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RotateCw width={16} height={16} strokeWidth={1.75} />}
            onClick={() => void programmeQ.refetch()}
          >
            Retry
          </Button>
        }
      />
    );
  }

  // No programme yet → show the initiate form.
  if (!programmeQ.data) {
    return (
      <InitiateKavachForm
        dealerCode={dealer.code}
        loading={initiate.isPending}
        onSubmit={async (values) => {
          try {
            await initiate.mutateAsync(values);
            toast.success('Kavach programme initiated');
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Failed to initiate');
          }
        }}
      />
    );
  }

  const programme = programmeQ.data;
  const isPaused = programme.status === 'PAUSED';
  const dealerFacing = programme.dealerFacingEnabled === true;
  const items = itemsQ.data ?? [];

  const grouped = new Map<KavachCadenceBucket, KavachItem[]>();
  for (const item of items) {
    const arr = grouped.get(item.cadenceBucket) ?? [];
    arr.push(item);
    grouped.set(item.cadenceBucket, arr);
  }
  const orderedBuckets = CADENCE_BUCKET_ORDER.filter((b) => grouped.has(b));

  const score = programme.score;
  const pct = Math.round(score.overallPct);
  const disclosure = scoreDisclosureParts({
    overallPct: score.overallPct,
    notYetVerifiedCount: score.notYetVerifiedCount,
    heldCount: score.heldCount,
  });

  async function setDealerFacing(enabled: boolean) {
    await withBusy(
      'dealer-facing',
      () => updateProgramme.mutateAsync({ dealerFacingEnabled: enabled }),
      enabled
        ? 'This dealer will now receive their daily Kavach list'
        : 'Kavach messages to this dealer are off',
    );
    setEnableDealerFacingOpen(false);
  }

  return (
    <div className="grid gap-4">
      {/* Score header */}
      <Card>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-brand-soft text-brand">
                <ShieldCheck width={24} height={24} strokeWidth={1.75} />
              </span>
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  {/* The percentage never travels alone: a bare number hides how
                      much of this dealer nobody has examined yet. */}
                  <span className="text-3xl font-semibold tracking-tight text-text">
                    {disclosure[0]}
                  </span>
                  {disclosure.slice(1).map((part) => (
                    <span key={part} className="text-sm font-medium text-text-muted">
                      · {part}
                    </span>
                  ))}
                  <Badge intent={operationalIntent(pct)}>operational</Badge>
                  {isPaused ? <Badge intent="warning">Paused</Badge> : null}
                </div>
                <p className="text-sm text-text-muted">
                  <span className="font-mono">{dealerCodeLabel(dealer.code)}</span>
                  {' · baseline '}
                  {programme.outlet.monthYear}
                </p>
                <p className="text-xs text-text-subtle">
                  {score.validPoints} / {score.totalPoints} points compliant
                  {score.notYetVerifiedCount > 0
                    ? ` · ${score.notYetVerifiedPoints} points sitting behind ${score.notYetVerifiedCount} task${
                        score.notYetVerifiedCount === 1 ? '' : 's'
                      } nobody has checked`
                    : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* `h-9 w-auto` used to sit on the Select and did nothing at all:
                  `cn` is plain clsx, and Tailwind emits `.h-9` before `.h-11`
                  and `.w-auto` before `.w-full`, so the primitive's own classes
                  won both. The width now lives where it can be honoured — the
                  field fills its row on a phone, and is a fixed 14rem at md. */}
              <div className="flex w-full items-center gap-1.5 md:w-auto">
                <label htmlFor="kavach-digest-hour" className="shrink-0 text-xs text-text-muted">
                  Digest time
                </label>
                <Select
                  id="kavach-digest-hour"
                  className="md:w-56"
                  value={programme.reminderHour ?? ''}
                  disabled={updateProgramme.isPending}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // Placeholder (global default) → no-op; only send a concrete hour.
                    if (raw === '') return;
                    void withBusy(
                      'programme',
                      () => updateProgramme.mutateAsync({ reminderHour: Number(raw) }),
                      'Digest time updated',
                    );
                  }}
                >
                  <option value="">Default (08:00 IST)</option>
                  {REMINDER_HOUR_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={busyId === 'programme'}
                leftIcon={
                  isPaused ? (
                    <Play width={16} height={16} strokeWidth={1.75} />
                  ) : (
                    <Pause width={16} height={16} strokeWidth={1.75} />
                  )
                }
                onClick={() =>
                  withBusy(
                    'programme',
                    () =>
                      updateProgramme.mutateAsync({
                        status: isPaused ? 'ACTIVE' : 'PAUSED',
                      }),
                    isPaused ? 'Programme resumed' : 'Programme paused',
                  )
                }
              >
                {isPaused ? 'Resume' : 'Pause programme'}
              </Button>
              {/* A link, not a Button: the queue is a route, and the whole point
                  of this panel is that certifying happens over there. */}
              <Link
                to={`/kavach?dealerId=${dealer.id}`}
                className="inline-flex h-9 min-h-11 items-center gap-2 rounded-sm bg-brand px-4 text-sm font-medium text-text-inverse hover:bg-brand-hover md:min-h-0"
              >
                <ClipboardCheck width={16} height={16} strokeWidth={1.75} />
                Verify in the work queue
              </Link>
            </div>
          </div>

          {/* Per-bucket sub-scores (admin-only) */}
          {Object.keys(score.byBucket).length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
              {CADENCE_BUCKET_ORDER.filter((b) => score.byBucket[b] != null).map((b) => (
                <Badge key={b} intent="neutral" className="gap-1">
                  <span className="text-text-muted">{CADENCE_BUCKET_LABEL[b]}</span>
                  <span className="font-semibold">
                    {Math.round(score.byBucket[b] as number)}%
                  </span>
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* The gate. Nothing reaches this dealer until an admin turns it on. */}
      <Card>
        <CardContent>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span
                className={
                  dealerFacing
                    ? 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success-soft text-success'
                    : 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-muted'
                }
              >
                {dealerFacing ? (
                  <BellRing width={20} height={20} strokeWidth={1.75} />
                ) : (
                  <BellOff width={20} height={20} strokeWidth={1.75} />
                )}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-text">
                    Dealer-facing messages
                  </p>
                  <Badge intent={dealerFacing ? 'success' : 'neutral'}>
                    {dealerFacing ? 'On' : 'Off'}
                  </Badge>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-text-muted">
                  {dealerFacing
                    ? `This dealer receives their daily Kavach list and can be shown their score card.${
                        programme.dealerFacingEnabledAt
                          ? ` Switched on ${formatDate(programme.dealerFacingEnabledAt)}.`
                          : ''
                      }`
                    : 'While this is off the dealer receives nothing at all — no daily message, no score card. Leave it off until MDG has actually verified this outlet, so their first message is not a figure about work nobody has done yet.'}
                </p>
              </div>
            </div>
            <div className="shrink-0">
              {dealerFacing ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busyId === 'dealer-facing'}
                  loading={busyId === 'dealer-facing'}
                  leftIcon={<BellOff width={14} height={14} strokeWidth={1.75} />}
                  onClick={() => void setDealerFacing(false)}
                >
                  Turn messages off
                </Button>
              ) : (
                <Button
                  size="sm"
                  leftIcon={<BellRing width={14} height={14} strokeWidth={1.75} />}
                  onClick={() => setEnableDealerFacingOpen(true)}
                >
                  Turn messages on
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Callout intent="info">
        Tasks are added, hidden or re-pointed for this outlet on its{' '}
        <span className="font-medium">Kavach work list</span> tab. Verifying them
        happens in the work queue — this panel shows where the dealer stands.{' '}
        {/* The pause button's consequence used to live only in a `title`, which
            no touch gesture reveals. Said once here rather than on all 45 rows. */}
        Pausing a task takes it out of this dealer&apos;s score and out of the
        work queue until it is resumed.
      </Callout>

      {/* Items grouped by bucket */}
      <div
        className={isPaused ? 'pointer-events-none select-none opacity-60' : undefined}
        aria-disabled={isPaused || undefined}
      >
        {itemsQ.isLoading ? (
          <Card>
            <CardContent>
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ) : itemsQ.isError ? (
          <EmptyState
            icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
            title="Could not load tasks"
            description={
              itemsQ.error instanceof ApiError
                ? itemsQ.error.message
                : 'Something went wrong while loading the tracked tasks.'
            }
            cta={
              <Button
                leftIcon={<RotateCw width={16} height={16} strokeWidth={1.75} />}
                onClick={() => void itemsQ.refetch()}
              >
                Retry
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck width={28} height={28} strokeWidth={1.75} />}
            title="No tasks yet"
            description="This programme tracks nothing. Add tasks — or unhide catalog ones — on the Kavach work list tab."
          />
        ) : (
          <div className="grid gap-4">
            {orderedBuckets.map((bucket) => {
              const bucketItems = grouped.get(bucket) ?? [];
              return (
                <Card key={bucket}>
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between px-4 py-3">
                      <p className="text-sm font-semibold text-text">
                        {CADENCE_BUCKET_LABEL[bucket]}
                      </p>
                      <span className="text-xs text-text-subtle">
                        {bucketItems.length}{' '}
                        {bucketItems.length === 1 ? 'task' : 'tasks'}
                      </span>
                    </div>
                    <div>
                      {bucketItems.map((item) => (
                        <KavachItemRow
                          key={item.id}
                          item={item}
                          busy={busyId === item.id}
                          onTogglePause={(i) =>
                            withBusy(
                              i.id,
                              () =>
                                setPaused.mutateAsync({
                                  itemId: i.id,
                                  body: { paused: !i.paused },
                                }),
                              i.paused ? 'Task resumed' : 'Task paused',
                            )
                          }
                          onToggleSos={(i) =>
                            withBusy(
                              i.id,
                              () =>
                                setSos.mutateAsync({
                                  itemId: i.id,
                                  body: { compliant: i.status === 'SOS_FLAGGED' },
                                }),
                              i.status === 'SOS_FLAGGED'
                                ? 'SOS flag cleared'
                                : 'SOS flagged',
                            )
                          }
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={enableDealerFacingOpen}
        onClose={() => setEnableDealerFacingOpen(false)}
        title="Start messaging this dealer"
        description={dealerCodeLabel(dealer.code)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setEnableDealerFacingOpen(false)}
            >
              Not yet
            </Button>
            <Button
              loading={busyId === 'dealer-facing'}
              onClick={() => void setDealerFacing(true)}
            >
              Turn messages on
            </Button>
          </>
        }
      >
        <div className="grid gap-3 text-sm text-text-muted">
          <p>
            From the next digest at{' '}
            <span className="font-medium text-text">
              {String(programme.reminderHour ?? 8).padStart(2, '0')}:00 IST
            </span>{' '}
            this dealer starts receiving a daily list of what is outstanding, and
            their score becomes something they can be shown.
          </p>
          {score.notYetVerifiedCount > 0 ? (
            <Callout intent="warning">
              {score.notYetVerifiedCount} task
              {score.notYetVerifiedCount === 1 ? ' has' : 's have'} never been
              checked by anyone at MDG. Turn this on and the first thing this
              dealer hears about them is that they are outstanding.
            </Callout>
          ) : null}
          <p>You can switch it off again at any time.</p>
        </div>
      </Dialog>
    </div>
  );
}
