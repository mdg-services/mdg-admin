import * as React from 'react';

import { Badge, Callout } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import {
  dueWords,
  historyLabel,
  howLabel,
  reasonLabel,
  stateIntent,
  stateLabel,
  waitWords,
} from '@/lib/kavachWords';
import type { KavachCheckDetail } from '@dk/shared';

import { KavachPanelView } from './KavachPanelView';

const VERDICT_WORDS = {
  ok: 'Our data says it is done',
  not_ok: 'Our data says it is not done',
  unknown: 'Our data cannot tell yet',
} as const;

/** The lines of "what to do / what the photo must show", one per row. */
export function howToLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * The right-hand side of a review: who and what, what to check, the data beside
 * the photo, and what has already happened to this check.
 */
export function CheckDetailColumn({
  detail,
  onOpenPhoto,
  now,
}: {
  detail: KavachCheckDetail;
  onOpenPhoto: (url: string, caption: string) => void;
  now: number;
}) {
  const lines = howToLines(detail.task.howToEn);
  const sub = detail.submission;
  const events = [...detail.history].reverse();

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <p className="text-sm text-text-muted">
          <span className="font-semibold text-text">{detail.dealerCode}</span> · {detail.dealerName}
        </p>
        <h2 className="mt-0.5 text-lg font-semibold leading-snug text-text">{detail.task.titleEn}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-text-muted">
          <span>{detail.periodLabel}</span>
          <Badge intent={stateIntent(detail.state, detail.late)}>{stateLabel(detail.state, detail.late)}</Badge>
          <Badge>{howLabel(detail.how)}</Badge>
          {detail.dueAt && detail.state !== 'done' ? <span>{dueWords(detail.dueAt, detail.late, now)}</span> : null}
        </div>
        {sub ? (
          <p className="mt-1.5 text-sm text-text-muted">
            Sent by {sub.by.name} · {formatDateTime(sub.at)}
            {detail.state === 'sent' ? ` · ${waitWords(sub.at, now)}` : ''}
          </p>
        ) : null}
        {detail.sendBackCount > 0 ? (
          <p className="mt-1 text-sm text-text-muted">
            Asked again {detail.sendBackCount} {detail.sendBackCount === 1 ? 'time' : 'times'} already.
          </p>
        ) : null}
      </header>

      {sub?.note ? (
        <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text">
          <span className="block text-xs font-medium text-text-muted">Note from the outlet</span>
          {sub.note}
        </div>
      ) : null}

      {detail.dataResult ? (
        <Callout intent={detail.dataResult.verdict === 'ok' ? 'info' : 'warning'}>
          <span className="font-medium">{VERDICT_WORDS[detail.dataResult.verdict]}.</span>{' '}
          {detail.dataResult.summary}{' '}
          <span className="text-text-muted">({formatDateTime(detail.dataResult.at)})</span>
        </Callout>
      ) : null}

      {lines.length > 0 ? (
        <section aria-labelledby="kavach-what-to-check">
          <h3 id="kavach-what-to-check" className="text-sm font-semibold text-text">
            What to check
          </h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-text marker:text-text-subtle">
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {detail.panels.length > 0 ? (
        <section aria-label="Our data" className="flex flex-col gap-3">
          {detail.panels.map((p) => (
            <KavachPanelView key={p.id} panel={p} onOpenPhoto={onOpenPhoto} />
          ))}
        </section>
      ) : null}

      {detail.sendBacks.length > 0 || detail.ownerReports.length > 0 ? (
        <section aria-label="Messages sent about this check" className="text-sm">
          {detail.sendBacks.map((s, i) => (
            <p key={`sb-${i}`} className="text-text-muted">
              <span className="font-medium text-text">Asked again</span> · {formatDateTime(s.at)} ·{' '}
              {reasonLabel(s.reason)}
              {s.note ? `: ${s.note}` : ''} ({s.byName})
            </p>
          ))}
          {detail.ownerReports.map((o, i) => (
            <p key={`or-${i}`} className="text-text-muted">
              <span className="font-medium text-text">Owner told</span> · {formatDateTime(o.at)}: {o.note} (
              {o.byName})
            </p>
          ))}
        </section>
      ) : null}

      {events.length > 0 ? (
        <details className="group rounded-md border border-border">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium text-text marker:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-9">
            History ({events.length})
          </summary>
          <ol className="space-y-1.5 border-t border-border px-3 py-2 text-sm">
            {events.map((h, i) => (
              <li key={i} className="text-text-muted">
                <span className="font-medium text-text">{historyLabel(h.what)}</span> ·{' '}
                {formatDateTime(h.at)}
                {h.byName ? ` · ${h.byName}` : ''}
                {h.note ? `: ${h.note}` : ''}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
