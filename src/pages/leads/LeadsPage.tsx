import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Search, Target, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { StatTile } from '@/components/charts';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Button,
  Card,
  CardContent,
  DataList,
  EmptyState,
  Input,
  Label,
  RefreshTool,
  Tabs,
} from '@/components/ui';
import { AddLeadButton } from '@/features/leads/AddLeadDialog';
import { HowFollowUpsWork } from '@/features/leads/HowFollowUpsWork';
import { LeadRowActions } from '@/features/leads/LeadActions';
import { LeadInterestCell, LeadStandsCell, LeadWhoCell } from '@/features/leads/LeadCells';
import { LeadDialogs } from '@/features/leads/LeadDialogs';
import { LeadDrawer } from '@/features/leads/LeadDrawer';
import { type LeadActionHandler, type LeadDialogState } from '@/features/leads/shared';
import { ViewersList } from '@/features/leads/ViewersList';
import {
  leadsRoot,
  useLeadCountsQuery,
  useLeadViewersQuery,
  useLeadsQuery,
} from '@/hooks/api/useLeads';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cutShortNote } from '@/lib/intake';
import {
  funnelSteps,
  idFromParam,
  viewFromParam,
  viewLabel,
  viewTotal,
} from '@/lib/leads';
import { LEAD_VIEWS, type LeadRow, type LeadView } from '@dk/shared';

/** How long the search box waits after the last key before it asks the server. */
const SEARCH_DEBOUNCE_MS = 350;

/**
 * How many rows are drawn at first. A busy week can have a few hundred open
 * leads, and every row carries a number, a bar, a note and two buttons: on a
 * cheap phone the first fifty come up at once and "Show more" brings the rest.
 */
const FIRST_ROWS = 50;

const NUMBER = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString('en-IN'));

/**
 * Everyone who wrote back to us on WhatsApp, asked for a call, or was added by
 * the team: what is going on with each, and what to do next
 * (docs/specs/leads.md). Watching the Dealer Kavach film does not make a lead;
 * it shows on the lead the person already is.

 *
 * A lead stays here until it says no, asks us to stop, or becomes a client: the
 * server works out when each one is due again from what we have done and what
 * they have done, so nobody is dropped. "To do" is the working tab: leads due
 * now or nobody has called, the coldest first. Where a lead stands is never set
 * by hand on this page; a person logs what they did and the clock moves.
 *
 * The tab, the search, and the open lead live in the address (`?view=`, `?q=`,
 * `?lead=`), so Back and a shared link land on the same screen, and the three
 * lead alerts open a lead directly (`/leads?lead=<id>`).
 *
 * The table carries what the team reads to decide whom to ring (how much of the
 * film they watched, what became of the invite, what was last said) so the
 * drawer is for acting, not for finding out. Clicking anywhere on a row opens
 * it. On desktop a row also has Log contact and a menu; on a phone the card is
 * one tap that opens the drawer, where every action is a button. The seven forms
 * the actions open are mounted once, here, and stack over the drawer.
 *
 * "Add lead" makes one by hand, for somebody who has not written to us; the new
 * lead's drawer opens as soon as it is made. (A person a WhatsApp campaign went
 * to is added from Message results or the WhatsApp inbox instead.)
 *
 * "Unknown viewers" are not leads: people who opened the film without a personal
 * link. They are listed so the team can see the film is watched, and never
 * followed up; a lead is somebody who wrote to us.
 */
export function LeadsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const view = viewFromParam(search.get('view'));
  const urlQ = search.get('q') ?? '';
  const openId = idFromParam(search.get('lead'));
  const [dialog, setDialog] = React.useState<LeadDialogState | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [shown, setShown] = React.useState(FIRST_ROWS);
  // The list decides its own shape from this too; the cells and the actions need
  // the answer once per page, not one listener per row.
  const isMd = useMediaQuery('(min-width: 768px)');

  // Due times and ages are relative ("Overdue 5 h"); keep them honest on a page left open all morning.
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  /**
   * Merge-patch the query string, replacing rather than pushing: a tab or search
   * tweak must not become a Back step. A functional update, so two changes in the
   * same tick cannot drop each other.
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

  // The search box holds what is typed; the URL holds what was asked for.
  const [typed, setTyped] = React.useState(urlQ);
  const asked = React.useRef(urlQ);
  React.useEffect(() => {
    // The URL moved without us (Back, a link): follow it.
    if (urlQ !== asked.current) {
      asked.current = urlQ;
      setTyped(urlQ);
    }
  }, [urlQ]);
  React.useEffect(() => {
    const next = typed.trim();
    if (next === asked.current.trim()) return;
    const timer = window.setTimeout(() => {
      asked.current = next;
      patchParams({ q: next || null });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [typed, patchParams]);

  const term = view === 'viewers' ? '' : urlQ.trim();
  const q = useLeadsQuery(view, term);
  const countsQ = useLeadCountsQuery();
  const viewersQ = useLeadViewersQuery(view === 'viewers');

  const counts = q.data?.counts ?? countsQ.data;
  const funnel = q.data?.funnel;
  const items = q.data?.items ?? [];
  // Rows left over from the tab we just left are not this tab's rows.
  const loading = q.isPending || q.isPlaceholderData;
  // No list at all is not an empty one: "Nobody to follow up" under a failed
  // request is the one thing this page cannot say wrongly.
  const failed = q.isError && !q.data;
  const cutShort =
    counts && !term && view !== 'viewers' ? cutShortNote(items.length, viewTotal(view, counts)) : null;


  // A new tab or a new search starts from the first rows again.
  React.useEffect(() => setShown(FIRST_ROWS), [view, term]);

  function setView(next: LeadView) {
    patchParams({ view: next === 'todo' ? null : next });
  }
  function openLead(id: string | null) {
    patchParams({ lead: id });
  }
  function onRowClick(lead: LeadRow) {
    // Dragging across a number or a note to copy it ends in a click on the row.
    // That is somebody copying, not asking for the lead.
    if (window.getSelection()?.toString()) return;
    openLead(lead.id);
  }
  const onAction: LeadActionHandler = (action, lead, contactPrefill) => {
    setDialog({ action, lead, ...(contactPrefill ? { contactPrefill } : {}) });
  };
  const hrefFor = (id: string) => {
    const next = new URLSearchParams(search);
    next.set('lead', id);
    return `?${next.toString()}`;
  };

  function refreshAll() {
    void qc.invalidateQueries({ queryKey: leadsRoot });
  }

  const steps = funnel ? funnelSteps(funnel) : [];
  const rows = items.slice(0, shown);

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Everyone who wrote back to us on WhatsApp, asked for a call, or was added by the team. Each one stays here until they say no, ask us to stop, or become a client."
        actions={
          <>
            <AddLeadButton onOpenLead={(id) => openLead(id)} />
            <HowFollowUpsWork />
          </>
        }
        tools={
          <RefreshTool
            label="Refresh the leads"
            loading={q.isRefetching}
            onRefresh={refreshAll}
          />
        }
      />

      {/* On a phone five tiles filled the whole first screen and pushed the list
          out of sight; one line carries the same numbers there. */}
      <p className="mb-3 text-sm text-text-muted md:hidden">
        <strong className="text-text">{NUMBER(counts?.todo)}</strong> to follow up ·{' '}
        <strong className={counts?.cold ? 'text-danger' : 'text-text'}>{NUMBER(counts?.cold)}</strong>{' '}
        going cold · <strong className="text-text">{NUMBER(counts?.new)}</strong> new ·{' '}
        <strong className="text-text">{NUMBER(counts?.talking)}</strong> in talks
      </p>
      <div className="mb-3 hidden md:grid md:grid-cols-5 md:gap-3">
        <StatTile
          label="Follow up now"
          value={NUMBER(counts?.todo)}
          caption="Due now, or nobody has called"
        />
        <StatTile label="Going cold" value={NUMBER(counts?.cold)} caption="A working day late" />
        <StatTile label="New, not called" value={NUMBER(counts?.new)} caption="Nobody has been in touch" />
        <StatTile
          label="In talks"
          value={NUMBER(counts?.talking)}
          caption="Spoken to, no decision yet"
        />
        <StatTile
          label="Clients (30 days)"
          value={NUMBER(funnel?.clients)}
          caption="Became an outlet"
        />
      </div>

      {funnel ? (
        <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted">
          <span className="text-text-subtle">Last {funnel.days} days:</span>
          {steps.map((s, i) => (
            <React.Fragment key={s.key}>
              {i > 0 ? (
                <ArrowRight width={12} height={12} strokeWidth={1.75} aria-hidden className="text-text-subtle" />
              ) : null}
              <span>
                <span className="font-semibold tabular-nums text-text">{NUMBER(s.count)}</span>{' '}
                {s.label.toLowerCase()}
              </span>
            </React.Fragment>
          ))}
        </p>
      ) : null}

      <Tabs
        className="mb-3"
        value={view}
        onChange={(id) => setView(id as LeadView)}
        items={LEAD_VIEWS.map((v) => ({ id: v, label: viewLabel(v, counts) }))}
      />

      {view === 'viewers' ? (
        <ViewersList
          list={viewersQ.data}
          loading={viewersQ.isPending}
          failed={viewersQ.isError && !viewersQ.data}
          now={now}
          onRetry={() => void viewersQ.refetch()}
        />
      ) : (
        <>
          <div className="mb-3 md:max-w-sm">
            <Label htmlFor="lead-search" className="sr-only">
              Search the leads
            </Label>
            <Input
              id="lead-search"
              type="search"
              inputMode="search"
              autoComplete="off"
              autoCapitalize="none"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Search by name, number or place"
            />
          </div>

          {cutShort ? <p className="mb-3 text-xs text-text-subtle">{cutShort}</p> : null}

          <Card>
            {/* The page is not selectable except the numbers and notes, so a click on a
                row's plain parts does not clear a number selected a moment ago — and the
                row click below would then keep reading "somebody is copying" and never
                open anything. A press outside the selection drops it first. */}
            <CardContent
              padding="none"
              onMouseDownCapture={(e) => {
                const s = window.getSelection();
                if (s && !s.isCollapsed && !s.containsNode(e.target as Node, true)) s.removeAllRanges();
              }}
            >
              <DataList<LeadRow>
                rows={rows}
                rowKey={(l) => l.id}
                loading={loading}
                cardVariant="rows"
                empty={
                  failed ? (
                    <EmptyState
                      icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
                      title="Could not load the leads"
                      description="This does not mean there are none. Check the connection and try again."
                      cta={
                        <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
                          Try again
                        </Button>
                      }
                    />
                  ) : (
                    <Empty view={view} term={term} openCount={counts?.open ?? 0} onClear={() => {
                      asked.current = '';
                      setTyped('');
                      patchParams({ q: null });
                    }} />
                  )
                }
                onRowClick={onRowClick}
                // Who they are, how interested they are, where it stands, and the
                // buttons last. Narrower than this it scrolls inside its box.
                minWidth="60rem"
                columns={[
                  {
                    id: 'lead',
                    header: 'Lead',
                    mobile: 'primary',
                    width: '15rem',
                    // `!`: the cell's own `align-middle` would win over a plain
                    // `align-top`, and a row this tall reads from its top edge.
                    tdClassName: '!align-top',
                    cell: (l) => (
                      <LeadWhoCell lead={l} openHref={hrefFor(l.id)} now={now} onPhone={!isMd} />
                    ),
                  },
                  {
                    id: 'interest',
                    header: 'Their interest',
                    // The card reads who, where it stands, then how interested:
                    // slots run primary, secondary, meta whatever the column order.
                    mobile: 'meta',
                    width: '16rem',
                    tdClassName: '!align-top',
                    cell: (l) => <LeadInterestCell lead={l} now={now} />,
                  },
                  {
                    id: 'stands',
                    header: 'Where it stands',
                    mobile: 'secondary',
                    tdClassName: '!align-top',
                    cell: (l) => <LeadStandsCell lead={l} now={now} onPhone={!isMd} />,
                  },
                ]}
                // No actions on a phone: with any, the card could not be one tap
                // target, and the drawer already has them all.
                rowActions={
                  isMd ? (l) => <LeadRowActions lead={l} onAction={onAction} /> : undefined
                }
              />
              {items.length > shown && !loading ? (
                <div className="border-t border-border p-3">
                  <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + FIRST_ROWS)}>
                    Show more ({(items.length - shown).toLocaleString('en-IN')} left)
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}

      <LeadDrawer id={openId} now={now} onClose={() => openLead(null)} onAction={onAction} />
      <LeadDialogs
        state={dialog}
        onClose={() => setDialog(null)}
        onOpenLead={(id) => openLead(id)}
      />
    </div>
  );
}

/** What the list says when it is whole and has nothing in it, for each tab. */
function Empty({
  view,
  term,
  openCount,
  onClear,
}: {
  view: LeadView;
  term: string;
  openCount: number;
  onClear: () => void;
}) {
  if (term) {
    return (
      <EmptyState
        icon={<Search width={24} height={24} strokeWidth={1.75} />}
        title="No leads match"
        description="Try a different name, part of the number, or the place. A search looks through this tab only."
        cta={
          <Button size="sm" variant="secondary" onClick={onClear}>
            Clear the search
          </Button>
        }
      />
    );
  }
  if (view === 'todo' && openCount > 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 width={24} height={24} strokeWidth={1.75} />}
        title="Nobody to follow up right now"
        description="Every open lead has a follow-up still to come. A new one, or one that is due, reaches your phone as an alert."
      />
    );
  }
  const words: Record<LeadView, { title: string; description: string }> = {
    todo: {
      title: 'No leads yet',
      description:
        'Anyone who writes back to us on WhatsApp, or asks for a call-back on the film page, appears here. Use Add lead for anyone else you want to follow up.',
    },
    open: {
      title: 'No open leads',
      description: 'Every lead so far has closed. A new one appears here as soon as somebody writes to us.',
    },
    mine: {
      title: 'None are yours yet',
      description:
        'A lead becomes yours when you log a contact on it, or when somebody gives it to you.',
    },
    closed: {
      title: 'Nothing closed yet',
      description: 'A lead that says no, asks us to stop, or becomes a client moves here.',
    },
    viewers: { title: '', description: '' },
  };
  return (
    <EmptyState
      icon={<Target width={24} height={24} strokeWidth={1.75} />}
      title={words[view].title}
      description={words[view].description}
    />
  );
}
