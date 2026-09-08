import { AlertCircle, CalendarClock, CalendarX2, FileCheck2, FilePlus2, HelpCircle } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Callout,
  Card,
  CardContent,
  EmptyState,
  HowThisWorks,
  SegmentedControl,
  Skeleton,
} from '@/components/ui';
import { useDocumentAskRowsQuery } from '@/hooks/api/useDocumentAsks';
import { ApiError } from '@/lib/api';
import {
  compareDocumentValidityRows,
  dealerCodeLabel,
  documentValidityTally,
  type Dealer,
} from '@dk/shared';

import { StatTile, StatTileRow, StatTileSkeletons } from '../dataVault/StatTile';
import { DocumentValidityDrawer } from '../documents/DocumentValidityDrawer';
import { DocumentValidityList } from '../documents/DocumentValidityList';
import { FileForDealerDialog } from '../documents/FileForDealerDialog';
import {
  DEFAULT_EXPIRING_WITHIN_DAYS,
  rowFromValidityAsk,
  validityListCaveat,
  type DocumentValidityRow,
} from '../documents/format';
import { ValidityLegend } from '../documents/ValidityPill';

/**
 * ONE OUTLET'S PAPERS, AND WHEN EACH ONE RUNS OUT.
 *
 * The estate register (`/documents`) read down to a single dealer, drawn from
 * the same rows through the same list component — so the two cannot come to
 * disagree about what is on file or which paper is most urgent. The only thing
 * this surface adds is the verb: **file a paper for this dealer**, which is
 * where an admin lands after somebody hands them a Fire NOC at an outlet visit.
 *
 * IT SHOWS WHAT MDG HOLDS, NOT WHAT MDG IS WAITING FOR. Chasing an outstanding
 * request is the Data Vault's Documents shelf — that screen is about whose move
 * it is, and this one starts where it stops, at `ACCEPTED`. Putting both here
 * would put "we are still waiting for this" and "this expires on Tuesday" in one
 * list under one heading, which is two jobs and two different next actions.
 *
 * THE DEFAULT VIEW IS A DATE WINDOW, NOT A LIST OF KINDS. `GET /v1/asks` sorts
 * by `validUntil` ascending only when the query carries `expiringWithinDays` or
 * `validityState`, and by period descending otherwise — where every paper that
 * runs out sorts LAST, because its period key is the empty string. An outlet a
 * year into a daily register page therefore has hundreds of rows ahead of its
 * Fire NOC. Sending a one-year window is what puts the licences first.
 *
 * The window is capped at a year by the route's own schema, so a certificate
 * good until 2029 is not in the default view — which is the right trade for a
 * screen about what is running out, and the reason "Everything on file" is the
 * other half of the switch rather than an afterthought.
 */

type Scope = 'tracked' | 'all';

export function DealerDocumentsTab({ dealer }: { dealer: Dealer }) {
  const [scope, setScope] = React.useState<Scope>('tracked');
  const [fileOpen, setFileOpen] = React.useState(false);
  const [openRow, setOpenRow] = React.useState<DocumentValidityRow | null>(null);

  const papersQ = useDocumentAskRowsQuery({
    state: 'ACCEPTED',
    dealerId: dealer.id,
    // The window is what flips the route into validity order — see the header.
    ...(scope === 'tracked' ? { expiringWithinDays: DEFAULT_EXPIRING_WITHIN_DAYS } : {}),
    limit: 200,
  });

  const rows = React.useMemo(
    () =>
      (papersQ.data?.pages ?? [])
        .flatMap((page) => page.rows)
        .map(rowFromValidityAsk)
        .sort(compareDocumentValidityRows),
    [papersQ.data],
  );
  // Counted from the rows the table draws, never from a second query, so a tile
  // can never disagree with the list under it.
  const tally = React.useMemo(() => documentValidityTally(rows), [rows]);

  // The drawer holds a row by value, so a refetch after a save would leave it
  // showing the old date. Re-resolved from the live list on every render.
  const live = openRow ? rows.find((r) => r.askId === openRow.askId) ?? null : null;

  const caveat = validityListCaveat({
    shown: rows.length,
    hasMore: papersQ.hasNextPage,
    filtered: false,
  });

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 md:mb-4 md:flex-row md:items-center md:justify-between">
        <SegmentedControl
          aria-label="Which papers to show"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'tracked', label: 'Running out within a year' },
            { value: 'all', label: 'Everything on file' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="w-full md:w-auto"
            onClick={() => setFileOpen(true)}
            leftIcon={<FilePlus2 width={16} height={16} strokeWidth={1.75} />}
          >
            File a paper
          </Button>
          <HowThisWorks
            surface="admin-dealer-documents"
            label="A dealer's papers"
            variant="icon"
          />
        </div>
      </div>

      {papersQ.isLoading ? (
        <StatTileSkeletons />
      ) : papersQ.isError ? null : (
        <StatTileRow>
          <StatTile
            label="Expired"
            value={tally.expired}
            tone="danger"
            icon={<CalendarX2 width={16} height={16} strokeWidth={1.75} />}
            hint={tally.expired > 0 ? 'Past its date' : 'Nothing has lapsed'}
          />
          <StatTile
            label="Running out"
            value={tally.expiring}
            tone="warning"
            icon={<CalendarClock width={16} height={16} strokeWidth={1.75} />}
            hint={tally.expiring > 0 ? 'They are being chased' : 'Nothing due yet'}
          />
          <StatTile
            label="In force"
            value={tally.valid}
            tone="success"
            icon={<FileCheck2 width={16} height={16} strokeWidth={1.75} />}
            hint="On file and still good"
          />
          <StatTile
            label="No date"
            value={tally.undated}
            tone="neutral"
            icon={<HelpCircle width={16} height={16} strokeWidth={1.75} />}
            hint={
              // In the windowed view the query itself excludes undated papers,
              // so a zero here means "not asked for", not "none exist" — and a
              // tile that reads as the second would be the screen quietly
              // vouching for something it never looked at.
              scope === 'tracked'
                ? 'Not counted here — switch to Everything on file'
                : tally.undated > 0
                  ? 'Nothing says when these run out'
                  : 'Every paper carries a date'
            }
          />
        </StatTileRow>
      )}

      <Card className="mt-3 md:mt-4">
        <CardContent padding="none" className="md:p-4">
          {scope === 'all' ? (
            <div className="p-3 md:px-0 md:pt-0">
              <Callout intent="info">
                Everything MDG has accepted from this outlet, newest period first — which is
                also where a paper good for more than a year ahead will be found, since the
                other view is capped at a one-year window.
              </Callout>
            </div>
          ) : null}

          {papersQ.isLoading ? (
            <div className="grid gap-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : papersQ.isError ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load this outlet's papers"
              description={
                papersQ.error instanceof ApiError ? papersQ.error.message : 'Please try again.'
              }
            />
          ) : (
            <DocumentValidityList
              rows={rows}
              showDealer={false}
              onOpen={setOpenRow}
              empty={
                <EmptyState
                  icon={<FilePlus2 width={28} height={28} strokeWidth={1.75} />}
                  title={
                    scope === 'tracked'
                      ? 'Nothing runs out in the next year'
                      : 'Nothing is on file yet'
                  }
                  description={`Nothing has been accepted for ${dealerCodeLabel(
                    dealer.code,
                  )} yet. Ask for it from the Data Vault's Documents shelf, or file a paper MDG already holds.`}
                  cta={
                    <Button
                      size="sm"
                      onClick={() => setFileOpen(true)}
                      leftIcon={<FilePlus2 width={14} height={14} strokeWidth={1.75} />}
                    >
                      File a paper
                    </Button>
                  }
                />
              }
            />
          )}

          {/* Drawn even over an empty list: the route filters the exact validity
              band AFTER paging, so a page can come back holding nothing with
              hundreds of rows behind it. */}
          {papersQ.hasNextPage ? (
            <div className="flex flex-col items-start gap-2 border-t border-border p-3 md:flex-row md:items-center md:justify-between md:px-0 md:pb-0">
              <p className="text-xs text-text-subtle">{caveat}</p>
              <Button
                variant="secondary"
                size="sm"
                className="w-full md:w-auto"
                disabled={papersQ.isFetchingNextPage}
                onClick={() => void papersQ.fetchNextPage()}
              >
                {papersQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className="border-t border-border p-3 md:border-0 md:px-0 md:pb-0 md:pt-4">
              <ValidityLegend />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <DocumentValidityDrawer
        open={Boolean(live)}
        row={live}
        onClose={() => setOpenRow(null)}
      />

      <FileForDealerDialog
        open={fileOpen}
        onClose={() => setFileOpen(false)}
        dealerId={dealer.id}
        dealerCode={dealer.code ?? ''}
      />
    </div>
  );
}
