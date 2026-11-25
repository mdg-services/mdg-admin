import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

import type { ReportStatus } from '@dk/shared';

import type { ReportSummary } from './reportSummary';

/**
 * The team's reading of a report's snapshot, inside the thread bubble (ADR 0056).
 * The dealer's app draws the report on Today; the inbox has no such screen, so this
 * small card says the kind, the verdict (an icon AND a word, never colour alone), the
 * day and the key figures. Admin-only, English, compact.
 */
const STATUS_ICON: Record<ReportStatus, typeof Info> = {
  ok: CheckCircle2,
  attention: AlertTriangle,
  info: Info,
};

export function ReportSummaryCard({ summary }: { summary: ReportSummary }) {
  const Icon = STATUS_ICON[summary.status];
  return (
    <section
      data-testid="report-summary"
      data-kind={summary.kind}
      data-status={summary.status}
      aria-label={`${summary.name} report summary`}
      className="mt-1 rounded-md border border-wa-divider bg-black/[0.04] px-2 py-1.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <h4 className="text-[13px] font-bold leading-tight [overflow-wrap:anywhere]">{summary.name}</h4>
        <span
          data-testid="report-summary-status"
          className="flex items-center gap-1 text-[12px] font-semibold leading-tight"
        >
          <Icon width={14} strokeWidth={2.4} className="shrink-0" aria-hidden />
          {summary.statusWord}
        </span>
      </div>
      {summary.day ? (
        <p data-testid="report-summary-day" className="text-[12px] leading-tight text-wa-meta">
          {summary.day}
        </p>
      ) : null}
      {summary.headline ? (
        <p
          data-testid="report-summary-headline"
          className="mt-1 text-[13px] font-semibold leading-snug [overflow-wrap:anywhere]"
        >
          {summary.headline}
        </p>
      ) : null}
      {summary.facts.length > 0 ? (
        <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[12.5px] leading-snug">
          {summary.facts.map((f, i) => (
            <div key={`${f.label}-${i}`} className="contents">
              <dt className="text-wa-meta [overflow-wrap:anywhere]">{f.label}</dt>
              <dd className="font-medium [overflow-wrap:anywhere]">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
