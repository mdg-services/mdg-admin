import { AlertCircle, Pause, Play, Plug, Plus, RefreshCw, Trash2 } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
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

import { AttachServiceDialog } from './AttachServiceDialog';

interface Props {
  dealer: Dealer;
}

export function DealerServicesTab({ dealer }: Props) {
  const toast = useToast();
  const [attachOpen, setAttachOpen] = React.useState(false);

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

  async function onDelete(ds: DealerService) {
    if (!window.confirm(`Detach ${ds.serviceId}?`)) return;
    try {
      await remove.mutateAsync(ds.id);
      toast.success('Service detached');
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
    </Card>
  );
}
