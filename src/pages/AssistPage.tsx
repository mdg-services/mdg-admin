import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs } from '@/components/ui';
import {
  PAGE_SIZE,
  TABS,
  isChannel,
  isFollowup,
  isStatus,
  isTab,
  rangeFromParams,
  type AssistTab,
} from '@/features/assist/assistParams';
import { BlockedTab } from '@/features/assist/BlockedTab';
import { FiltersCard } from '@/features/assist/FiltersCard';
import { SessionDrawer } from '@/features/assist/SessionDrawer';
import { SessionListTab } from '@/features/assist/SessionList';
import { UsageTab } from '@/features/assist/UsageTab';
import type { AssistSessionListQuery } from '@dk/shared/schemas';

/**
 * The landing-page assistant, as a super-admin sees it (ADR 0009 §2).
 *
 * Five tabs over one dataset: every conversation, the ones that left a number,
 * the ones the spam pass wants a human to look at, the visitors we have turned
 * away, and what the whole thing is costing. Tab and every filter live in the
 * query string, so "the escalated calls from last week that nobody has rung
 * back" is a link somebody can paste to a colleague.
 *
 * The privacy rule that shapes the layout: a super-admin reading these
 * transcripts is reading strangers' phone numbers. A number is printed on the
 * Leads tab and in the drawer's lead panel, where ringing it is the job, and
 * nowhere else — never in a page title, never in a toast, never in a URL we put
 * there ourselves.
 *
 * This file is the URL-state shell and nothing else. The four tab bodies, the
 * filter card and the decidable rules live beside it in `features/assist/` —
 * the page was 1,495 lines holding fourteen components, and its own section
 * rules were already the cut lines.
 */
export function AssistPage() {
  const [search, setSearch] = useSearchParams();

  const tabParam = search.get('tab');
  const tab: AssistTab = isTab(tabParam) ? tabParam : 'conversations';

  const channelParam = search.get('channel');
  const channel = isChannel(channelParam) ? channelParam : undefined;
  const statusParam = search.get('status');
  const status = isStatus(statusParam) ? statusParam : undefined;
  const followupParam = search.get('followup');
  const followupStatus = isFollowup(followupParam) ? followupParam : undefined;
  const q = search.get('q')?.trim() || undefined;
  const sessionId = search.get('session');

  const range = rangeFromParams(
    search.get('from'),
    search.get('to'),
    search.get('preset'),
  );

  const page = Math.max(1, Number(search.get('page') ?? '1') || 1);
  /** What to write back for `page` when a patch must preserve it (1 = omit). */
  const pageParam = page === 1 ? undefined : String(page);

  /**
   * Write a patch of query params. Anything set to `undefined` is removed, and
   * any change other than paging itself sends the reader back to page 1 — a
   * filter applied on page 4 of the old result set otherwise lands on a page
   * that may not exist.
   */
  const update = React.useCallback(
    (patch: Record<string, string | undefined>) => {
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === '') next.delete(k);
            else next.set(k, v);
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearch],
  );

  const onSearchCommit = React.useCallback(
    (value: string) => update({ q: value.trim() || undefined }),
    [update],
  );

  const listParams: AssistSessionListQuery = {
    page,
    pageSize: PAGE_SIZE,
    channel,
    status,
    followupStatus,
    // On, or absent. There is no "only the ones that were NOT flagged".
    flagged: tab === 'flagged' ? true : undefined,
    hasLead: tab === 'leads' ? true : undefined,
    q,
    from: range?.from,
    to: range?.to,
  };

  const isListTab = tab === 'conversations' || tab === 'leads' || tab === 'flagged';

  return (
    <div>
      <PageHeader
        title="Assistant"
        subtitle="Every conversation the landing-page assistant has had — what was asked, what we answered, and who is waiting for a call back."
      />

      <Tabs
        className="mb-4"
        items={TABS.map((t) => ({
          id: t.id,
          // Two spans rather than one string: the strip needs ~402px at 360px
          // and gets ~328px, so the fifth tab began entirely off-screen with
          // nothing to say the strip continued. The short word buys the peek;
          // md restores the full label exactly.
          label: t.shortLabel ? (
            <>
              <span className="md:hidden">{t.shortLabel}</span>
              <span className="hidden md:inline">{t.label}</span>
            </>
          ) : (
            t.label
          ),
        }))}
        value={tab}
        onChange={(id) =>
          update({
            // The default tab carries no param, so a link to it stays clean.
            tab: id === 'conversations' ? undefined : id,
            // A drawer left open across a tab change is a panel with no row.
            session: undefined,
          })
        }
      />

      {isListTab ? (
        <FiltersCard
          channel={channel}
          status={status}
          followupStatus={followupStatus}
          q={search.get('q') ?? ''}
          range={range}
          onChange={update}
          onSearchCommit={onSearchCommit}
        />
      ) : null}

      {isListTab ? (
        <SessionListTab
          tab={tab}
          params={listParams}
          // `page` is repeated into the patch on purpose: opening a row must
          // not throw the reader back to page 1 of the list behind the drawer.
          onOpen={(id) => update({ session: id, page: pageParam })}
          onPage={(p) => update({ page: p === 1 ? undefined : String(p) })}
        />
      ) : tab === 'blocked' ? (
        <BlockedTab />
      ) : (
        <UsageTab />
      )}

      <SessionDrawer
        sessionId={sessionId}
        onClose={() => update({ session: undefined, page: pageParam })}
      />
    </div>
  );
}
