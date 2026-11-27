import { ExternalLink, TriangleAlert } from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Callout,
  EmptyState,
  RefreshTool,
  SegmentedControl,
  Skeleton,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  Table,
} from '@/components/ui';
import { useFunnelQuery } from '@/hooks/api/useFunnel';
import type { FunnelRow, FunnelWindow } from '@dk/shared';

import { isEmptyReport, shareOf, sourceView } from './format';

/** The page's title cell: the readable name, its family, and a link to the live page when there is one. */
function SourceCell({ source }: { source: string | null }) {
  const v = sourceView(source);
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      {v.href ? (
        <a
          href={v.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-text underline-offset-2 hover:underline"
        >
          {v.title}
          <ExternalLink width={12} height={12} aria-hidden />
          <span className="sr-only">(opens the live page)</span>
        </a>
      ) : (
        <span className="font-medium text-text">{v.title}</span>
      )}
      {v.family || v.raw ? (
        <p className="mt-0.5 text-xs text-text-subtle">
          {v.family ? `${v.family} · ` : ''}
          {v.raw ? <span className="select-text font-mono">{v.raw}</span> : null}
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-text-subtle">No page tag (opened the app by itself, or a link without a tag)</p>
      )}
    </div>
  );
}

const num = 'text-right tabular-nums';

/** One row of numbers; the page's name is the row's header cell. */
function Row({ row, label }: { row: Omit<FunnelRow, 'source'>; label: React.ReactNode }) {
  return (
    <TRow>
      {/* A row header, not a cell, so a screen reader names each number by its page. The
          table's own first-column freeze only pins `td`s, so this pins itself the same way. */}
      <TH scope="row" className="sticky left-0 z-10 bg-surface py-2 font-normal">
        {label}
      </TH>
      <TD className={num}>{row.taps.android}</TD>
      <TD className={num}>{row.taps.ios}</TD>
      <TD className={num}>{row.taps.other}</TD>
      <TD className={`${num} font-medium`}>{row.taps.total}</TD>
      <TD className={`${num} font-medium`}>{row.signUps}</TD>
      <TD className={num}>{shareOf(row.paid, row.signUps)}</TD>
    </TRow>
  );
}

/**
 * "Website → app" (ADR 0059 §3): for each page on mdgservices.in, how many people pressed
 * "Ask in Kavach Shuruaat", how many signed up with that page's tag, and how many of
 * those have paid. It is how the team sees which pages bring people in. Every admin:
 * counts and page names only, never a person.
 */
export function FunnelPage() {
  const [days, setDays] = React.useState<FunnelWindow>(30);
  const q = useFunnelQuery(days);
  const data = q.data;
  const failed = q.isError && !data;

  return (
    <div>
      <PageHeader
        title="Website → app"
        subtitle="Which website pages bring people into Kavach Shuruaat."
        tools={
          <RefreshTool
            label="Refresh the report"
            loading={q.isRefetching}
            onRefresh={() => void q.refetch()}
          />
        }
      />

      <div className="mb-3 max-w-3xl space-y-1 text-sm text-text-muted">
        <p>
          A tap is someone pressing &ldquo;Ask in Kavach Shuruaat&rdquo; on that page. Installs are counted by the
          stores, not here.
        </p>
        <p>
          A sign-up is a Kavach Shuruaat account opened in these days that came from that page. Paid counts the
          sign-ups that have paid at least once. iPhone installs carry no page, so those sign-ups show under
          &ldquo;No source&rdquo;.
        </p>
      </div>

      <div className="mb-3">
        <SegmentedControl<string>
          aria-label="How far back"
          value={String(days)}
          onChange={(v) => setDays(Number(v) as FunnelWindow)}
          options={[
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
          ]}
        />
      </div>

      {q.isPending ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading the report">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : failed ? (
        <EmptyState
          icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
          title="Could not load the report"
          description="This does not mean nobody came. Check the connection and try again."
        />
      ) : data ? (
        <>
          {q.isError ? (
            <Callout className="mb-3" onRetry={() => void q.refetch()}>
              Could not refresh. These are the numbers from the last time it loaded.
            </Callout>
          ) : null}
          {isEmptyReport(data.rows, data.noSource) ? (
            <EmptyState
              title={`Nothing in the last ${data.days} days`}
              description="No taps and no Kavach Shuruaat sign-ups yet. A tap shows here within a minute of being made."
            />
          ) : (
            <Table
              freezeFirstColumn
              minWidth="44rem"
              density="compact"
              wrapperClassName="rounded-md border border-border"
            >
              <caption className="sr-only">
                Taps on &ldquo;Ask in Kavach Shuruaat&rdquo;, sign-ups and payments for each website page, last{' '}
                {data.days} days. Most sign-ups first.
              </caption>
              <THead>
                <tr>
                  <TH scope="col" className="min-w-[12rem]">
                    Page
                  </TH>
                  <TH scope="col" className={num}>
                    Android taps
                  </TH>
                  <TH scope="col" className={num}>
                    iPhone taps
                  </TH>
                  <TH scope="col" className={num}>
                    Other taps
                  </TH>
                  <TH scope="col" className={num}>
                    All taps
                  </TH>
                  <TH scope="col" className={num}>
                    Sign-ups
                  </TH>
                  <TH scope="col" className={num}>
                    Paid
                  </TH>
                </tr>
              </THead>
              <TBody>
                {data.rows.map((row) => (
                  <Row key={row.source} row={row} label={<SourceCell source={row.source} />} />
                ))}
                <Row row={data.noSource} label={<SourceCell source={null} />} />
                <Row row={data.totals} label={<span className="font-semibold text-text">All pages</span>} />
              </TBody>
            </Table>
          )}
        </>
      ) : null}
    </div>
  );
}
