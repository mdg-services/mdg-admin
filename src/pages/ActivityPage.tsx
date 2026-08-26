import { AlertCircle, ScrollText } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Card,
  CardContent,
  Dialog,
  EmptyState,
  FilterBar,
  Input,
  MobileCardList,
  Pagination,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import {
  useAuditActorsQuery,
  useAuditQuery,
  type AuditListParams,
} from '@/hooks/api/useAuditLogs';
import { formatDateTime } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import { AUDIT_ACTIONS, AUDIT_ENTITIES, type AuditLog } from '@dk/shared';

const PAGE_SIZE = 25;

/**
 * The `GET /audit` response now includes a resolved, human-readable target
 * name (`entityName`) alongside the raw `entityId`. `AuditLog` from `@dk/shared`
 * doesn't declare it, so widen it locally rather than touching the shared type.
 */
type AuditRow = AuditLog & { entityName?: string | null };

/** Colour the action badge by the kind of change, purely for scannability. */
function actionIntent(action: string): Intent {
  if (
    action === 'DELETE' ||
    action === 'LOGIN_FAILED' ||
    action === 'CONVERSATION_AUTO_UNASSIGNED' ||
    action === 'ADMIN_PASSWORD_RESET' ||
    action === 'IRAS_CREDENTIALS_CLEAR' ||
    action === 'SDMS_CREDENTIALS_CLEAR' ||
    action === 'STAFF_DRAFT_CLEAR' ||
    action === 'STAFF_POINTS_UNDO'
  ) {
    return 'danger';
  }
  if (
    action === 'CREATE' ||
    action === 'LOGIN' ||
    action === 'ADMIN_CREATE' ||
    action === 'SERVICE_ATTACH' ||
    action === 'CONVERSATION_STARTED' ||
    action === 'CONVERSATION_RESOLVED' ||
    action === 'CREDIT_DOD_SHARE' ||
    action === 'BANK_HOLIDAY_CONFIRM'
  ) {
    return 'success';
  }
  if (action === 'STATUS_CHANGE' || action === 'CONVERSATION_REOPENED') {
    return 'warning';
  }
  if (
    action === 'RECORD_VIEWED' ||
    action === 'ARTIFACT_DOWNLOAD' ||
    action === 'ATTACHMENT_DOWNLOAD' ||
    action === 'IRAS_CREDENTIALS_SET' ||
    action === 'SDMS_CREDENTIALS_SET' ||
    action === 'CONVERSATION_ASSIGNED' ||
    action === 'CONVERSATION_REASSIGNED'
  ) {
    return 'info';
  }
  return 'neutral';
}

function humanize(s: string): string {
  return s.replace(/_/g, ' ');
}

function roleLabel(role?: string | null): string {
  if (!role) return '—';
  if (role === 'dealer-owner') return 'Owner';
  // `dealer-staff` is the MANAGER login role — a person with an app account, not
  // a warrior (a roster record with no login). InboxPage, AllUsersPage and
  // DealerMembersTab already call it "Manager"; this was the odd one out.
  if (role === 'dealer-staff') return 'Manager';
  if (role === 'admin') return 'Admin';
  return role;
}

/** The five filter keys this page owns, so counting and clearing stay in step. */
const FILTER_KEYS = ['actorId', 'entity', 'action', 'from', 'to'] as const;

export function ActivityPage() {
  const [search, setSearch] = useSearchParams();
  const [selected, setSelected] = React.useState<AuditRow | null>(null);

  const actorId = search.get('actorId') ?? '';
  const entity = search.get('entity') ?? '';
  const action = search.get('action') ?? '';
  const fromDate = search.get('from') ?? '';
  const toDate = search.get('to') ?? '';
  const page = Number(search.get('page') ?? '1');

  const actorsQ = useAuditActorsQuery();

  const params: AuditListParams = {
    actorId: actorId || undefined,
    entity: entity || undefined,
    action: action || undefined,
    from: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined,
    to: toDate ? new Date(`${toDate}T23:59:59.999`).toISOString() : undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const { data, isLoading, isError, error, isFetching } = useAuditQuery(params);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setSearch(next, { replace: true });
  }

  function setPage(p: number) {
    const next = new URLSearchParams(search);
    next.set('page', String(p));
    setSearch(next, { replace: true });
  }

  function clearFilters() {
    const next = new URLSearchParams(search);
    for (const k of FILTER_KEYS) next.delete(k);
    next.delete('page');
    setSearch(next, { replace: true });
  }

  const activeFilterCount = FILTER_KEYS.filter((k) => search.get(k)).length;

  /* One copy of the controls, rendered into whichever shell is mounted. */
  const filterFields = (
    <>
      <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
        Actor
        <Select
          value={actorId}
          onChange={(e) => setFilter('actorId', e.target.value)}
        >
          <option value="">All actors</option>
          {(actorsQ.data ?? []).map((a) => (
            <option key={a.actorId} value={a.actorId}>
              {(a.actorName || a.actorEmail || a.actorId) +
                (a.count ? ` (${a.count})` : '')}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
        Entity
        <Select
          value={entity}
          onChange={(e) => setFilter('entity', e.target.value)}
        >
          <option value="">All entities</option>
          {AUDIT_ENTITIES.map((en) => (
            <option key={en} value={en}>
              {en}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
        Action
        <Select
          value={action}
          onChange={(e) => setFilter('action', e.target.value)}
        >
          <option value="">All actions</option>
          {[...AUDIT_ACTIONS].sort().map((a) => (
            <option key={a} value={a}>
              {humanize(a)}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
        From
        <Input
          type="date"
          value={fromDate}
          max={toDate || undefined}
          onChange={(e) => setFilter('from', e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
        To
        <Input
          type="date"
          value={toDate}
          min={fromDate || undefined}
          onChange={(e) => setFilter('to', e.target.value)}
        />
      </label>
    </>
  );

  return (
    <div>
      <PageHeader
        title="Activity"
        subtitle="Audit trail of every action taken across the portal."
      />

      {/* Five stacked label+control pairs cost ~360px of a 640px screen before
          one audit row is visible, so below md they collapse into `FilterBar`'s
          one 44px trigger and a Sheet. `contentClassName` carries this page's
          own `sm:2 / lg:5` ladder verbatim into the md+ card — `columnsAtMd` is
          a single count, and neither 2 nor 5 reproduces it without regressing a
          real width. Exactly one branch mounts; the filter state lives in the
          URL, which is what makes that safe. */}
      <FilterBar
        className="mb-4"
        contentClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
        activeCount={activeFilterCount}
        onClear={clearFilters}
      >
        {filterFields}
      </FilterBar>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <ListSkeleton />
          ) : isError ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load activity"
              description={(error as Error).message}
            />
          ) : data && data.items.length === 0 ? (
            <EmptyState
              icon={<ScrollText width={28} height={28} strokeWidth={1.75} />}
              title="No activity"
              description="No audit entries match these filters."
            />
          ) : data ? (
            <>
              {/* Desktop table (≥ md) */}
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Time</TH>
                      <TH>Actor</TH>
                      <TH>Action</TH>
                      <TH>Entity</TH>
                      <TH>Target</TH>
                      <TH>IP</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {(data.items as AuditRow[]).map((row) => (
                      <TRow key={row.id} clickable onClick={() => setSelected(row)}>
                        <TD className="whitespace-nowrap text-text-muted">
                          {formatDateTime(row.at)}
                        </TD>
                        <TD>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {row.actorName || row.actorEmail || 'System'}
                            </span>
                            <span className="text-xs text-text-subtle">
                              {roleLabel(row.actorRole)}
                            </span>
                          </div>
                        </TD>
                        <TD>
                          <Badge intent={actionIntent(row.action)}>
                            {humanize(row.action)}
                          </Badge>
                        </TD>
                        <TD className="text-text-muted">{row.entity}</TD>
                        {row.entityName ? (
                          <TD
                            className="max-w-[10rem] truncate text-text-muted"
                            title={row.entityId}
                          >
                            {row.entityName}
                          </TD>
                        ) : (
                          <TD
                            className="max-w-[10rem] truncate font-mono text-xs text-text-muted"
                            title={row.entityId}
                          >
                            {row.entityId}
                          </TD>
                        )}
                        <TD className="font-mono text-xs text-text-subtle">
                          {row.ip ?? '—'}
                        </TD>
                      </TRow>
                    ))}
                  </TBody>
                </Table>
              </div>

              {/* Mobile card-stack (< md) */}
              <MobileCardList
                className="p-3"
                cards={(data.items as AuditRow[]).map((row) => ({
                  key: row.id,
                  onClick: () => setSelected(row),
                  primary: (
                    <Badge intent={actionIntent(row.action)}>
                      {humanize(row.action)}
                    </Badge>
                  ),
                  primaryRight: (
                    <span className="whitespace-nowrap text-xs text-text-subtle">
                      {formatDateTime(row.at)}
                    </span>
                  ),
                  secondary: (
                    <span className="block">
                      <span className="font-medium text-text">
                        {row.actorName || row.actorEmail || 'System'}
                      </span>
                      <span className="ml-1.5 text-xs text-text-subtle">
                        {roleLabel(row.actorRole)}
                      </span>
                    </span>
                  ),
                  meta: (
                    <span className="block truncate font-mono">
                      {row.entity} · {row.entityName ?? row.entityId}
                    </span>
                  ),
                }))}
              />
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onPageChange={setPage}
              />
              {isFetching ? (
                <p className="px-3 pb-2 text-xs text-text-subtle">Refreshing...</p>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <AuditDetailDialog row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function AuditDetailDialog({
  row,
  onClose,
}: {
  row: AuditRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={row !== null}
      onClose={onClose}
      size="lg"
      title={row ? humanize(row.action) : ''}
      description={row ? formatDateTime(row.at) : undefined}
    >
      {row ? (
        <div className="flex flex-col gap-4 text-sm">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <DetailRow label="Actor" value={row.actorName || row.actorEmail || 'System'} />
            <DetailRow label="Role" value={roleLabel(row.actorRole)} />
            <DetailRow label="Actor email" value={row.actorEmail ?? '—'} />
            <DetailRow label="Actor id" value={row.actorId} mono />
            <DetailRow
              label="Entity"
              value={`${row.entity} · ${row.entityName ?? row.entityId}`}
              mono={!row.entityName}
            />
            {row.entityName ? (
              <DetailRow label="Entity id" value={row.entityId} mono />
            ) : null}
            <DetailRow
              label="Request"
              value={row.method || row.path ? `${row.method ?? ''} ${row.path ?? ''}`.trim() : '—'}
              mono
            />
            <DetailRow label="IP" value={row.ip ?? '—'} mono />
            <DetailRow label="User-agent" value={row.userAgent ?? '—'} />
          </dl>

          {row.before !== undefined && row.before !== null ? (
            <JsonBlock label="Before" value={row.before} />
          ) : null}
          {row.after !== undefined && row.after !== null ? (
            <JsonBlock label="After" value={row.after} />
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs font-medium text-text-subtle">{label}</dt>
      <dd className={mono ? 'break-all font-mono text-xs text-text' : 'break-words text-text'}>
        {value}
      </dd>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-subtle">{label}</span>
      {/* `.scroll-pane` (overscroll-behavior: contain): this is a scroller
          nested inside the Dialog's own scrolling body, and without it a flick
          that reached the end of the payload chained straight into the sheet
          and dragged it off the screen. `whitespace-pre-wrap break-all` so a
          long S3 key or id wraps instead of turning a 296px box into a
          two-axis scroller with no visible bounds. */}
      <pre className="scroll-pane max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-surface-2 p-3 text-xs text-text md:whitespace-pre md:break-normal">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/**
 * The placeholder has to promise the shape that is coming. Below md that is a
 * card stack, not a grid: 24 bars in two columns read as a two-column table
 * this breakpoint never renders.
 */
function ListSkeleton() {
  return (
    <div className="p-4">
      <div className="grid gap-2 md:hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="hidden gap-3 md:grid md:grid-cols-6">
        {Array.from({ length: 24 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    </div>
  );
}
