import { ExternalLink } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui';
import { GAP_DAYS, gapQuestion, gapSince, mergeGapTickets } from '@/features/inbox/desk';
import { useGapTicketsQuery } from '@/hooks/api/useTickets';
import { ticketThreadHref, whenLabel } from '@/pages/tickets/format';
import { dealerCodeLabel } from '@dk/shared';

/** How many questions show before "Show all". A week's gaps are a short list; this keeps a bad week from burying the answers below it. */
const SHOWN = 5;

/**
 * "What the AI could not answer — last 7 days": the questions that were not in
 * the briefing, so the person who improves it has the week's list in one place.
 *
 * It reads the tickets whose trigger is the AI's own gap (`kind=gap`: the
 * records MDG holds did not answer it), raised in the last week, closed or not —
 * a ticket somebody has already closed was still a question the AI could not
 * answer, and that is what this list is for. Each row is the dealer's own words,
 * the outlet, the day, and a link to the thread; nothing here changes a ticket.
 *
 * The week is fixed when the page opens (to the minute), so the request does not
 * change under a reader who leaves it open.
 */
export function GapTickets() {
  const [raisedAfter] = React.useState(() => gapSince(new Date()));
  const { open, closed } = useGapTicketsQuery(raisedAfter);
  const [showAll, setShowAll] = React.useState(false);

  const rows = React.useMemo(
    () => mergeGapTickets(open.data?.items ?? [], closed.data?.items ?? []),
    [open.data, closed.data],
  );
  const loading = open.isLoading || closed.isLoading;
  // No list at all is not an empty one: "nothing the AI could not answer" under
  // a failed request would be the one line this section must never say wrongly.
  const failed = !loading && ((open.isError && !open.data) || (closed.isError && !closed.data));
  const shown = showAll ? rows : rows.slice(0, SHOWN);

  return (
    <Card>
      <CardHeader
        align="center"
        action={rows.length > 0 ? <Badge intent="warning">{rows.length}</Badge> : undefined}
      >
        <CardTitle className="text-sm">
          What the AI could not answer — last {GAP_DAYS} days
        </CardTitle>
      </CardHeader>
      <CardContent padding="none">
        {loading ? (
          <div className="grid gap-2 p-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : failed ? (
          <div className="flex flex-wrap items-center gap-2 px-3 py-3 md:px-4">
            <p className="min-w-0 flex-1 basis-48 text-sm text-text-muted">
              The list could not be loaded. This does not mean there is nothing on it.
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void open.refetch();
                void closed.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="px-3 py-3 text-sm text-text-muted md:px-4">
            Nothing the AI could not answer in the last {GAP_DAYS} days.
          </p>
        ) : (
          <>
            <ul>
              {shown.map((t) => (
                <li key={t.id} className="border-b border-border px-3 py-2.5 last:border-b-0 md:px-4">
                  <p className="line-clamp-3 min-w-0 break-words text-sm text-text" title={gapQuestion(t)}>
                    {gapQuestion(t)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-subtle">
                    <span className="font-mono font-medium text-text-muted">
                      {dealerCodeLabel(t.dealerCode)}
                    </span>
                    <span>{whenLabel(t.raisedAt)}</span>
                    {t.state === 'RESOLVED' ? <span>Closed</span> : null}
                    <Link
                      to={ticketThreadHref(t)}
                      className="ml-auto inline-flex min-h-11 items-center gap-1 font-medium text-brand hover:underline md:min-h-0"
                    >
                      Open the thread
                      <ExternalLink width={12} height={12} strokeWidth={1.75} aria-hidden />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            {rows.length > SHOWN ? (
              <div className="border-t border-border px-3 py-2 md:px-4">
                <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Show fewer' : `Show all ${rows.length}`}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
