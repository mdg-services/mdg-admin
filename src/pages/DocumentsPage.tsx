import {
  AlertCircle,
  CalendarClock,
  CalendarX2,
  FileCheck2,
  FileUp,
  HelpCircle,
} from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Button,
  Callout,
  Card,
  CardContent,
  EmptyState,
  FilterBar,
  HowThisWorks,
  Label,
  Select,
  Skeleton,
} from '@/components/ui';
import { useDealersQuery } from '@/hooks/api/useDealers';
import { useDocumentAskRowsQuery } from '@/hooks/api/useDocumentAsks';
import { useDocumentKindCatalog } from '@/hooks/api/useDocumentKinds';
import { ApiError } from '@/lib/api';
import {
  compareDealerCodes,
  compareDocumentValidityRows,
  dealerCodeLabel,
  documentValidityTally,
} from '@dk/shared';

import { StatTile, StatTileRow, StatTileSkeletons } from './dataVault/StatTile';
import { DocumentValidityDrawer } from './documents/DocumentValidityDrawer';
import { DocumentValidityList } from './documents/DocumentValidityList';
import {
  DEFAULT_EXPIRING_WITHIN_DAYS,
  expiringWithinParam,
  EXPIRING_WITHIN_CHOICES,
  isValidityOrdered,
  matchesValidityScope,
  resolveExpiringWithin,
  resolveValidityFilter,
  rowFromValidityAsk,
  validityListCaveat,
  validityQuery,
  VALIDITY_FILTERS,
  type DocumentValidityRow,
  type ValidityFilter,
} from './documents/format';
import { ValidityLegend } from './documents/ValidityPill';

/**
 * WHICH PAPERS ACROSS THE ESTATE ARE RUNNING OUT.
 *
 * THIS IS NOT THE VAULT'S DOCUMENTS DATASET, AND THE SPLIT IS THE POINT
 * ---------------------------------------------------------------------
 * `/data-vault?dataset=documents` answers *whose move is it* — who has not sent
 * what, and what is sitting in MDG's review queue. That screen's header argues
 * against a new route, and it is right about its own question: a second surface
 * asking "has this paper arrived?" would be two places that can disagree about
 * whether it has.
 *
 * This screen asks a different question, about a different set of rows. Every
 * row here is a paper MDG ALREADY HOLDS — accepted, closed, nobody's turn — and
 * the only thing left to know about it is when it stops being good. On the Vault
 * screen those rows are the ones with nothing to do; here they are the whole
 * list. There is no state on which both screens have an opinion: the Vault stops
 * at `ACCEPTED` and this starts there.
 *
 * IT OPENS ON A HORIZON, AND THAT IS WHAT PUTS IT IN THE RIGHT ORDER
 * -----------------------------------------------------------------
 * `GET /v1/asks` sorts `periodKey desc` by default, and every paper that carries
 * a validity is `periodKind: 'NONE'` — its period key is the EMPTY STRING, which
 * sorts LAST. An estate a year into a daily register page therefore has
 * thousands of accepted rows ahead of the first Fire NOC. The route flips to
 * `validUntil` ascending the moment a query carries `expiringWithinDays` or
 * `validityState`, so this screen always sends one of the two: a bare
 * `/documents` opens on a one-year horizon, which is both the useful default and
 * the thing that makes the first page the most urgent rows rather than the most
 * recent ones. See `DEFAULT_EXPIRING_WITHIN_DAYS`.
 *
 * A SHORT PAGE IS NOT THE END OF THE LIST. The `valid` / `expiring` boundary is
 * each row's own first ladder step, so the route narrows to "not yet lapsed" in
 * the query and filters the exact band on the rows AFTER paging — a request for
 * 200 can come back with nine while `nextCursor` still points at more. So the
 * Load more button follows `hasNextPage` and never a row count, and the caveat
 * line says so out loud.
 */

/** One request's worth. The route's own maximum. */
const PAGE_SIZE = 200;

/** The kind option meaning "do not narrow by kind at all". */
const KIND_ANY = 'any';

interface DocumentsScope {
  /** A catalog code, or {@link KIND_ANY}. */
  kind: string;
  dealerId: string | null;
  validity: ValidityFilter;
  within: number | null;
  /** `askId` of the open drawer, or null. */
  openKey: string | null;
}

function useDocumentsScope(params: URLSearchParams): DocumentsScope {
  return {
    kind: params.get('kind') ?? KIND_ANY,
    dealerId: params.get('dealer'),
    validity: resolveValidityFilter(params.get('validity')),
    within: resolveExpiringWithin(params.get('within')),
    openKey: params.get('open'),
  };
}

export function DocumentsPage() {
  const [search, setSearch] = useSearchParams();
  const scope = useDocumentsScope(search);

  /**
   * Merge-patch the query string, replacing rather than pushing.
   *
   * Every view on this page is a link somebody can send a colleague, which is
   * the same promise the Data Vault makes — and the same reason a filter tweak
   * must not become a Back step. Written as a functional update so two controls
   * changing in the same tick cannot drop each other's change.
   */
  const patchParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      setSearch(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearch],
  );

  const { kinds, isFallback } = useDocumentKindCatalog();
  const dealersQ = useDealersQuery({ pageSize: 200 });

  const dealers = React.useMemo(() => {
    const items = dealersQ.data?.items ?? [];
    return items
      .filter((d) => !d.archivedAt)
      .slice()
      .sort((a, b) => compareDealerCodes(a.code, b.code));
  }, [dealersQ.data]);

  /**
   * ONE PAGED QUERY. The facet and the horizon become query parameters through
   * `validityQuery`, which owns the rule that the two do not compose — the route
   * assigns `filter.validUntil` rather than merging it, so a named state
   * replaces any range a horizon set.
   */
  const papersQ = useDocumentAskRowsQuery({
    state: 'ACCEPTED',
    ...(scope.kind !== KIND_ANY ? { kindCode: scope.kind } : {}),
    ...(scope.dealerId ? { dealerId: scope.dealerId } : {}),
    ...validityQuery(scope.validity, scope.within),
    limit: PAGE_SIZE,
  });

  const loading = papersQ.isLoading;
  const failed = papersQ.isError ? papersQ.error : null;
  // The SERVER'S own answer, never a guess from the row count — which on this
  // route is routinely short of the limit. See the file header.
  const hasMore = papersQ.hasNextPage;

  const rows = React.useMemo<DocumentValidityRow[]>(
    () => (papersQ.data?.pages ?? []).flatMap((page) => page.rows).map(rowFromValidityAsk),
    [papersQ.data],
  );

  const visible = React.useMemo(
    () =>
      rows
        // Belt-and-braces over a page the route already narrowed — except for
        // the two cases where this is the ONLY authority: the `undated` facet,
        // which has no query behind it, and a state facet combined with a
        // horizon, which the route cannot express together. See
        // `matchesValidityScope`.
        .filter((r) => matchesValidityScope(scope.validity, scope.within, r))
        // Most urgent first: expired, then running out soonest, then in force,
        // then the undated ones. The shared comparator, so this page and the
        // dealer's own tab cannot come to disagree about what "urgent" means.
        .sort(compareDocumentValidityRows),
    [rows, scope.validity, scope.within],
  );

  /**
   * The counters, over everything LOADED rather than over what the facet leaves.
   *
   * Built from the same rows the table draws and never from a second query, so a
   * tile can never disagree with the list beneath it — and the four always add
   * up to `rows.length`, which is the invariant that makes them worth a glance.
   *
   * Counting the post-facet list instead would make them a tautology: filter to
   * "Expired" and three of the four tiles read zero, which says nothing anybody
   * came here to learn. The caption under the table states both numbers so the
   * relationship is never in doubt. Same decision, same reason, as the Vault's
   * Documents shelf.
   */
  const tally = React.useMemo(() => documentValidityTally(rows), [rows]);

  const caveat = validityListCaveat({
    shown: rows.length,
    hasMore,
    // Whether the CLIENT is hiding loaded rows, not whether a filter is set. The
    // screen opens with a one-year window already applied, so "a filter is set"
    // is true on a bare /documents and would print the stronger warning on every
    // ordinary visit — which is how a caveat stops being read.
    filtered: visible.length !== rows.length,
  });

  const openRow = scope.openKey ? visible.find((r) => r.askId === scope.openKey) ?? null : null;

  const activeFilters =
    (scope.kind !== KIND_ANY ? 1 : 0) +
    (scope.dealerId ? 1 : 0) +
    (scope.validity !== 'all' ? 1 : 0) +
    (scope.within !== DEFAULT_EXPIRING_WITHIN_DAYS ? 1 : 0);

  const scopeLine =
    scope.kind === KIND_ANY
      ? 'Every paper'
      : (kinds.find((k) => k.code === scope.kind)?.titleEn ?? scope.kind);

  // Period-ordered means the licences sort LAST, which is the one arrangement
  // this screen must never present without saying so.
  const periodOrdered = !isValidityOrdered(scope.validity, scope.within);

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Every paper MDG holds for every outlet, and when each one stops being good. Requesting a paper and reviewing what came in live in the Data Vault's Documents shelf."
        actions={<HowThisWorks surface="admin-documents" label="Documents" />}
      />

      {loading ? (
        <StatTileSkeletons />
      ) : failed ? null : (
        // The Vault's own tile, shared rather than copied: a fifth
        // implementation of a labelled number is a fifth thing to keep in step.
        <StatTileRow>
          <StatTile
            label="Expired"
            value={tally.expired}
            tone="danger"
            icon={<CalendarX2 width={16} height={16} strokeWidth={1.75} />}
            hint={tally.expired > 0 ? 'Past its date. This should be zero.' : 'Nothing has lapsed'}
          />
          <StatTile
            label="Running out"
            value={tally.expiring}
            tone="warning"
            icon={<CalendarClock width={16} height={16} strokeWidth={1.75} />}
            hint={
              tally.expiring > 0
                ? 'Inside the reminder window — the dealer is being chased'
                : 'Nothing due yet'
            }
          />
          <StatTile
            label="In force"
            value={tally.valid}
            tone="success"
            icon={<FileCheck2 width={16} height={16} strokeWidth={1.75} />}
            hint={scopeLine}
          />
          <StatTile
            label="No date"
            value={tally.undated}
            tone="neutral"
            icon={<HelpCircle width={16} height={16} strokeWidth={1.75} />}
            // Named rather than hidden. "Expired 0, running out 0" reads as
            // "everything is fine" when the real answer can be "nothing has a
            // date on it" — and a date we cannot read counts here too, because
            // the verdict fails closed rather than passing.
            //
            // But a zero only MEANS none exist when the query could have
            // returned them. Both server-side validity filters require a date,
            // so under any window or state facet this tile is counting a set the
            // request excluded — and a hint saying "every paper carries a date"
            // there would be the screen vouching for rows it never looked at.
            hint={
              !periodOrdered
                ? 'Not counted under a date window'
                : tally.undated > 0
                  ? 'On file, but nothing says when it runs out'
                  : 'Every paper carries a date'
            }
          />
        </StatTileRow>
      )}

      <FilterBar
        className="mt-3 md:mt-4"
        columnsAtMd={4}
        activeCount={activeFilters}
        onClear={() =>
          patchParams({ kind: null, dealer: null, validity: null, within: null, open: null })
        }
      >
        <div>
          <Label htmlFor="doc-kind">Which paper</Label>
          <Select
            id="doc-kind"
            value={scope.kind}
            onChange={(e) => patchParams({ kind: e.target.value, open: null })}
          >
            <option value={KIND_ANY}>Every paper</option>
            {kinds.map((k) => (
              <option key={k.code} value={k.code}>
                {k.titleEn}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="doc-dealer">Dealer</Label>
          <Select
            id="doc-dealer"
            value={scope.dealerId ?? ''}
            onChange={(e) => patchParams({ dealer: e.target.value || null, open: null })}
          >
            <option value="">Every dealer</option>
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {dealerCodeLabel(d.code)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="doc-validity">Validity</Label>
          <Select
            id="doc-validity"
            value={scope.validity}
            onChange={(e) => patchParams({ validity: e.target.value, open: null })}
          >
            {VALIDITY_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="doc-within">Runs out</Label>
          <Select
            id="doc-within"
            value={scope.within === null ? 'any' : String(scope.within)}
            onChange={(e) =>
              patchParams({
                // `?within=` is absent for the default year and the literal
                // "any" for no horizon, so a bare /documents and a deliberately
                // widened one are two different links rather than the same one.
                within: expiringWithinParam(
                  e.target.value === 'any' ? null : Number(e.target.value),
                ),
                open: null,
              })
            }
          >
            {EXPIRING_WITHIN_CHOICES.map((c) => (
              <option key={c.label} value={c.value === null ? 'any' : String(c.value)}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      <Card className="mt-3 md:mt-4">
        <CardContent padding="none" className="md:p-4">
          {isFallback ? (
            <div className="p-3 md:px-0 md:pt-0">
              <Callout intent="info">
                The live catalog could not be read, so the paper list is the shipped one. A kind
                an admin added later will not appear in the filter.
              </Callout>
            </div>
          ) : null}

          {periodOrdered ? (
            <div className="p-3 md:px-0 md:pt-0">
              <Callout intent="warning">
                {scope.validity === 'undated'
                  ? 'Papers with no date cannot be asked for directly, so this reads the whole accepted list newest-period-first and picks them out — the ones you want may be several pages down.'
                  : 'With no date window this list is ordered by the period each paper belongs to, and a paper that runs out has no period, so those sort last. Pick a window to put the most urgent first.'}
              </Callout>
            </div>
          ) : null}

          {loading ? (
            <div className="grid gap-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : failed ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load the papers on file"
              description={
                failed instanceof ApiError ? failed.message : 'Please try again.'
              }
            />
          ) : (
            <DocumentValidityList
              rows={visible}
              onOpen={(row) => patchParams({ open: row.askId })}
              empty={
                rows.length === 0 ? (
                  <EmptyState
                    icon={<FileUp width={28} height={28} strokeWidth={1.75} />}
                    title="No paper is on file yet"
                    description="A paper appears here once MDG accepts it — from the dealer, or filed on their behalf from the outlet's own Documents tab."
                  />
                ) : (
                  <EmptyState
                    icon={<CalendarClock width={28} height={28} strokeWidth={1.75} />}
                    title="Nothing matches this filter"
                    // The most dangerous sentence on this screen, so it is the
                    // one that must not overstate: "nothing matches" over a
                    // capped list looks exactly like "nothing is expiring", and
                    // an admin acts on the second.
                    description={
                      caveat || 'Try a different validity, or widen the date window.'
                    }
                  />
                )
              }
            />
          )}

          {/* WHAT IS NOT ON SCREEN, SAID OUT LOUD, WITH THE BUTTON THAT FIXES
              IT. Drawn whenever the server says there are more rows —
              INCLUDING over an empty result, which on this route is the case
              that most needs it: the band filter runs after paging, so a page
              can legitimately come back holding nothing at all with hundreds of
              rows behind it. `isFetchingNextPage` disables the button rather
              than hiding it, because a control that vanishes mid-press reads as
              a click that did nothing. */}
          {hasMore ? (
            <div className="flex flex-col items-start gap-2 border-t border-border p-3 md:flex-row md:items-center md:justify-between md:px-0 md:pb-0">
              {visible.length > 0 ? (
                <p className="text-xs text-text-subtle">{caveat}</p>
              ) : null}
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

          <div className="border-t border-border p-3 md:border-0 md:px-0 md:pb-0 md:pt-4">
            <ValidityLegend />
            <p className="mt-2 text-xs text-text-subtle">
              {rows.length} paper{rows.length === 1 ? '' : 's'} loaded
              {visible.length !== rows.length
                ? `, ${visible.length} shown by this filter`
                : ''}
              .
            </p>
          </div>
        </CardContent>
      </Card>

      <DocumentValidityDrawer
        open={Boolean(openRow)}
        row={openRow}
        onClose={() => patchParams({ open: null })}
      />
    </div>
  );
}
