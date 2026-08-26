import { AlertCircle, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  MobileCardList,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import { useKavachDashboardQuery } from '@/hooks/api/useKavach';
import { formatDateTime } from '@/lib/format';
import { operationalIntent, stalenessIntent } from '@/lib/kavach';
import { dealerCodeLabel } from '@dk/shared';

const RISK_THRESHOLD = 80;

/**
 * Days without any verification before a dealer counts as neglected BY US.
 * Every task bar the yearly ones comes round at least monthly, so a week of
 * silence across a whole outlet means nobody has opened it — not that there was
 * nothing to do.
 */
const STALE_DAYS = 7;

/** "4 days ago" / "today" / "never" — the last time anyone verified anything here. */
function staleLabel(days: number | null): string {
  if (days === null) return 'never';
  if (days <= 0) return 'today';
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * One row per dealer: where each outlet stands, and — the question this page
 * exists to answer since ADR 0011 — how long since anybody at MDG looked at it.
 *
 * The escalation columns are gone with the escalation machinery. Under a
 * verified model the failure mode is no longer "this dealer is ignoring us"
 * (there is nothing left for them to ignore); it is "we have not got round to
 * this dealer", and that has no other alarm. Verifying happens in the work
 * queue — this is the overview that tells you which dealer to point it at.
 */
export function KavachDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useKavachDashboardQuery();

  const rows = data ?? [];
  // Only dealers with a real percentage can be "at risk". An unscored one is
  // not doing badly; nobody has looked at it, and the staleness badge is what
  // says so.
  const atRisk = rows.filter((r) => r.scored && r.overallPct < RISK_THRESHOLD).length;
  const stale = rows.filter(
    (r) => r.daysSinceLastVerified === null || r.daysSinceLastVerified >= STALE_DAYS,
  ).length;

  return (
    <div>
      <PageHeader
        // "Kavach" is the work queue's name in the nav; this screen is reached
        // from "Kavach standing", so the heading has to be the same words or
        // the admin cannot tell which of the two they landed on.
        title="Kavach standing"
        subtitle="Where each dealer stands, and how long since we last verified them."
        actions={
          rows.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge intent={atRisk > 0 ? 'danger' : 'success'} className="h-7 px-3">
                {atRisk > 0
                  ? `${atRisk} ${atRisk === 1 ? 'dealer' : 'dealers'} below ${RISK_THRESHOLD}%`
                  : `All dealers at or above ${RISK_THRESHOLD}%`}
              </Badge>
              {/* Ours, not theirs — and stated separately for exactly that reason. */}
              <Badge intent={stale > 0 ? 'warning' : 'success'} className="h-7 px-3">
                {stale > 0
                  ? `${stale} not verified by us in ${STALE_DAYS}+ days`
                  : 'Every dealer verified recently'}
              </Badge>
            </div>
          ) : null
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                {Array.from({ length: 18 }).map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            </div>
          ) : isError ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load Kavach dashboard"
              description={(error as Error).message}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck width={28} height={28} strokeWidth={1.75} />}
              title="No programmes yet"
              description="Initiate a Kavach programme from a dealer's detail page to start tracking their compliance health here."
            />
          ) : (
            <>
            {/* Desktop table (≥ md) */}
            <div className="hidden md:block">
            <Table>
              <THead>
                <TRow>
                  <TH>Dealer</TH>
                  <TH>Code</TH>
                  <TH>Operational</TH>
                  <TH className="text-right">Expired</TH>
                  <TH className="text-right">Expiring</TH>
                  <TH className="text-right">Never checked</TH>
                  <TH className="text-right">Needs review</TH>
                  <TH>Last verified by us</TH>
                  <TH>Messages</TH>
                </TRow>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TRow
                    key={r.programmeId}
                    clickable
                    onClick={() => navigate(`/dealers/${r.dealerId}?tab=kavach`)}
                  >
                    <TD className="font-medium">{dealerCodeLabel(r.dealerCode)}</TD>
                    <TD className="font-mono text-text-muted">
                      {r.dealerCode || '—'}
                    </TD>
                    <TD>
                      {r.scored ? (
                        <Badge intent={operationalIntent(r.overallPct)}>
                          {Math.round(r.overallPct)}%
                        </Badge>
                      ) : (
                        <span className="text-text-subtle">Not scored yet</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      {r.expiredCount > 0 ? (
                        <span className="font-medium text-danger">
                          {r.expiredCount}
                        </span>
                      ) : (
                        <span className="text-text-subtle">0</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      {r.expiringSoonCount > 0 ? (
                        <span className="font-medium text-warning">
                          {r.expiringSoonCount}
                        </span>
                      ) : (
                        <span className="text-text-subtle">0</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      {r.notYetVerifiedCount > 0 ? (
                        <span className="font-medium text-text">{r.notYetVerifiedCount}</span>
                      ) : (
                        <span className="text-text-subtle">0</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      {r.awaitingReviewCount > 0 ? (
                        <span className="font-medium text-brand">{r.awaitingReviewCount}</span>
                      ) : (
                        <span className="text-text-subtle">0</span>
                      )}
                    </TD>
                    <TD>
                      <Badge intent={stalenessIntent(r.daysSinceLastVerified, STALE_DAYS)}>
                        {staleLabel(r.daysSinceLastVerified)}
                      </Badge>
                    </TD>
                    <TD>
                      {r.dealerFacingEnabled ? (
                        <span className="text-text-muted">On</span>
                      ) : (
                        // Not a warning: off is the correct state until somebody
                        // has actually been verifying this dealer's tasks.
                        <span className="text-text-subtle">Off</span>
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
              cards={rows.map((r) => ({
                key: r.programmeId,
                onClick: () => navigate(`/dealers/${r.dealerId}?tab=kavach`),
                primary: (
                  <span className="block truncate font-medium text-text">
                    {dealerCodeLabel(r.dealerCode)}
                  </span>
                ),
                primaryRight: r.scored ? (
                  <Badge intent={operationalIntent(r.overallPct)}>
                    {Math.round(r.overallPct)}%
                  </Badge>
                ) : (
                  <span className="text-xs text-text-subtle">Not scored yet</span>
                ),
                secondary: (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono">{r.dealerCode || '—'}</span>
                    <Badge intent={stalenessIntent(r.daysSinceLastVerified, STALE_DAYS)}>
                      {staleLabel(r.daysSinceLastVerified)}
                    </Badge>
                    {r.dealerFacingEnabled ? null : (
                      <span className="text-text-subtle">Messages off</span>
                    )}
                  </span>
                ),
                meta: (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={r.expiredCount > 0 ? 'text-danger' : undefined}>
                      Expired {r.expiredCount}
                    </span>
                    <span
                      className={r.expiringSoonCount > 0 ? 'text-warning' : undefined}
                    >
                      · Expiring {r.expiringSoonCount}
                    </span>
                    <span>· Never checked {r.notYetVerifiedCount}</span>
                    <span className={r.awaitingReviewCount > 0 ? 'text-brand' : undefined}>
                      · Needs review {r.awaitingReviewCount}
                    </span>
                    <span>· {formatDateTime(r.lastEvaluatedAt)}</span>
                  </span>
                ),
              }))}
            />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
