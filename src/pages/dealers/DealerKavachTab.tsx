import {
  AlertCircle,
  Inbox,
  Pause,
  Play,
  Plus,
  RotateCw,
  ShieldCheck,
} from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  EmptyState,
  Select,
  Skeleton,
  useToast,
} from '@/components/ui';
import {
  useAddCustomKavachItem,
  useDeleteKavachItem,
  useEscalateKavachItem,
  useInitiateKavachProgramme,
  useKavachItemsQuery,
  useKavachProgrammeQuery,
  useMarkKavachItemDone,
  useSetKavachItemPaused,
  useSetKavachSosCompliance,
  useUpdateKavachProgramme,
} from '@/hooks/api/useKavach';
import { ApiError } from '@/lib/api';
import {
  CADENCE_BUCKET_LABEL,
  CADENCE_BUCKET_ORDER,
  operationalIntent,
} from '@/lib/kavach';
import { dealerCodeLabel, type Dealer, type KavachCadenceBucket, type KavachItem } from '@dk/shared';

import { AddCustomItemDialog } from './kavach/AddCustomItemDialog';
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

export function DealerKavachTab({ dealer }: Props) {
  const toast = useToast();
  const [addOpen, setAddOpen] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<KavachItem | null>(null);

  const programmeQ = useKavachProgrammeQuery(dealer.id);
  const itemsQ = useKavachItemsQuery(dealer.id);

  const initiate = useInitiateKavachProgramme(dealer.id);
  const updateProgramme = useUpdateKavachProgramme(dealer.id);
  const addCustom = useAddCustomKavachItem(dealer.id);
  const markDone = useMarkKavachItemDone(dealer.id);
  const setPaused = useSetKavachItemPaused(dealer.id);
  const setSos = useSetKavachSosCompliance(dealer.id);
  const remove = useDeleteKavachItem(dealer.id);
  const escalate = useEscalateKavachItem(dealer.id);

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
        description={(programmeQ.error as Error).message}
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
            toast.error(
              err instanceof ApiError ? err.message : 'Failed to initiate',
            );
          }
        }}
      />
    );
  }

  const programme = programmeQ.data;
  const isPaused = programme.status === 'PAUSED';
  const items = itemsQ.data ?? [];

  // Group items by cadence bucket, preserving the canonical order.
  const grouped = new Map<KavachCadenceBucket, KavachItem[]>();
  for (const item of items) {
    const arr = grouped.get(item.cadenceBucket) ?? [];
    arr.push(item);
    grouped.set(item.cadenceBucket, arr);
  }
  const orderedBuckets = CADENCE_BUCKET_ORDER.filter((b) => grouped.has(b));

  const pct = Math.round(programme.score.overallPct);

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
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-text">
                    {pct}%
                  </span>
                  <Badge intent={operationalIntent(pct)}>operational</Badge>
                  {isPaused ? <Badge intent="warning">Paused</Badge> : null}
                </div>
                <p className="text-sm text-text-muted">
                  <span className="font-mono">{dealerCodeLabel(dealer.code)}</span>
                  {' · baseline '}
                  {programme.outlet.monthYear}
                </p>
                <p className="text-xs text-text-subtle">
                  {programme.score.validPoints} / {programme.score.totalPoints}{' '}
                  points compliant
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="kavach-digest-hour"
                  className="text-xs text-text-muted"
                >
                  Digest time
                </label>
                <Select
                  id="kavach-digest-hour"
                  className="h-9 w-auto"
                  value={programme.reminderHour ?? ''}
                  disabled={updateProgramme.isPending}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // Placeholder (global default) → no-op; only send a concrete hour.
                    if (raw === '') return;
                    void withBusy(
                      'programme',
                      () =>
                        updateProgramme.mutateAsync({
                          reminderHour: Number(raw),
                        }),
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
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus width={16} height={16} strokeWidth={1.75} />}
                onClick={() => setAddOpen(true)}
              >
                Add custom task
              </Button>
            </div>
          </div>

          {/* Per-bucket sub-scores (admin-only) */}
          {Object.keys(programme.score.byBucket).length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
              {CADENCE_BUCKET_ORDER.filter(
                (b) => programme.score.byBucket[b] != null,
              ).map((b) => (
                <Badge key={b} intent="neutral" className="gap-1">
                  <span className="text-text-muted">{CADENCE_BUCKET_LABEL[b]}</span>
                  <span className="font-semibold">
                    {Math.round(programme.score.byBucket[b] as number)}%
                  </span>
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Escalations note → inbox deep-link */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-text-muted">
        <span>
          Escalations appear in the{' '}
          <span className="font-medium text-text">Inbox</span> as open
          compliance conversations — there is no separate queue.
        </span>
        <Link
          to={`/inbox?dealerId=${dealer.id}`}
          className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline"
        >
          <Inbox width={14} height={14} strokeWidth={1.75} />
          Open inbox for this dealer
        </Link>
      </div>

      {/* Items grouped by bucket */}
      <div
        className={
          isPaused
            ? 'pointer-events-none select-none opacity-60'
            : undefined
        }
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
          title="Could not load items"
          description={
            itemsQ.error instanceof ApiError
              ? itemsQ.error.message
              : 'Something went wrong while loading the tracked items.'
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
          title="No items yet"
          description="The programme has no tracked items. Add a custom task to get started."
          cta={
            <Button
              leftIcon={<Plus width={16} height={16} strokeWidth={1.75} />}
              onClick={() => setAddOpen(true)}
            >
              Add custom task
            </Button>
          }
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
                    {bucketItems.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <div>
                  {bucketItems.map((item) => (
                    <KavachItemRow
                      key={item.id}
                      item={item}
                      busy={busyId === item.id}
                      onMarkDone={(i) =>
                        withBusy(
                          i.id,
                          () => markDone.mutateAsync(i.id),
                          'Marked done on behalf of dealer',
                        )
                      }
                      onTogglePause={(i) =>
                        withBusy(
                          i.id,
                          () =>
                            setPaused.mutateAsync({
                              itemId: i.id,
                              body: { paused: !i.paused },
                            }),
                          i.paused ? 'Item resumed' : 'Item paused',
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
                      onEscalate={(i) =>
                        withBusy(
                          i.id,
                          () => escalate.mutateAsync(i.id),
                          'Escalated to inbox',
                        )
                      }
                      onDelete={(i) => setDeleteTarget(i)}
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

      <AddCustomItemDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        loading={addCustom.isPending}
        onSubmit={async (values) => {
          try {
            await addCustom.mutateAsync(values);
            toast.success('Custom task added');
            setAddOpen(false);
          } catch (err) {
            toast.error(
              err instanceof ApiError ? err.message : 'Failed to add task',
            );
          }
        }}
      />

      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete custom item"
        description={
          deleteTarget ? `Delete “${deleteTarget.labelEn}”?` : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => {
                const target = deleteTarget;
                if (!target) return;
                void withBusy(
                  target.id,
                  () => remove.mutateAsync(target.id),
                  'Custom item deleted',
                ).finally(() => setDeleteTarget(null));
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">
          This removes the custom compliance item from this dealer&apos;s
          programme. This can&apos;t be undone.
        </p>
      </Dialog>
    </div>
  );
}
