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
  CardHeader,
  CardSubtitle,
  CardTitle,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Menu,
  MenuItem,
  MenuSeparator,
  MobileCardList,
  Skeleton,
  Spinner,
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
import { useServicesQuery } from '@/hooks/api/useServices';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { retryImport } from '@/lib/retryImport';
import type { Dealer, DealerService } from '@dk/shared';
import type { UpdateDealerServiceInput } from '@dk/shared/schemas';

import { INSPECTION_SERVICE_ID, IRAS_SERVICE_ID } from './schedulePicker';
import { describeSchedule } from './serviceSchedule';

/**
 * Both config dialogs arrive on demand, and only once one is actually opened.
 *
 * They are the only things in the app that touch the JSON-schema form stack —
 * @rjsf/core, @rjsf/utils, @rjsf/validator-ajv8 and, underneath those, ajv,
 * lodash, json-schema-merge-allof and markdown-to-jsx. Measured, that cluster
 * is ~300 kB raw / ~84 kB brotli: bigger than the rest of this tab put
 * together, for two dialogs most admins never open. Importing them statically
 * put all of it in whatever chunk this tab landed in.
 *
 * `ServiceConfigFields` (which pulls @rjsf in) is imported by these two files
 * and nothing else, so the whole cluster now hangs off these two `import()`s.
 * That is the trap to watch on any future edit: one static import of
 * `ServiceConfigFields` — or of its `withSchemaDefaults` helper, which calls
 * `getDefaultFormState` from @rjsf/utils — from anywhere eager drags ajv and
 * lodash straight back into the eager graph and this split buys nothing.
 */
const AttachServiceDialog = React.lazy(
  retryImport(() =>
    import('./AttachServiceDialog').then((m) => ({
      default: m.AttachServiceDialog,
    })),
  ),
);
const EditServiceDialog = React.lazy(
  retryImport(() =>
    import('./EditServiceDialog').then((m) => ({ default: m.EditServiceDialog })),
  ),
);

interface Props {
  dealer: Dealer;
}

export function DealerServicesTab({ dealer }: Props) {
  const toast = useToast();
  const [attachOpen, setAttachOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<DealerService | null>(null);
  const [detachTarget, setDetachTarget] = React.useState<DealerService | null>(
    null,
  );

  /**
   * Whether a fallback sheet has already slid up for the dialog now opening.
   *
   * `DialogLoading` sets it as it mounts and the real dialog reads it, so the
   * finished dialog does not replay the bottom-sheet entrance on top of a sheet
   * that is already up — see `Dialog`'s `animateIn` for what that looked like.
   * Cleared once nothing is open, which is also why the common case is
   * untouched: when the chunk is already in memory `React.lazy` resolves during
   * render, no fallback is ever committed, this stays false, and the sheet
   * slides up exactly as it did before the split.
   */
  const [sheetShown, setSheetShown] = React.useState(false);
  const markSheetShown = React.useCallback(() => setSheetShown(true), []);
  const anyConfigDialogOpen = attachOpen || editTarget !== null;
  React.useEffect(() => {
    if (!anyConfigDialogOpen) setSheetShown(false);
  }, [anyConfigDialogOpen]);

  const isMd = useMediaQuery('(min-width: 768px)');

  const { data, isLoading } = useDealerServicesQuery(dealer.id);
  // The plugin catalog, warmed here rather than inside the dialogs.
  //
  // Both dialogs read it, and while they were mounted-but-closed their own
  // `useServicesQuery` fetched it the moment this tab appeared — so by the time
  // anyone pressed Attach or Edit it was already cached. Now that they only
  // mount when opened, that fetch would start on the press instead, and land on
  // top of the dialog's own chunk download. Same query key, so this is the one
  // request it always was; it just keeps happening at the moment it used to.
  useServicesQuery();
  const attach = useAttachDealerService(dealer.id);
  const update = useUpdateDealerService(dealer.id);
  const remove = useDeleteDealerService(dealer.id);
  const runNow = useRunNow(dealer.id);

  const attachedIds = (data ?? []).map((d) => d.serviceId);
  // The DSR schedule advisory needs to know whether IRAS Shift Data is attached
  // (the DSR is built from it) and when it collects, to warn if the DSR would run
  // without it or before it.
  const irasService = (data ?? []).find((d) => d.serviceId === IRAS_SERVICE_ID);
  const irasAttached = !!irasService;
  const irasCron = irasService?.customCron ?? null;
  const inspectionAttached = (data ?? []).some(
    (d) => d.serviceId === INSPECTION_SERVICE_ID,
  );

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

  /**
   * Report a save by what it actually left behind, not by the fact it returned
   * 200. An ACTIVE row with no `nextRunAt` has gone quiet forever — no error, no
   * failed run, nothing to alert on — so it is the one outcome that gets a
   * sticky toast (`duration: 0`) rather than one an admin can scroll past.
   *
   * Shared by attach and edit deliberately: they write the same fields through
   * the same validation, and the earlier split — where only edit reported the
   * schedule — meant an attachment could go quiet on day one and say "Service
   * attached".
   */
  function toastSchedule(title: string, ds: DealerService) {
    const schedule = describeSchedule(ds);
    if (schedule.intent === 'warning') {
      toast.toast({
        intent: 'warning',
        title,
        description: schedule.text,
        duration: 0,
      });
    } else {
      toast.success(title, { description: schedule.text });
    }
  }

  async function onSaveEdit(patch: UpdateDealerServiceInput) {
    if (!editTarget) return;
    try {
      const updated = await update.mutateAsync({ dsId: editTarget.id, patch });
      toastSchedule('Service updated', updated);
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

  const hasServices = !!data && data.length > 0;

  /* One call to action at a time on a phone. With nothing attached, the empty
     state's own "Attach service" button is the point of the screen — and the
     header was drawing a second one, a different size and a different blue, two
     rows above it. Below md the header's copy drops out and the empty state
     carries it; from md up the header keeps its action, because there the two
     sit far enough apart to read as a toolbar and a suggestion rather than as
     the same button twice.

     A media query rather than `hidden md:inline-flex`, because `CardHeader`
     wraps `action` in a slot of its own: a display:none button still leaves
     that slot in the header's `gap-2` column and pads the header by 8px for
     nothing. */
  const headerAction =
    hasServices || isLoading || isMd ? (
      <Button
        size="sm"
        leftIcon={<Plus width={16} height={16} strokeWidth={1.75} />}
        onClick={() => setAttachOpen(true)}
      >
        Attach service
      </Button>
    ) : undefined;

  return (
    <Card>
      {/* `CardHeader` rather than a hand-rolled `p-4` row: the header already
          knows how to put its action under the title below md and back on the
          right at md, which the wrapped flex row it replaces did not. */}
      <CardHeader padding="comfortable" action={headerAction}>
        {/* Wrapped, not two loose children: with no `action` the header is a
            `justify-between` row, and an unwrapped title and subtitle would
            fly to opposite ends of it. */}
        <div>
          <CardTitle>Attached services</CardTitle>
          <CardSubtitle>Plugins running for this dealer.</CardSubtitle>
        </div>
      </CardHeader>
      {/* The body is a table or a card stack, so it runs to the card's edges.
          A `className="p-0"` here would lose to the default padding — `cn` is
          clsx, not tailwind-merge. */}
      <CardContent padding="none" className="md:p-4">
        {isLoading ? (
          <div className="p-3 md:p-4">
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

          {/* Mobile card-stack (< md). Flush rows in a card with no padding of
              its own: a bordered card inside a bordered card inside the page
              gutter put the service name 62px in from a 360px screen. */}
          <MobileCardList
            variant="rows"
            cards={data.map((ds) => ({
              key: ds.id,
              primary: (
                <span className="inline-flex flex-wrap items-center gap-2 font-medium text-text">
                  {ds.serviceId}
                  {isStale(ds) ? (
                    <Badge intent="warning" className="gap-1">
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
                  {/* What "stale" means and what to do about it used to live
                      only in the badge's `title`, which no touch gesture shows
                      — so on a phone the word was unexplained. It goes on the
                      card instead. */}
                  {isStale(ds) ? (
                    <span className="block w-full text-warning">
                      Hasn&apos;t run today — press Run now to refresh it.
                    </span>
                  ) : null}
                </span>
              ),
              // One labelled action and a kebab for the rest. Four unlabelled
              // 44px squares plus their gaps came to 200px of a ~236px card —
              // a whole line per service, and the only thing telling you what
              // any of them did was a `title` no touch gesture shows.
              actionsLayout: 'wrap',
              actions: (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={
                      <RefreshCw width={14} height={14} strokeWidth={1.75} />
                    }
                    onClick={() => onRunNow(ds)}
                  >
                    Run now
                  </Button>
                  <Menu
                    label={`More actions for ${ds.serviceId}`}
                    title={ds.serviceId}
                  >
                    <MenuItem
                      icon={<Pencil width={15} height={15} strokeWidth={1.75} />}
                      onSelect={() => setEditTarget(ds)}
                    >
                      Edit schedule and config
                    </MenuItem>
                    <MenuItem
                      icon={
                        ds.status === 'ACTIVE' ? (
                          <Pause width={15} height={15} strokeWidth={1.75} />
                        ) : (
                          <Play width={15} height={15} strokeWidth={1.75} />
                        )
                      }
                      onSelect={() => onToggle(ds)}
                    >
                      {ds.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem
                      danger
                      icon={<Trash2 width={15} height={15} strokeWidth={1.75} />}
                      onSelect={() => onDelete(ds)}
                    >
                      Detach service
                    </MenuItem>
                  </Menu>
                </>
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

      {/* Mounted only while open — that is what keeps the form stack off the
          wire until it is needed. Nothing is lost by unmounting: the attach
          dialog already cleared its own fields on close, and the edit dialog
          re-seeds from the row every time it opens. */}
      {attachOpen ? (
        <React.Suspense
          fallback={
            <DialogLoading
              title="Attach service"
              onClose={() => setAttachOpen(false)}
              onShown={markSheetShown}
            />
          }
        >
          <AttachServiceDialog
            open
            animateIn={!sheetShown}
            onClose={() => setAttachOpen(false)}
            loading={attach.isPending}
            dealerId={dealer.id}
            attachedServiceIds={attachedIds}
            irasAttached={irasAttached}
            inspectionAttached={inspectionAttached}
            irasCron={irasCron}
            onSubmit={async (values) => {
              try {
                toastSchedule(
                  'Service attached',
                  await attach.mutateAsync(values),
                );
                setAttachOpen(false);
              } catch (err) {
                const msg =
                  err instanceof ApiError ? err.message : 'Failed to attach';
                toast.error(msg);
              }
            }}
          />
        </React.Suspense>
      ) : null}

      {editTarget ? (
        <React.Suspense
          fallback={
            <DialogLoading
              title="Edit service"
              onClose={() => setEditTarget(null)}
              onShown={markSheetShown}
            />
          }
        >
          <EditServiceDialog
            open
            animateIn={!sheetShown}
            service={editTarget}
            irasAttached={irasAttached}
            inspectionAttached={inspectionAttached}
            irasCron={irasCron}
            onClose={() => setEditTarget(null)}
            onSubmit={onSaveEdit}
          />
        </React.Suspense>
      ) : null}

      {/* The shared `ConfirmDialog` rather than a fourth hand-rolled copy of the
          same shape — the four had already drifted on button order and on
          whether the destructive action was red. */}
      <ConfirmDialog
        open={!!detachTarget}
        onCancel={() => setDetachTarget(null)}
        onConfirm={() => void confirmDetach()}
        title="Detach service"
        // Matches the `max-w-lg` of the Dialog this replaced.
        size="md"
        confirmLabel="Detach"
        confirmVariant="danger"
        loading={remove.isPending}
        description={
          <>
            {detachTarget
              ? `Stop running “${detachTarget.serviceId}” for this dealer?`
              : null}{' '}
            This removes the plugin and its schedule from the dealer. Past run
            history is kept. You can re-attach it later.
          </>
        }
      />
    </Card>
  );
}

/**
 * What the reader sees while a config dialog's chunk is on the wire.
 *
 * Not `null`. The form stack behind these dialogs is ~84 kB brotli, which on a
 * 2G handover is a visible pause, and a button that does nothing for a second
 * reads as broken — the exact complaint that started the mobile pass. Rendering
 * the real `Dialog` shell means the sheet slides up on the tap and the wait
 * happens inside it, where it looks like loading rather than like failure.
 *
 * It closes like any other dialog, and closing costs nothing: `React.lazy`
 * holds the in-flight import on the component itself, not on the mounted tree,
 * so a download already under way finishes and is there the next time the
 * button is pressed.
 */
function DialogLoading({
  title,
  onClose,
  onShown,
}: {
  title: string;
  onClose: () => void;
  /** Told once this sheet is really on screen, so the dialog that replaces it
   *  knows not to slide up a second time. */
  onShown: () => void;
}) {
  React.useEffect(() => {
    onShown();
  }, [onShown]);

  return (
    <Dialog open onClose={onClose} title={title} size="lg">
      <div className="flex items-center justify-center py-12">
        <Spinner size={24} className="text-text-muted" />
      </div>
    </Dialog>
  );
}
