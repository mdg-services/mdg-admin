import { Eye, TriangleAlert } from 'lucide-react';

import { Badge, Button, Card, CardContent, DataList, EmptyState } from '@/components/ui';
import { istStamp } from '@/lib/intake';
import { visitLine } from '@/lib/leads';
import type { LeadViewerList, LeadViewerRow } from '@dk/shared';

/**
 * The "Unknown viewers" tab: people who opened the full film without a personal
 * link in the last 30 days. They are counted and listed so the team can see the
 * film is being watched, and never followed up: the film page is anonymous (it
 * carries no name, phone number or account, and the privacy page says so), so
 * there is nobody to ring. Watching alone does not make anybody a lead either
 * (since 29 Oct 2026 a lead is somebody who wrote to us). The line at the top
 * says both, so a reader does not look for a button that is not there.
 */
export function ViewersList({
  list,
  loading,
  failed,
  now,
  onRetry,
}: {
  list: LeadViewerList | undefined;
  loading: boolean;
  failed: boolean;
  now: number;
  onRetry: () => void;
}) {
  const items = list?.items ?? [];
  const cutShort = list && list.total > items.length;
  return (
    <>
      <p className="mb-3 text-sm text-text-muted">
        These people opened the full film without a personal link, so we cannot tell who they are
        and cannot contact them. Watching alone does not make anybody a lead: a lead is somebody who
        wrote to us.
      </p>
      {cutShort ? (
        <p className="mb-3 text-xs text-text-subtle">
          Showing the newest {items.length.toLocaleString('en-IN')} of{' '}
          {list.total.toLocaleString('en-IN')} from the last {list.days} days.
        </p>
      ) : null}
      <Card>
        <CardContent padding="none">
          <DataList<LeadViewerRow>
            rows={items}
            rowKey={(v) => v.id}
            loading={loading}
            cardVariant="rows"
            empty={
              failed ? (
                <EmptyState
                  icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
                  title="Could not load the viewers"
                  description="This does not mean there are none. Check the connection and try again."
                  cta={
                    <Button size="sm" variant="secondary" onClick={onRetry}>
                      Try again
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<Eye width={24} height={24} strokeWidth={1.75} />}
                  title="No unknown viewers"
                  description={`Nobody has opened the full film without a personal link in the last ${list?.days ?? 30} days.`}
                />
              )
            }
            minWidth="40rem"
            columns={[
              {
                id: 'when',
                header: 'Opened',
                mobile: 'primary',
                cell: (v) => (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-medium text-text">{istStamp(v.at, now)}</span>
                    {v.returning ? <Badge intent="info">Came back</Badge> : null}
                  </div>
                ),
              },
              {
                id: 'watched',
                header: 'Watched',
                mobile: 'secondary',
                cell: (v) => <span className="text-sm text-text">{visitLine(v)}</span>,
              },
              {
                id: 'where',
                header: 'From',
                mobile: 'meta',
                cell: (v) => (
                  <span className="text-sm text-text-muted md:text-text">
                    {[v.city, v.device].filter(Boolean).join(' · ') || 'Not known'}
                  </span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </>
  );
}
