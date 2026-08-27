import { ClipboardList } from 'lucide-react';

import {
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  DataList,
  EmptyState,
  Skeleton,
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
      {/* The body is the delivery list, so it runs to the card's own edges;
          the skeleton and the empty state bring their own padding. */}
      <CardContent padding="none" className="md:p-4">
        {isLoading ? (
          <div className="grid gap-2 p-3 md:p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          /*
           * This was the one list in the dealer area that never got a phone
           * shape: a bare five-column <Table> whose minimum width is ~810px
           * inside a ~300px card, so the reader saw two columns at a time and
           * could never line a row up with its heading. `DataList` derives both
           * shapes from one column set — and below md each delivery becomes a
           * card with the service as its title, the date beside it, the note in
           * full underneath, and For / Provided by as labelled rows.
           *
           * The column array stays in the desktop order (Service, Notes, For,
           * Provided by, When) because that is what the <Table> renders; the
           * `mobile` slot on each column is what moves the date up beside the
           * title on the card, and it is read independently of the order.
           *
           * The rows carry no actions, so the card is plain markup rather than
           * a tap target.
           */
          <DataList
            rows={logs ?? []}
            rowKey={(log) => log.id}
            // Flush rows below md: a bordered row card inside a bordered card
            // inside the page gutter put the service name 46px in from a 360px
            // screen. At md this is the same table it has always been.
            cardVariant="rows"
            columns={[
              {
                id: 'service',
                header: 'Service',
                cell: (log) => log.serviceName,
                mobile: 'primary',
                tdClassName: 'font-medium',
              },
              {
                id: 'notes',
                header: 'Notes',
                // Clamped to two lines in the desktop cell, which is one column
                // in a row of columns; whole on the card, which has nothing to
                // line up with. `md:` is enough to say that on its own here —
                // `DataList` mounts exactly one branch, so the clamp can only
                // ever reach the table and `max-w-xs` (a 320px cap, wider than
                // the whole phone viewport) never reaches the card.
                cell: (log) => (
                  <span className="break-words text-text-muted md:line-clamp-2">
                    {log.notes}
                  </span>
                ),
                mobile: 'secondary',
                tdClassName: 'max-w-xs',
              },
              {
                id: 'for',
                header: 'For',
                cell: (log) => log.memberName ?? '—',
              },
              {
                id: 'by',
                header: 'Provided by',
                cell: (log) => log.providedByName ?? '—',
                mobileLabel: 'By',
              },
              {
                id: 'when',
                header: 'When',
                cell: (log) => formatDateTime(log.providedAt),
                mobile: 'primaryRight',
                tdClassName: 'whitespace-nowrap text-text-muted',
              },
            ]}
            empty={
              <EmptyState
                icon={<ClipboardList width={28} height={28} strokeWidth={1.5} />}
                title="No services logged yet"
                description="When you resolve a dealer request, the service you provided is recorded here."
              />
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
