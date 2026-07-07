import { AlertCircle, ScrollText, Trophy, Users } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  EmptyState,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import {
  useStaffAwardsQuery,
  useStaffOverviewQuery,
} from '@/hooks/api/useStaff';
import { ApiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import type { Dealer, EmployeeStatus } from '@dk/shared';

interface Props {
  dealer: Dealer;
}

/* ─────────────────────────────── Date window ────────────────────────────── */

type Preset = 'today' | 'last7' | 'month';

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'month', label: 'This month' },
];

/** Local YYYY-MM-DD. Server treats windows as IST calendar days; the admin lens
 *  accepts a plain local day (see task note). */
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function windowFor(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const to = toYmd(now);
  if (preset === 'today') return { from: to, to };
  if (preset === 'last7') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6); // inclusive 7-day window
    return { from: toYmd(from), to };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: toYmd(from), to };
}

/* ─────────────────────────────── Small bits ─────────────────────────────── */

function EmployeeStatusChip({ status }: { status: EmployeeStatus }) {
  return (
    <Badge intent={status === 'ACTIVE' ? 'success' : 'neutral'}>
      {status === 'ACTIVE' ? 'Active' : 'Inactive'}
    </Badge>
  );
}

/** Trim points to at most 2 dp, dropping trailing zeros (points may be fractional). */
function fmtPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/* ─────────────────────────────── Component ──────────────────────────────── */

export function DealerStaffTab({ dealer }: Props) {
  const [preset, setPreset] = React.useState<Preset>('today');
  const [includeInactive, setIncludeInactive] = React.useState(false);

  const win = React.useMemo(() => windowFor(preset), [preset]);

  const overviewQ = useStaffOverviewQuery(dealer.id, {
    from: win.from,
    to: win.to,
    includeInactive,
  });
  const awardsQ = useStaffAwardsQuery(dealer.id, {
    from: win.from,
    to: win.to,
  });

  const overview = overviewQ.data;
  const roster = overview?.roster ?? [];
  const summary = overview?.summary;
  const awards = awardsQ.data ?? [];

  // employeeId → display name, resolved from roster then summary rows.
  const nameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const row of summary?.rows ?? []) map.set(row.employeeId, row.employeeName);
    for (const emp of roster) map.set(emp.id, emp.name);
    return map;
  }, [roster, summary]);

  const targetPoints = summary?.targetPoints;
  const windowLabel =
    win.from === win.to
      ? formatDate(win.from)
      : `${formatDate(win.from)} – ${formatDate(win.to)}`;

  return (
    <div className="grid gap-4">
      {/* Date-window control */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-md border border-border-strong p-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                aria-pressed={preset === p.id}
                className={
                  preset === p.id
                    ? 'rounded-[5px] bg-brand px-3 py-1.5 text-sm font-semibold text-text-inverse'
                    : 'rounded-[5px] px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text'
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="text-sm text-text-muted">
            Showing{' '}
            <span className="font-medium text-text">{windowLabel}</span>
            {typeof targetPoints === 'number' ? (
              <>
                {' '}· target{' '}
                <span className="font-medium text-text">
                  {fmtPoints(targetPoints)}
                </span>{' '}
                pts / worker
              </>
            ) : null}
          </div>
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
              description="No worker earned points during the selected date range."
            />
          ) : (
            <Table>
              <THead>
                <TRow>
                  <TH className="w-12">#</TH>
                  <TH>Worker</TH>
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
          )}
        </CardContent>
      </Card>

      {/* Roster */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users width={16} height={16} strokeWidth={1.75} />
              Roster
            </CardTitle>
            <CardSubtitle>
              Workers on this dealer&apos;s staff, with window and lifetime points.
            </CardSubtitle>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border-strong accent-brand"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Include inactive
          </label>
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
              title="No staff on record"
              description={
                includeInactive
                  ? 'This dealer has not added any workers yet.'
                  : 'No active workers. Enable “Include inactive” to see workers who have left.'
              }
            />
          ) : (
            <Table>
              <THead>
                <TRow>
                  <TH>Worker</TH>
                  <TH>Designation</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Window pts</TH>
                  <TH className="text-right">Lifetime pts</TH>
                </TRow>
              </THead>
              <TBody>
                {roster.map((emp) => (
                  <TRow key={emp.id}>
                    <TD>
                      <div className="font-medium">{emp.name}</div>
                      {emp.phone ? (
                        <div className="text-xs text-text-muted">{emp.phone}</div>
                      ) : null}
                    </TD>
                    <TD className="text-text-muted">
                      {emp.designation ?? '—'}
                    </TD>
                    <TD>
                      <EmployeeStatusChip status={emp.status} />
                    </TD>
                    <TD className="text-right tabular-nums">
                      {fmtPoints(emp.pointsInWindow)}
                    </TD>
                    <TD className="text-right tabular-nums text-text-muted">
                      {fmtPoints(emp.totalPoints)}
                    </TD>
                  </TRow>
                ))}
              </TBody>
            </Table>
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
              Audit trail of who awarded what, to whom, and when. Undos are not
              shown here — they are recorded in the dealer Activity log.
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
            <Table>
              <THead>
                <TRow>
                  <TH>Work date</TH>
                  <TH>Worker</TH>
                  <TH>Work</TH>
                  <TH className="text-right">Points</TH>
                  <TH>Awarded by</TH>
                  <TH>Recorded</TH>
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
                    <TD className="text-text-muted">
                      {a.awardedByName ?? '—'}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-text-subtle">
                      {formatDateTime(a.createdAt)}
                    </TD>
                  </TRow>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
