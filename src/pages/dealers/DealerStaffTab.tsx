import {
  AlertCircle,
  AlertTriangle,
  Award,
  ClipboardCheck,
  Clock,
  Image as ImageIcon,
  Pencil,
  ScrollText,
  Trophy,
  Undo2,
  UserPlus,
  Users,
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
  DateRangeFilter,
  Dialog,
  EmptyState,
  MobileCardList,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  dateRangeForPreset,
  isValidDateRange,
  useToast,
  type DateRangeValue,
} from '@/components/ui';
import {
  useAdminUndoAward,
  useAdminUpdateEmployee,
  useDealerBatchesQuery,
  useDealerDraftQuery,
  useStaffAwardsQuery,
  useStaffOverviewQuery,
} from '@/hooks/api/useStaff';
import { ApiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { fmtPoints } from '@/lib/staffWork';
import type { Dealer, EmployeeStatus, EmployeeWithPoints, StaffPointAward } from '@dk/shared';

import { AwardPointsDialog } from './AwardPointsDialog';
import { WorkerFormDialog } from './WorkerFormDialog';

interface Props {
  dealer: Dealer;
}

/* ─────────────────────────────── Date window ────────────────────────────── */

/**
 * GET /staff/awards caps its result set at 1000 ledger rows server-side (see
 * `queryLedger` in routes/v1/staff.ts) — it is a row cap, not a date cap, so a
 * long custom range does not 400, it silently truncates. Hitting it has to be
 * said out loud, otherwise the audit trail looks complete when it is not.
 *
 * What we cannot say is that anything was actually dropped: the response is a
 * bare array with no total, so a window holding exactly 1000 awards looks
 * identical to one holding 5000. Hence the hedged wording below — telling an
 * admin their trail is incomplete when it is not sends them off narrowing a
 * range that never needed it, and it is the same misreading in reverse.
 */
const LEDGER_ROW_CAP = 1000;

/* ─────────────────────────────── Small bits ─────────────────────────────── */

function EmployeeStatusChip({ status }: { status: EmployeeStatus }) {
  return (
    <Badge intent={status === 'ACTIVE' ? 'success' : 'neutral'}>
      {status === 'ACTIVE' ? 'Active' : 'Inactive'}
    </Badge>
  );
}

/* ─────────────────────────────── Component ──────────────────────────────── */

export function DealerStaffTab({ dealer }: Props) {
  const toast = useToast();
  const [range, setRange] = React.useState<DateRangeValue>(() =>
    dateRangeForPreset('today'),
  );
  const [includeInactive, setIncludeInactive] = React.useState(false);

  // Belt and braces: the picker only ever emits a complete, in-order window, so
  // this can't fail in practice — but a windowed dealer id is the only lever
  // these hooks expose for `enabled`, and a nonsense window must never be sent.
  const windowedDealerId = isValidDateRange(range) ? dealer.id : undefined;

  const overviewQ = useStaffOverviewQuery(windowedDealerId, {
    from: range.from,
    to: range.to,
    includeInactive,
  });
  const awardsQ = useStaffAwardsQuery(windowedDealerId, {
    from: range.from,
    to: range.to,
  });
  const draftQ = useDealerDraftQuery(dealer.id);
  const batchesQ = useDealerBatchesQuery(dealer.id);

  const updateEmployee = useAdminUpdateEmployee(dealer.id);
  const undoAward = useAdminUndoAward(dealer.id);

  const overview = overviewQ.data;
  // Memoised for the identity, not the cost: `?? []` hands out a fresh array on
  // every render, which silently defeats the `nameById` memo below.
  const roster = React.useMemo(() => overview?.roster ?? [], [overview]);
  const summary = overview?.summary;
  const awards = awardsQ.data ?? [];

  // Dialog + action state.
  const [awardOpen, setAwardOpen] = React.useState(false);
  const [workerDialogOpen, setWorkerDialogOpen] = React.useState(false);
  const [editingWorker, setEditingWorker] = React.useState<EmployeeWithPoints | null>(null);
  const [undoTarget, setUndoTarget] = React.useState<StaffPointAward | null>(null);
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);

  // employeeId → display name, resolved from roster then summary rows.
  const nameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const row of summary?.rows ?? []) map.set(row.employeeId, row.employeeName);
    for (const emp of roster) map.set(emp.id, emp.name);
    return map;
  }, [roster, summary]);

  const targetPoints = summary?.targetPoints;

  function openAddWorker() {
    setEditingWorker(null);
    setWorkerDialogOpen(true);
  }
  function openEditWorker(emp: EmployeeWithPoints) {
    setEditingWorker(emp);
    setWorkerDialogOpen(true);
  }

  async function toggleWorkerStatus(emp: EmployeeWithPoints) {
    const next: EmployeeStatus = emp.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await updateEmployee.mutateAsync({ id: emp.id, status: next });
      toast.success(
        next === 'INACTIVE' ? `${emp.name} removed` : `${emp.name} reactivated`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  async function doUndo(scope?: 'batch') {
    if (!undoTarget) return;
    try {
      await undoAward.mutateAsync({ id: undoTarget.id, scope });
      toast.success(scope === 'batch' ? 'Batch reversed' : 'Award reversed');
      setUndoTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not undo');
    }
  }

  const draft = draftQ.data;
  const draftHasEntries = !!draft && draft.lineItems.length > 0;
  const batches = batchesQ.data ?? [];

  return (
    <div className="grid gap-4">
      {/* Date-window control + award CTA */}
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <DateRangeFilter
            label="Points date range"
            value={range}
            onChange={setRange}
            className="min-w-0"
            summarySuffix={
              typeof targetPoints === 'number' ? (
                <>
                  {' '}· target{' '}
                  <span className="font-medium text-text">
                    {fmtPoints(targetPoints)}
                  </span>{' '}
                  pts / worker
                </>
              ) : null
            }
          />
          <Button
            size="sm"
            className="w-full shrink-0 sm:w-auto"
            onClick={() => setAwardOpen(true)}
            leftIcon={<Award width={14} height={14} strokeWidth={1.75} />}
          >
            Award points
          </Button>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy width={16} height={16} strokeWidth={1.75} />
              Leaderboard
            </CardTitle>
            <CardSubtitle>
              Points earned in the selected window, ranked. The target line is the
              sheet baseline every worker should reach.
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {overviewQ.isLoading ? (
            <TableSkeleton rows={4} />
          ) : overviewQ.isError ? (
            <LoadError
              message={
                overviewQ.error instanceof ApiError
                  ? overviewQ.error.message
                  : 'Could not load the leaderboard.'
              }
              onRetry={() => void overviewQ.refetch()}
            />
          ) : !summary || summary.rows.length === 0 ? (
            <EmptyState
              icon={<Trophy width={28} height={28} strokeWidth={1.75} />}
              title="No points in this window"
              description="No warrior earned points during the selected date range."
            />
          ) : (
            <>
              {/* Desktop table (≥ md) */}
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH className="w-12">#</TH>
                      <TH>Warrior</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Awards</TH>
                      <TH className="text-right">Points</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {summary.rows.map((row, i) => {
                      const hitTarget =
                        typeof targetPoints === 'number' &&
                        row.totalPoints >= targetPoints;
                      return (
                        <TRow key={row.employeeId}>
                          <TD className="text-text-muted tabular-nums">{i + 1}</TD>
                          <TD className="font-medium">{row.employeeName}</TD>
                          <TD>
                            <EmployeeStatusChip status={row.status} />
                          </TD>
                          <TD className="text-right tabular-nums text-text-muted">
                            {row.awardCount}
                          </TD>
                          <TD className="text-right">
                            <span className="tabular-nums font-semibold">
                              {fmtPoints(row.totalPoints)}
                            </span>
                            {typeof targetPoints === 'number' ? (
                              <span
                                className={
                                  hitTarget
                                    ? 'ml-1 text-xs text-success'
                                    : 'ml-1 text-xs text-text-subtle'
                                }
                              >
                                / {fmtPoints(targetPoints)}
                              </span>
                            ) : null}
                          </TD>
                        </TRow>
                      );
                    })}
                  </TBody>
                </Table>
              </div>

              {/* Mobile card-stack (< md) */}
              <MobileCardList
                className="p-3"
                cards={summary.rows.map((row, i) => {
                  const hitTarget =
                    typeof targetPoints === 'number' &&
                    row.totalPoints >= targetPoints;
                  return {
                    key: row.employeeId,
                    primary: (
                      <span className="block truncate font-medium text-text">
                        <span className="text-text-muted tabular-nums">
                          #{i + 1}
                        </span>{' '}
                        {row.employeeName}
                      </span>
                    ),
                    primaryRight: (
                      <span className="whitespace-nowrap">
                        <span className="tabular-nums font-semibold">
                          {fmtPoints(row.totalPoints)}
                        </span>
                        {typeof targetPoints === 'number' ? (
                          <span
                            className={
                              hitTarget
                                ? 'ml-1 text-xs text-success'
                                : 'ml-1 text-xs text-text-subtle'
                            }
                          >
                            / {fmtPoints(targetPoints)}
                          </span>
                        ) : null}
                      </span>
                    ),
                    meta: (
                      <span className="flex items-center gap-1.5">
                        <EmployeeStatusChip status={row.status} />
                        <span>· {row.awardCount} awards</span>
                      </span>
                    ),
                  };
                })}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Roster */}
      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users width={16} height={16} strokeWidth={1.75} />
              Roster
            </CardTitle>
            <CardSubtitle>
              Workers on this dealer&apos;s staff, with window and lifetime points.
            </CardSubtitle>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <label className="flex min-h-11 items-center gap-2 text-sm text-text-muted md:min-h-0">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-border-strong accent-brand md:h-4 md:w-4"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Include inactive
            </label>
            <Button
              size="sm"
              onClick={openAddWorker}
              leftIcon={<UserPlus width={14} height={14} strokeWidth={1.75} />}
            >
              Add warrior
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {overviewQ.isLoading ? (
            <TableSkeleton rows={4} />
          ) : overviewQ.isError ? (
            <LoadError
              message={
                overviewQ.error instanceof ApiError
                  ? overviewQ.error.message
                  : 'Could not load the roster.'
              }
              onRetry={() => void overviewQ.refetch()}
            />
          ) : roster.length === 0 ? (
            <EmptyState
              icon={<Users width={28} height={28} strokeWidth={1.75} />}
              title="No warriors on record"
              description={
                includeInactive
                  ? 'This dealer has not added any warriors yet.'
                  : 'No active warriors. Enable “Include inactive” to see warriors who have left.'
              }
              cta={
                <Button
                  size="sm"
                  onClick={openAddWorker}
                  leftIcon={<UserPlus width={14} height={14} strokeWidth={1.75} />}
                >
                  Add warrior
                </Button>
              }
            />
          ) : (
            <>
              {/* Desktop table (≥ md) */}
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Warrior</TH>
                      <TH>Designation</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Window pts</TH>
                      <TH className="text-right">Lifetime pts</TH>
                      <TH className="text-right">Actions</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {roster.map((emp) => {
                      const busy =
                        updateEmployee.isPending &&
                        updateEmployee.variables?.id === emp.id;
                      return (
                        <TRow key={emp.id}>
                          <TD>
                            <div className="font-medium">{emp.name}</div>
                            {emp.phone ? (
                              <div className="text-xs text-text-muted">{emp.phone}</div>
                            ) : null}
                          </TD>
                          <TD className="text-text-muted">{emp.designation ?? '—'}</TD>
                          <TD>
                            <EmployeeStatusChip status={emp.status} />
                          </TD>
                          <TD className="text-right tabular-nums">
                            {fmtPoints(emp.pointsInWindow)}
                          </TD>
                          <TD className="text-right tabular-nums text-text-muted">
                            {fmtPoints(emp.totalPoints)}
                          </TD>
                          <TD className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditWorker(emp)}
                                leftIcon={
                                  <Pencil width={14} height={14} strokeWidth={1.75} />
                                }
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                loading={busy}
                                onClick={() => toggleWorkerStatus(emp)}
                              >
                                {emp.status === 'ACTIVE' ? 'Remove' : 'Reactivate'}
                              </Button>
                            </div>
                          </TD>
                        </TRow>
                      );
                    })}
                  </TBody>
                </Table>
              </div>

              {/* Mobile card-stack (< md) */}
              <MobileCardList
                className="p-3"
                cards={roster.map((emp) => {
                  const busy =
                    updateEmployee.isPending &&
                    updateEmployee.variables?.id === emp.id;
                  return {
                    key: emp.id,
                    primary: (
                      <span className="block truncate font-medium text-text">
                        {emp.name}
                        {emp.designation ? (
                          <span className="ml-2 text-xs font-normal text-text-subtle">
                            {emp.designation}
                          </span>
                        ) : null}
                      </span>
                    ),
                    primaryRight: <EmployeeStatusChip status={emp.status} />,
                    secondary: emp.phone ? (
                      <span className="block">{emp.phone}</span>
                    ) : undefined,
                    meta: (
                      <span>
                        Window{' '}
                        <span className="tabular-nums text-text-muted">
                          {fmtPoints(emp.pointsInWindow)}
                        </span>{' '}
                        · Lifetime{' '}
                        <span className="tabular-nums text-text-muted">
                          {fmtPoints(emp.totalPoints)}
                        </span>
                      </span>
                    ),
                    actions: (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditWorker(emp)}
                          leftIcon={
                            <Pencil width={14} height={14} strokeWidth={1.75} />
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={busy}
                          onClick={() => toggleWorkerStatus(emp)}
                        >
                          {emp.status === 'ACTIVE' ? 'Remove' : 'Reactivate'}
                        </Button>
                      </div>
                    ),
                  };
                })}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* In-progress draft (read-only) */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock width={16} height={16} strokeWidth={1.75} />
              In-progress draft
            </CardTitle>
            <CardSubtitle>
              The dealer&apos;s current unsubmitted work. Read-only — it becomes an
              award only when the dealer finalizes it with a hardcopy photo.
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent className={draftHasEntries ? 'p-0' : undefined}>
          {draftQ.isLoading ? (
            <div className="grid gap-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-2/3" />
            </div>
          ) : !draftHasEntries ? (
            <EmptyState
              icon={<Clock width={28} height={28} strokeWidth={1.75} />}
              title="No draft in progress"
              description="The dealer has no unsubmitted work right now."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-3 text-sm">
                <Badge intent="warning">Pending submission</Badge>
                <span className="text-text-muted">
                  {draft.lineItems.length} entr
                  {draft.lineItems.length === 1 ? 'y' : 'ies'} ·{' '}
                  <span className="font-semibold text-text">
                    {fmtPoints(draft.totalPoints)}
                  </span>{' '}
                  pts · work date {formatDate(draft.workDate)}
                </span>
                {draft.updatedAt ? (
                  <span className="text-text-subtle">
                    · last updated {formatDateTime(draft.updatedAt)}
                    {draft.updatedByName ? ` by ${draft.updatedByName}` : ''}
                  </span>
                ) : null}
              </div>
              {/* Desktop table (≥ md) */}
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Warrior</TH>
                      <TH>Work</TH>
                      <TH className="text-right">Points</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {draft.lineItems.map((li, i) => (
                      <TRow key={`${li.employeeId}-${li.workItemCode}-${i}`}>
                        <TD className="font-medium">{li.employeeName}</TD>
                        <TD>
                          {li.workLabelEn}
                          {li.workLabelHi ? (
                            <span className="text-text-subtle"> / {li.workLabelHi}</span>
                          ) : null}
                          {li.source === 'custom' ? (
                            <Badge intent="info" className="ml-2">
                              Custom
                            </Badge>
                          ) : null}
                        </TD>
                        <TD className="text-right tabular-nums font-semibold">
                          {fmtPoints(li.points)}
                        </TD>
                      </TRow>
                    ))}
                  </TBody>
                </Table>
              </div>

              {/* Mobile card-stack (< md) */}
              <MobileCardList
                className="p-3"
                cards={draft.lineItems.map((li, i) => ({
                  key: `${li.employeeId}-${li.workItemCode}-${i}`,
                  primary: (
                    <span className="block truncate font-medium text-text">
                      {li.employeeName}
                    </span>
                  ),
                  primaryRight: (
                    <span className="tabular-nums font-semibold">
                      {fmtPoints(li.points)}
                    </span>
                  ),
                  secondary: (
                    <span>
                      {li.workLabelEn}
                      {li.workLabelHi ? (
                        <span className="text-text-subtle"> / {li.workLabelHi}</span>
                      ) : null}
                      {li.source === 'custom' ? (
                        <Badge intent="info" className="ml-2">
                          Custom
                        </Badge>
                      ) : null}
                    </span>
                  ),
                }))}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Finalized submissions (hardcopy reconciliation) */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck width={16} height={16} strokeWidth={1.75} />
              Finalized submissions
            </CardTitle>
            <CardSubtitle>
              Submitted batches with their hardcopy photo — the hard-vs-soft-copy
              reconciliation view. Click a photo to enlarge.
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {batchesQ.isLoading ? (
            <TableSkeleton rows={3} />
          ) : batchesQ.isError ? (
            <LoadError
              message={
                batchesQ.error instanceof ApiError
                  ? batchesQ.error.message
                  : 'Could not load submissions.'
              }
              onRetry={() => void batchesQ.refetch()}
            />
          ) : batches.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck width={28} height={28} strokeWidth={1.75} />}
              title="No submissions yet"
              description="Finalized batches with a hardcopy photo will appear here."
            />
          ) : (
            <>
              {/* Desktop table (≥ md) */}
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Work date</TH>
                      <TH className="text-right">Workers</TH>
                      <TH className="text-right">Entries</TH>
                      <TH className="text-right">Points</TH>
                      <TH>Submitted by</TH>
                      <TH>Hardcopy</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {batches.map((b) => (
                      <TRow key={b.id}>
                        <TD className="whitespace-nowrap">{formatDate(b.workDate)}</TD>
                        <TD className="text-right tabular-nums">{b.employeeCount}</TD>
                        <TD className="text-right tabular-nums text-text-muted">
                          {b.entryCount}
                        </TD>
                        <TD className="text-right tabular-nums font-semibold">
                          {fmtPoints(b.totalPoints)}
                        </TD>
                        <TD className="text-text-muted">
                          <div>{b.awardedByName ?? '—'}</div>
                          <div className="text-xs text-text-subtle">
                            {formatDateTime(b.createdAt)}
                          </div>
                        </TD>
                        <TD>
                          {b.hardCopyImageUrl ? (
                            <button
                              type="button"
                              onClick={() => setPhotoUrl(b.hardCopyImageUrl ?? null)}
                              className="block h-11 w-11 overflow-hidden rounded-sm border border-border hover:ring-2 hover:ring-focus-ring"
                              aria-label="View hardcopy photo"
                            >
                              <img
                                src={b.hardCopyImageUrl}
                                alt="Hardcopy"
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-text-subtle">
                              <ImageIcon width={14} height={14} strokeWidth={1.75} />
                              Not available
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
                className="p-3"
                cards={batches.map((b) => ({
                  key: b.id,
                  primary: (
                    <span className="block font-medium text-text">
                      {formatDate(b.workDate)}
                    </span>
                  ),
                  primaryRight: (
                    <span className="tabular-nums font-semibold">
                      {fmtPoints(b.totalPoints)}
                    </span>
                  ),
                  meta: (
                    <span>
                      {b.employeeCount} workers · {b.entryCount} entries ·{' '}
                      {b.awardedByName ?? '—'}
                    </span>
                  ),
                  actions: b.hardCopyImageUrl ? (
                    <button
                      type="button"
                      onClick={() => setPhotoUrl(b.hardCopyImageUrl ?? null)}
                      className="flex items-center gap-2 rounded-sm text-sm text-text-muted"
                      aria-label="View hardcopy photo"
                    >
                      <span className="block h-11 w-11 overflow-hidden rounded-sm border border-border">
                        <img
                          src={b.hardCopyImageUrl}
                          alt="Hardcopy"
                          className="h-full w-full object-cover"
                        />
                      </span>
                      View hardcopy
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-text-subtle">
                      <ImageIcon width={14} height={14} strokeWidth={1.75} />
                      No hardcopy available
                    </span>
                  ),
                }))}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Award history / audit trail */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText width={16} height={16} strokeWidth={1.75} />
              Award history
            </CardTitle>
            <CardSubtitle>
              Audit trail of who awarded what, to whom, and when. Undo reverses a
              single entry, or the whole batch it was awarded in.
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {awardsQ.isLoading ? (
            <TableSkeleton rows={5} />
          ) : awardsQ.isError ? (
            <LoadError
              message={
                awardsQ.error instanceof ApiError
                  ? awardsQ.error.message
                  : 'Could not load the award history.'
              }
              onRetry={() => void awardsQ.refetch()}
            />
          ) : awards.length === 0 ? (
            <EmptyState
              icon={<ScrollText width={28} height={28} strokeWidth={1.75} />}
              title="No awards in this window"
              description="No points were awarded during the selected date range."
            />
          ) : (
            <>
              {awards.length >= LEDGER_ROW_CAP ? (
                <p className="flex items-start gap-1.5 border-b border-border px-4 py-2.5 text-xs text-warning">
                  <AlertTriangle
                    width={14}
                    height={14}
                    strokeWidth={1.75}
                    className="mt-px shrink-0"
                  />
                  <span>
                    This window filled the {LEDGER_ROW_CAP}-entry maximum for a
                    single request, so it may hold older entries that are not
                    listed here. Narrow the date range to check.
                  </span>
                </p>
              ) : null}

              {/* Desktop table (≥ md) */}
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Work date</TH>
                      <TH>Warrior</TH>
                      <TH>Work</TH>
                      <TH className="text-right">Points</TH>
                      <TH>Awarded by</TH>
                      <TH className="text-right">Actions</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {awards.map((a) => (
                      <TRow key={a.id}>
                        <TD className="whitespace-nowrap text-text-muted">
                          {formatDate(a.workDate)}
                        </TD>
                        <TD className="font-medium">
                          {nameById.get(a.employeeId) ?? 'Unknown worker'}
                        </TD>
                        <TD>
                          <div>{a.workLabelEn}</div>
                          {a.note ? (
                            <div className="text-xs text-text-muted">{a.note}</div>
                          ) : null}
                        </TD>
                        <TD className="text-right tabular-nums font-semibold">
                          {fmtPoints(a.points)}
                        </TD>
                        <TD className="text-text-muted">{a.awardedByName ?? '—'}</TD>
                        <TD className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setUndoTarget(a)}
                            leftIcon={<Undo2 width={14} height={14} strokeWidth={1.75} />}
                          >
                            Undo
                          </Button>
                        </TD>
                      </TRow>
                    ))}
                  </TBody>
                </Table>
              </div>

              {/* Mobile card-stack (< md) */}
              <MobileCardList
                className="p-3"
                cards={awards.map((a) => ({
                  key: a.id,
                  primary: (
                    <span className="block truncate font-medium text-text">
                      {nameById.get(a.employeeId) ?? 'Unknown worker'}
                    </span>
                  ),
                  primaryRight: (
                    <span className="tabular-nums font-semibold">
                      {fmtPoints(a.points)}
                    </span>
                  ),
                  secondary: (
                    <span>
                      {a.workLabelEn}
                      {a.note ? (
                        <span className="block text-xs text-text-muted">{a.note}</span>
                      ) : null}
                    </span>
                  ),
                  meta: (
                    <span>
                      {formatDate(a.workDate)} · {a.awardedByName ?? '—'}
                    </span>
                  ),
                  actions: (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => setUndoTarget(a)}
                      leftIcon={<Undo2 width={14} height={14} strokeWidth={1.75} />}
                    >
                      Undo
                    </Button>
                  ),
                }))}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AwardPointsDialog
        dealerId={dealer.id}
        roster={roster}
        open={awardOpen}
        onClose={() => setAwardOpen(false)}
      />
      <WorkerFormDialog
        dealerId={dealer.id}
        open={workerDialogOpen}
        onClose={() => setWorkerDialogOpen(false)}
        employee={editingWorker}
      />

      <Dialog
        open={!!undoTarget}
        onClose={() => setUndoTarget(null)}
        title="Undo award"
        description={
          undoTarget
            ? `Reverse ${fmtPoints(undoTarget.points)} pts for “${undoTarget.workLabelEn}”?`
            : undefined
        }
        footer={
          // Stack full-width on mobile (each button is large and unambiguous;
          // the two destructive "Undo" variants are no longer side-by-side at
          // thumb width). Desktop keeps the right-aligned row.
          <div className="grid w-full grid-cols-1 gap-2 md:flex md:justify-end md:gap-2">
            <Button variant="secondary" onClick={() => setUndoTarget(null)}>
              Cancel
            </Button>
            {undoTarget?.batchId ? (
              <Button
                variant="secondary"
                onClick={() => doUndo('batch')}
                loading={undoAward.isPending && undoAward.variables?.scope === 'batch'}
              >
                Undo whole batch
              </Button>
            ) : null}
            <Button
              variant="danger"
              onClick={() => doUndo()}
              loading={undoAward.isPending && undoAward.variables?.scope !== 'batch'}
            >
              Undo this entry
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">
          Undoing an award removes the ledger row(s) and adjusts the worker&apos;s
          totals. This is recorded in the dealer&apos;s activity log.
          {undoTarget?.batchId
            ? ' Use “Undo whole batch” to reverse every entry awarded in the same action.'
            : ''}
        </p>
      </Dialog>

      <Dialog
        open={!!photoUrl}
        onClose={() => setPhotoUrl(null)}
        size="lg"
        title="Hardcopy photo"
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt="Hardcopy submission"
            className="mx-auto max-h-[60vh] w-auto rounded-sm"
          />
        ) : null}
      </Dialog>
    </div>
  );
}

/* ─────────────────────────────── Helpers ────────────────────────────────── */

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="grid gap-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <EmptyState
      icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
      title="Could not load"
      description={message}
      cta={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}
