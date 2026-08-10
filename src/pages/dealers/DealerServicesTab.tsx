import {
  AlertCircle,
  Pause,
  Pencil,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  EmptyState,
  MobileCardList,
  Skeleton,
  StatusChip,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  useToast,
} from '@/components/ui';
import {
  useAttachDealerService,
  useDealerServicesQuery,
  useDeleteDealerService,
  useRunNow,
  useUpdateDealerService,
} from '@/hooks/api/useDealerServices';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Dealer, DealerService } from '@dk/shared';
import type { UpdateDealerServiceInput } from '@dk/shared/schemas';

import { AttachServiceDialog } from './AttachServiceDialog';
import { EditServiceDialog } from './EditServiceDialog';
import { describeSchedule } from './serviceSchedule';

interface Props {
  dealer: Dealer;
}

/** 44px icon button used in the mobile service-card action row. */
const ICON_BTN =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface text-text hover:bg-surface-2';

export function DealerServicesTab({ dealer }: Props) {
  const toast = useToast();
  const [attachOpen, setAttachOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<DealerService | null>(null);
  const [detachTarget, setDetachTarget] = React.useState<DealerService | null>(
    null,
  );

  const { data, isLoading } = useDealerServicesQuery(dealer.id);
  const attach = useAttachDealerService(dealer.id);
  const update = useUpdateDealerService(dealer.id);
  const remove = useDeleteDealerService(dealer.id);
  const runNow = useRunNow(dealer.id);

  const attachedIds = (data ?? []).map((d) => d.serviceId);

  function isStale(svc: DealerService): boolean {
    if (svc.cadence !== 'DAILY' && svc.cadence !== 'ON_DEMAND') return false;
    if (!svc.lastRunAt) return true;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return new Date(svc.lastRunAt) < startOfToday;
  }

  async function onRunNow(ds: DealerService) {
    try {
      await runNow.mutateAsync({ dsId: ds.id });
      toast.success('Run enqueued');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Run failed';
      toast.error(msg);
    }
  }

  async function onToggle(ds: DealerService) {
    const nextStatus = ds.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await update.mutateAsync({
        dsId: ds.id,
        patch: { status: nextStatus },
      });
      toast.success(`Service ${nextStatus.toLowerCase()}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Update failed';
      toast.error(msg);
    }
  }

  async function onSaveEdit(patch: UpdateDealerServiceInput) {
    if (!editTarget) return;
    try {
      const updated = await update.mutateAsync({ dsId: editTarget.id, patch });
      const schedule = describeSchedule(updated);
      if (schedule.intent === 'warning') {
        // Sticky (duration 0) on purpose: the save SUCCEEDED but left an active
        // service with nothing to fire on, which is the one outcome an admin
        // must not scroll past.
        toast.toast({
          intent: 'warning',
          title: 'Service updated',
          description: schedule.text,
          duration: 0,
        });
      } else {
        toast.success('Service updated', { description: schedule.text });
      }
      setEditTarget(null);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Update failed';
      toast.error(msg);
    }
  }

  function onDelete(ds: DealerService) {
    setDetachTarget(ds);
  }

  async function confirmDetach() {
    if (!detachTarget) return;
    try {
      await remove.mutateAsync(detachTarget.id);
      toast.success('Service detached');
      setDetachTarget(null);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Delete failed';
      toast.error(msg);
    }
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-base font-semibold text-text">
              Attached services
            </p>
            <p className="text-sm text-text-muted">
              Plugins running for this dealer.
            </p>
          </div>
          <Button
            leftIcon={<Plus width={16} height={16} strokeWidth={1.75} />}
            onClick={() => setAttachOpen(true)}
          >
            Attach service
          </Button>
        </div>

        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-8 w-full" />
          </div>
        ) : data && data.length > 0 ? (
          <>
            {/* Desktop table (≥ md) */}
            <div className="hidden md:block">
            <Table>
            <THead>
              <TRow>
                <TH>Service</TH>
                <TH>Cadence</TH>
                <TH>Status</TH>
                <TH>Last run</TH>
                <TH>Next run</TH>
                <TH className="text-right">Actions</TH>
              </TRow>
            </THead>
            <TBody>
              {data.map((ds) => (
                <TRow key={ds.id}>
                  <TD className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      {ds.serviceId}
                      {isStale(ds) ? (
                        <Badge
                          intent="warning"
                          title="Hasn't run today — click Run Now to refresh"
                          aria-label="Hasn't run today — click Run Now to refresh"
                          className="gap-1"
                        >
                          <AlertCircle
                            width={12}
                            height={12}
                            strokeWidth={1.75}
                          />
                          stale
                        </Badge>
                      ) : null}
                    </span>
                  </TD>
                  <TD>
                    <Badge intent="neutral">{ds.cadence}</Badge>
                  </TD>
                  <TD>
                    <StatusChip kind="dealerService" value={ds.status} />
                  </TD>
                  <TD className="text-text-muted">
                    {formatDateTime(ds.lastRunAt)}
                  </TD>
                  <TD className="text-text-muted">
                    {formatDateTime(ds.nextRunAt)}
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onRunNow(ds)}
                        leftIcon={
                          <RefreshCw
                            width={14}
                            height={14}
                            strokeWidth={1.75}
                          />
                        }
                      >
                        Run now
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditTarget(ds)}
                        aria-label="Edit schedule and config"
                      >
                        <Pencil width={14} height={14} strokeWidth={1.75} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onToggle(ds)}
                        aria-label={
                          ds.status === 'ACTIVE' ? 'Pause' : 'Resume'
                        }
                      >
                        {ds.status === 'ACTIVE' ? (
                          <Pause width={14} height={14} strokeWidth={1.75} />
                        ) : (
                          <Play width={14} height={14} strokeWidth={1.75} />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(ds)}
                        aria-label="Detach service"
                      >
                        <Trash2
                          width={14}
                          height={14}
                          strokeWidth={1.75}
                          className="text-danger"
                        />
                      </Button>
                    </div>
                  </TD>
                </TRow>
              ))}
            </TBody>
          </Table>
          </div>

          {/* Mobile card-stack (< md) */}
          <MobileCardList
            className="p-4 pt-0"
            cards={data.map((ds) => ({
              key: ds.id,
              primary: (
                <span className="inline-flex flex-wrap items-center gap-2 font-medium text-text">
                  {ds.serviceId}
                  {isStale(ds) ? (
                    <Badge
                      intent="warning"
                      title="Hasn't run today — click Run now to refresh"
                      aria-label="Hasn't run today — click Run now to refresh"
                      className="gap-1"
                    >
                      <AlertCircle width={12} height={12} strokeWidth={1.75} />
                      stale
                    </Badge>
                  ) : null}
                </span>
              ),
              primaryRight: <StatusChip kind="dealerService" value={ds.status} />,
              meta: (
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge intent="neutral">{ds.cadence}</Badge>
                  <span>Last {formatDateTime(ds.lastRunAt)}</span>
                  <span>· Next {formatDateTime(ds.nextRunAt)}</span>
                </span>
              ),
              actions: (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRunNow(ds)}
                    aria-label="Run now"
                    className={ICON_BTN}
                  >
                    <RefreshCw width={18} height={18} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTarget(ds)}
                    aria-label="Edit schedule and config"
                    className={ICON_BTN}
                  >
                    <Pencil width={18} height={18} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggle(ds)}
                    aria-label={ds.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                    className={ICON_BTN}
                  >
                    {ds.status === 'ACTIVE' ? (
                      <Pause width={18} height={18} strokeWidth={1.75} />
                    ) : (
                      <Play width={18} height={18} strokeWidth={1.75} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(ds)}
                    aria-label="Detach service"
                    className={ICON_BTN}
                  >
                    <Trash2
                      width={18}
                      height={18}
                      strokeWidth={1.75}
                      className="text-danger"
                    />
                  </button>
                </div>
              ),
            }))}
          />
          </>
        ) : (
          <EmptyState
            icon={<Plug width={28} height={28} strokeWidth={1.75} />}
            title="No services attached"
            description="Attach a plugin from the catalog to start automated runs."
            cta={
              <Button
                leftIcon={<Plus width={16} height={16} strokeWidth={1.75} />}
                onClick={() => setAttachOpen(true)}
              >
                Attach service
              </Button>
            }
          />
        )}
      </CardContent>

      <AttachServiceDialog
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        loading={attach.isPending}
        attachedServiceIds={attachedIds}
        onSubmit={async (values) => {
          try {
            await attach.mutateAsync(values);
            toast.success('Service attached');
            setAttachOpen(false);
          } catch (err) {
            const msg =
              err instanceof ApiError ? err.message : 'Failed to attach';
            toast.error(msg);
          }
        }}
      />

      <EditServiceDialog
        open={!!editTarget}
        service={editTarget}
        onClose={() => setEditTarget(null)}
        onSubmit={onSaveEdit}
      />

      <Dialog
        open={!!detachTarget}
        onClose={() => setDetachTarget(null)}
        title="Detach service"
        description={
          detachTarget
            ? `Stop running “${detachTarget.serviceId}” for this dealer?`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetachTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmDetach}
              loading={remove.isPending}
            >
              Detach
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">
          This removes the plugin and its schedule from the dealer. Past run
          history is kept. You can re-attach it later.
        </p>
      </Dialog>
    </Card>
  );
}
