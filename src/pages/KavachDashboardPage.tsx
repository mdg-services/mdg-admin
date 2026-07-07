import { AlertCircle, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
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
import { operationalIntent, priorityIntent } from '@/lib/kavach';

const RISK_THRESHOLD = 80;

export function KavachDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useKavachDashboardQuery();

  const rows = data ?? [];
  const atRisk = rows.filter((r) => r.overallPct < RISK_THRESHOLD).length;

  return (
    <div>
      <PageHeader
        title="Kavach"
        subtitle="Recurring assessment & compliance health across your book of dealers."
        actions={
          rows.length > 0 ? (
            <Badge
              intent={atRisk > 0 ? 'danger' : 'success'}
              className="h-7 px-3"
            >
              {atRisk > 0
                ? `${atRisk} ${atRisk === 1 ? 'dealer' : 'dealers'} below ${RISK_THRESHOLD}%`
                : `All dealers at or above ${RISK_THRESHOLD}%`}
            </Badge>
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
            <Table>
              <THead>
                <TRow>
                  <TH>Dealer</TH>
                  <TH>Code</TH>
                  <TH>Operational</TH>
                  <TH className="text-right">Expired</TH>
                  <TH className="text-right">Expiring</TH>
                  <TH className="text-right">Escalated</TH>
                  <TH>Worst priority</TH>
                  <TH>Last evaluated</TH>
                </TRow>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TRow
                    key={r.programmeId}
                    clickable
                    onClick={() => navigate(`/dealers/${r.dealerId}?tab=kavach`)}
                  >
                    <TD className="font-medium">{r.dealerName}</TD>
                    <TD className="font-mono text-text-muted">
                      {r.dealerCode || '—'}
                    </TD>
                    <TD>
                      <Badge intent={operationalIntent(r.overallPct)}>
                        {Math.round(r.overallPct)}%
                      </Badge>
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
                      {r.escalatedCount > 0 ? (
                        <span className="font-medium text-danger">
                          {r.escalatedCount}
                        </span>
                      ) : (
                        <span className="text-text-subtle">0</span>
                      )}
                    </TD>
                    <TD>
                      {r.worstPriority ? (
                        <Badge intent={priorityIntent(r.worstPriority)}>
                          {r.worstPriority}
                        </Badge>
                      ) : (
                        <span className="text-text-subtle">—</span>
                      )}
                    </TD>
                    <TD className="text-text-muted">
                      {formatDateTime(r.lastEvaluatedAt)}
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
