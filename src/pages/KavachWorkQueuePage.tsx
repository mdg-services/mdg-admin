import {
  AlertCircle,
  Inbox,
  LayoutList,
  RotateCw,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  EmptyState,
  Label,
  MobileCardList,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import { useKavachDashboardQuery } from '@/hooks/api/useKavach';
import {
  kavachDaysPendingChip,
  useKavachCatalogLookup,
  useKavachWorkQueue,
  type KavachQueueFilters,
} from '@/hooks/api/useKavachQueue';
import { cn } from '@/lib/cn';
import {
  EVIDENCE_LABEL,
  ITEM_STATUS_LABEL,
  itemStatusIntent,
  REQUEST_STATE_LABEL,
  requestStateIntent,
  VERIFICATION_LABEL,
} from '@/lib/kavach';
import {
  dealerCodeLabel,
  KAVACH_PENDING_STATUSES,
  KAVACH_VERIFICATION_MODES,
  type KavachItemStatus,
  type KavachVerificationMode,
  type KavachWorkQueueRow,
} from '@dk/shared';

import { RequestEvidenceDialog } from './kavach/RequestEvidenceDialog';
import {
  EVIDENCE_ICON,
  VERIFICATION_ICON,
  VerifyTaskDrawer,
  type VerifyOutcome,
} from './kavach/VerifyTaskDrawer';

/**
 * The admin's daily working screen: everything outstanding, across every dealer.
 *
 * WHY GROUPED BY TASK BY DEFAULT
 * ------------------------------
 * 45 tasks, ten of them daily, means roughly 10.6 verifications per dealer per
 * day — 85 across eight dealers and 530 across fifty. One task means one kind of
 * evidence and one mental context, so doing "stock board, every dealer" in a
 * single pass costs an admin one re-orientation; doing dealer-by-dealer costs
 * them forty-five a day. The flat "by dealer" grouping is still one click away,
 * because the visit-a-dealer conversation is a real one — it is just not the
 * shape of the job.
 *
 * WHY CLOSED ROWS STAY ON SCREEN
 * ------------------------------
 * A verified row is marked and dimmed rather than removed. The list an admin is
 * reading has to be the list they act on: if closing row 12 silently pulled the
 * rows up, "Save & next" would land on whatever slid into slot 13 rather than on
 * the row underneath the one just closed. Refresh clears them.
 */

/**
 * Statuses an admin can narrow to. The pending set comes from the shared
 * constant so this screen and the dealer's own list can never disagree about
 * what is outstanding. `HELD` is added deliberately: it is the one status that
 * is NOT the dealer's problem — an automation of ours that could not run — and
 * it has no other alarm anywhere in the product.
 */
const STATUS_OPTIONS: KavachItemStatus[] = [
  ...KAVACH_PENDING_STATUSES,
  'HELD',
];

const HANDLED_LABEL: Record<VerifyOutcome, string> = {
  verified: 'Verified',
  'sent-back': 'Sent back',
  asked: 'Asked',
};

/** How close to the end of the loaded rows before the next page is fetched. */
const PREFETCH_MARGIN = 5;

type GroupBy = 'task' | 'dealer';

interface QueueGroup {
  key: string;
  title: string;
  subtitle: string;
  rows: KavachWorkQueueRow[];
}

/**
 * Bucket the loaded rows and put the most overdue bucket first.
 *
 * Groups cover what has been LOADED, not the whole filter — the queue is keyset
 * paginated and cannot be grouped server-side without reading all of it. The
 * screen says so out loud whenever more rows remain rather than letting an admin
 * read a partial group as a complete one.
 */
function groupRows(rows: KavachWorkQueueRow[], by: GroupBy): QueueGroup[] {
  const map = new Map<string, KavachWorkQueueRow[]>();
  for (const row of rows) {
    const key = by === 'task' ? row.code : row.dealerId;
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }

  const groups: QueueGroup[] = [];
  for (const [key, groupRowsIn] of map) {
    const sorted = [...groupRowsIn].sort(
      (a, b) =>
        b.daysPending - a.daysPending ||
        (by === 'task'
          ? a.dealerCode.localeCompare(b.dealerCode)
          : a.labelEn.localeCompare(b.labelEn)),
    );
    const first = sorted[0];
    if (!first) continue;
    groups.push({
      key,
      title: by === 'task' ? first.labelEn : dealerCodeLabel(first.dealerCode),
      subtitle:
        by === 'task'
          ? `${sorted.length} ${sorted.length === 1 ? 'dealer' : 'dealers'} · ${first.points} pts each`
          : `${sorted.length} ${sorted.length === 1 ? 'task' : 'tasks'} outstanding`,
      rows: sorted,
    });
  }

  return groups.sort(
    (a, b) =>
      (b.rows[0]?.daysPending ?? 0) - (a.rows[0]?.daysPending ?? 0) ||
      b.rows.length - a.rows.length,
  );
}

export function KavachWorkQueuePage() {
  const [filters, setFilters] = React.useState<KavachQueueFilters>({});
  const [groupBy, setGroupBy] = React.useState<GroupBy>('task');
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const [handled, setHandled] = React.useState<Record<string, VerifyOutcome>>(
    {},
  );
  const [askRow, setAskRow] = React.useState<KavachWorkQueueRow | null>(null);

  const queueQ = useKavachWorkQueue(filters);
  const catalogQuery = useKavachCatalogLookup();
  const dashboardQ = useKavachDashboardQuery();

  const rows = React.useMemo(
    () => queueQ.data?.pages.flatMap((p) => p.rows) ?? [],
    [queueQ.data],
  );
  const total = queueQ.data?.pages[0]?.total ?? 0;

  const groups = React.useMemo(() => groupRows(rows, groupBy), [rows, groupBy]);
  // The order the admin actually sees is the order "Save & next" must follow.
  const orderedRows = React.useMemo(
    () => groups.flatMap((g) => g.rows),
    [groups],
  );

  // The dealer list and the review count both come from the dashboard. When it
  // has not answered, the button says "Needs review" with no figure rather than
  // a confident zero — a screen that states a number the data does not support
  // is worse than one that admits it does not know yet.
  const dealerOptions = dashboardQ.data ?? [];
  const needsReview = dashboardQ.data
    ? dashboardQ.data.reduce((sum, d) => sum + d.awaitingReviewCount, 0)
    : null;

  /**
   * Task codes seen in this session, and it only ever grows.
   *
   * Seeded from `/kavach/catalog` (readable by any admin) and topped up from the
   * rows on screen, so a custom task a dealer has but the catalog does not still
   * appears. Sticky because narrowing to one task makes the queue return only
   * that task: rebuilt from the current rows alone, the dropdown would collapse
   * to the option already chosen, and an admin who had finished the stock boards
   * could not move to the next task without clearing the filter first.
   */
  const [taskCatalog, setTaskCatalog] = React.useState<Record<string, string>>(
    {},
  );
  React.useEffect(() => {
    setTaskCatalog((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const entry of catalogQuery.data ?? []) {
        if (next[entry.code] !== entry.labelEn) {
          next[entry.code] = entry.labelEn;
          changed = true;
        }
      }
      for (const row of rows) {
        if (next[row.code] !== row.labelEn) {
          next[row.code] = row.labelEn;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows, catalogQuery.data]);
  const taskOptions = React.useMemo(
    () => Object.entries(taskCatalog).sort((a, b) => a[1].localeCompare(b[1])),
    [taskCatalog],
  );

  const activeRow =
    activeIndex === null ? null : (orderedRows[activeIndex] ?? null);
  const hasNextRow =
    activeIndex !== null && activeIndex + 1 < orderedRows.length;

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = queueQ;

  // Keep a page in hand so "Save & next" near the bottom of the list does not
  // stall on a network round trip mid-pass.
  React.useEffect(() => {
    if (activeIndex === null) return;
    if (activeIndex < orderedRows.length - PREFETCH_MARGIN) return;
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [
    activeIndex,
    orderedRows.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  function patchFilters(patch: Partial<KavachQueueFilters>) {
    setActiveIndex(null);
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function refresh() {
    setHandled({});
    setActiveIndex(null);
    void queueQ.refetch();
  }

  const filtersActive =
    !!filters.dealerId ||
    !!filters.code ||
    !!filters.status ||
    !!filters.verification ||
    !!filters.awaitingReview;

  const handledCount = Object.keys(handled).length;

  function rowIndexOf(itemId: string): number {
    return orderedRows.findIndex((r) => r.itemId === itemId);
  }

  const askable = (row: KavachWorkQueueRow) =>
    row.verification === 'DEALER_EVIDENCE_THEN_ADMIN' &&
    row.requestState !== 'SUBMITTED';

  return (
    <div>
      <PageHeader
        title="Work queue"
        subtitle="Everything outstanding across every dealer. A task is certified by an MDG admin — never by the dealer."
        actions={
          <>
            <Badge
              intent={total > 0 ? 'warning' : 'success'}
              className="h-7 px-3"
            >
              {total} outstanding
            </Badge>
            <Button
              size="sm"
              variant={filters.awaitingReview ? 'primary' : 'secondary'}
              onClick={() =>
                patchFilters({
                  awaitingReview: filters.awaitingReview ? undefined : true,
                })
              }
              leftIcon={<Inbox width={14} height={14} strokeWidth={1.75} />}
            >
              {needsReview === null ? 'Needs review' : `${needsReview} need review`}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={refresh}
              loading={queueQ.isRefetching}
              aria-label="Refresh the queue"
              leftIcon={<RotateCw width={14} height={14} strokeWidth={1.75} />}
            >
              Refresh
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label htmlFor="queue-dealer">Dealer</Label>
            <Select
              id="queue-dealer"
              value={filters.dealerId ?? ''}
              onChange={(e) =>
                patchFilters({ dealerId: e.target.value || undefined })
              }
            >
              <option value="">All dealers</option>
              {dealerOptions.map((d) => (
                <option key={d.dealerId} value={d.dealerId}>
                  {dealerCodeLabel(d.dealerCode)}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="queue-task" hint="seen so far">
              Task
            </Label>
            <Select
              id="queue-task"
              value={filters.code ?? ''}
              onChange={(e) =>
                patchFilters({ code: e.target.value || undefined })
              }
            >
              <option value="">All tasks</option>
              {taskOptions.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="queue-status">Status</Label>
            <Select
              id="queue-status"
              value={filters.status ?? ''}
              onChange={(e) =>
                patchFilters({
                  status: (e.target.value || undefined) as
                    | KavachItemStatus
                    | undefined,
                })
              }
            >
              <option value="">Everything outstanding</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {ITEM_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="queue-verification">Verified by</Label>
            <Select
              id="queue-verification"
              value={filters.verification ?? ''}
              onChange={(e) =>
                patchFilters({
                  verification: (e.target.value || undefined) as
                    | KavachVerificationMode
                    | undefined,
                })
              }
            >
              <option value="">Any</option>
              {KAVACH_VERIFICATION_MODES.map((v) => (
                <option key={v} value={v}>
                  {VERIFICATION_LABEL[v]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Group by</Label>
            <div className="flex gap-1">
              <Button
                size="sm"
                className="flex-1"
                variant={groupBy === 'task' ? 'primary' : 'secondary'}
                onClick={() => {
                  setActiveIndex(null);
                  setGroupBy('task');
                }}
                leftIcon={
                  <LayoutList width={14} height={14} strokeWidth={1.75} />
                }
              >
                Task
              </Button>
              <Button
                size="sm"
                className="flex-1"
                variant={groupBy === 'dealer' ? 'primary' : 'secondary'}
                onClick={() => {
                  setActiveIndex(null);
                  setGroupBy('dealer');
                }}
                leftIcon={<Users width={14} height={14} strokeWidth={1.75} />}
              >
                Dealer
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {dashboardQ.isError ? (
        <Callout
          intent="warning"
          className="mb-4"
          onRetry={() => void dashboardQ.refetch()}
        >
          The dealer list and the review count could not be loaded, so the dealer
          filter above is empty. The queue itself below is unaffected.
        </Callout>
      ) : null}

      {handledCount > 0 ? (
        <Callout intent="info" className="mb-4">
          {handledCount} {handledCount === 1 ? 'row' : 'rows'} handled in this
          pass, still shown in place so the list does not shift under you. Use
          Refresh above to clear them.
        </Callout>
      ) : null}

      {rows.length > 0 && rows.length < total ? (
        <Callout intent="warning" className="mb-4">
          Showing {rows.length} of {total}. Groups cover the rows loaded so far —
          pick a single task above to work one of them end to end.
        </Callout>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {queueQ.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : queueQ.isError ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load the work queue"
              description={(queueQ.error as Error).message}
              cta={
                <Button
                  onClick={() => void queueQ.refetch()}
                  leftIcon={
                    <RotateCw width={16} height={16} strokeWidth={1.75} />
                  }
                >
                  Try again
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck width={28} height={28} strokeWidth={1.75} />}
              title={
                filtersActive
                  ? 'Nothing matches these filters'
                  : 'Nothing outstanding'
              }
              description={
                filtersActive
                  ? 'Every task under this filter is verified, paused or held.'
                  : 'Every tracked task across every dealer has been verified. Initiate a Kavach programme from a dealer to add more.'
              }
              cta={
                filtersActive ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setActiveIndex(null);
                      setFilters({});
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="divide-y divide-border">
              {groups.map((group) => (
                <section key={group.key}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 bg-surface-2 px-4 py-2">
                    <h2 className="text-sm font-semibold text-text">
                      {group.title}
                    </h2>
                    <span className="text-xs text-text-muted">
                      {group.subtitle}
                    </span>
                  </div>

                  {/* Desktop table (≥ md) */}
                  <div className="hidden md:block">
                    <Table>
                      <THead>
                        <TRow>
                          <TH>{groupBy === 'task' ? 'Dealer' : 'Task'}</TH>
                          <TH>Status</TH>
                          <TH className="text-right">Points</TH>
                          <TH>Pending</TH>
                          <TH>Evidence</TH>
                          <TH>Waiting on</TH>
                          <TH />
                        </TRow>
                      </THead>
                      <TBody>
                        {group.rows.map((row) => {
                          const pending = kavachDaysPendingChip(row);
                          const EvidenceIcon = EVIDENCE_ICON[row.evidence];
                          const VerificationIcon =
                            VERIFICATION_ICON[row.verification];
                          const mark = handled[row.itemId];
                          return (
                            <TRow
                              key={row.itemId}
                              clickable
                              className={cn(mark && 'opacity-60')}
                              onClick={() =>
                                setActiveIndex(rowIndexOf(row.itemId))
                              }
                            >
                              <TD
                                className={cn(
                                  'font-medium',
                                  groupBy === 'task' && 'font-mono',
                                )}
                              >
                                {groupBy === 'task'
                                  ? dealerCodeLabel(row.dealerCode)
                                  : row.labelEn}
                              </TD>
                              <TD>
                                <Badge intent={itemStatusIntent(row.status)}>
                                  {ITEM_STATUS_LABEL[row.status]}
                                </Badge>
                              </TD>
                              <TD className="text-right tabular-nums text-text-muted">
                                {row.points}
                              </TD>
                              <TD>
                                <Badge intent={pending.intent}>
                                  {pending.text}
                                </Badge>
                              </TD>
                              <TD>
                                <span className="inline-flex items-center gap-1.5 text-text-muted">
                                  <EvidenceIcon
                                    width={14}
                                    height={14}
                                    strokeWidth={1.75}
                                    className="shrink-0"
                                  />
                                  {EVIDENCE_LABEL[row.evidence]}
                                </span>
                              </TD>
                              <TD>
                                {row.requestState === 'NONE' ? (
                                  <span className="inline-flex items-center gap-1.5 text-text-subtle">
                                    <VerificationIcon
                                      width={14}
                                      height={14}
                                      strokeWidth={1.75}
                                      className="shrink-0"
                                    />
                                    {VERIFICATION_LABEL[row.verification]}
                                  </span>
                                ) : (
                                  <Badge
                                    intent={requestStateIntent(
                                      row.requestState,
                                    )}
                                  >
                                    {REQUEST_STATE_LABEL[row.requestState]}
                                  </Badge>
                                )}
                              </TD>
                              <TD className="text-right">
                                {mark ? (
                                  <Badge intent="success">
                                    {HANDLED_LABEL[mark]}
                                  </Badge>
                                ) : askable(row) ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    aria-label="Ask the dealer for evidence"
                                    title="Ask the dealer for evidence"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAskRow(row);
                                    }}
                                  >
                                    <Send
                                      width={14}
                                      height={14}
                                      strokeWidth={1.75}
                                    />
                                  </Button>
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
                    cards={group.rows.map((row) => {
                      const pending = kavachDaysPendingChip(row);
                      const mark = handled[row.itemId];
                      return {
                        key: row.itemId,
                        onClick: () => setActiveIndex(rowIndexOf(row.itemId)),
                        primary: (
                          <span
                            className={cn(
                              'block truncate font-medium text-text',
                              mark && 'opacity-60',
                            )}
                          >
                            {groupBy === 'task'
                              ? dealerCodeLabel(row.dealerCode)
                              : row.labelEn}
                          </span>
                        ),
                        primaryRight: mark ? (
                          <Badge intent="success">{HANDLED_LABEL[mark]}</Badge>
                        ) : (
                          <Badge intent={pending.intent}>{pending.text}</Badge>
                        ),
                        secondary: (
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Badge intent={itemStatusIntent(row.status)}>
                              {ITEM_STATUS_LABEL[row.status]}
                            </Badge>
                            {row.requestState !== 'NONE' ? (
                              <Badge
                                intent={requestStateIntent(
                                  row.requestState,
                                )}
                              >
                                {REQUEST_STATE_LABEL[row.requestState]}
                              </Badge>
                            ) : null}
                          </span>
                        ),
                        meta: (
                          <span className="flex flex-wrap items-center gap-x-2">
                            <span>{row.points} pts</span>
                            <span>
                              · {EVIDENCE_LABEL[row.evidence]} required
                            </span>
                            <span>
                              · {VERIFICATION_LABEL[row.verification]}
                            </span>
                          </span>
                        ),
                      };
                    })}
                  />
                </section>
              ))}

              {hasNextPage ? (
                <div className="flex justify-center p-4">
                  <Button
                    variant="secondary"
                    loading={isFetchingNextPage}
                    onClick={() => void fetchNextPage()}
                  >
                    Load more ({total - rows.length} left)
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <VerifyTaskDrawer
        open={activeRow !== null}
        row={activeRow}
        position={
          activeIndex === null
            ? undefined
            : { index: activeIndex + 1, total: orderedRows.length }
        }
        hasNext={hasNextRow}
        onNext={() => setActiveIndex((i) => (i === null ? null : i + 1))}
        onClose={() => setActiveIndex(null)}
        onHandled={(itemId, outcome) =>
          setHandled((prev) => ({ ...prev, [itemId]: outcome }))
        }
      />

      <RequestEvidenceDialog
        open={askRow !== null}
        row={askRow}
        onSent={() => {
          if (askRow) {
            const itemId = askRow.itemId;
            setHandled((prev) => ({ ...prev, [itemId]: 'asked' }));
          }
        }}
        onClose={() => setAskRow(null)}
      />
    </div>
  );
}
