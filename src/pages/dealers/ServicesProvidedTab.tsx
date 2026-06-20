import { ClipboardList } from 'lucide-react';

import {
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  EmptyState,
  Skeleton,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  Table,
} from '@/components/ui';
import { useServiceLogs } from '@/hooks/api/useServiceLogs';
import { formatDateTime } from '@/lib/format';
import type { Dealer } from '@dk/shared';

interface Props {
  dealer: Dealer;
}

export function ServicesProvidedTab({ dealer }: Props) {
  const { data: logs, isLoading } = useServiceLogs(dealer.id);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Services provided</CardTitle>
          <CardSubtitle>
            History of services delivered for this dealer, logged when requests
            are resolved.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !logs || logs.length === 0 ? (
          <EmptyState
            icon={<ClipboardList width={28} height={28} strokeWidth={1.5} />}
            title="No services logged yet"
            description="When you resolve a dealer request, the service you provided is recorded here."
          />
        ) : (
          <Table>
            <THead>
              <TRow>
                <TH>Service</TH>
                <TH>Notes</TH>
                <TH>For</TH>
                <TH>Provided by</TH>
                <TH>When</TH>
              </TRow>
            </THead>
            <TBody>
              {logs.map((log) => (
                <TRow key={log.id}>
                  <TD className="font-medium">{log.serviceName}</TD>
                  <TD className="max-w-xs">
                    <span className="line-clamp-2 text-text-muted">
                      {log.notes}
                    </span>
                  </TD>
                  <TD>{log.memberName ?? '—'}</TD>
                  <TD>{log.providedByName ?? '—'}</TD>
                  <TD className="whitespace-nowrap text-text-muted">
                    {formatDateTime(log.providedAt)}
                  </TD>
                </TRow>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
