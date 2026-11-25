import { AlertTriangle, OctagonAlert } from 'lucide-react';
import * as React from 'react';

import { Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { KavachPanel } from '@dk/shared';

type Tone = NonNullable<KavachPanel['rows'][number]['tone']>;

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-success-strong',
  warn: 'text-warning-strong',
  bad: 'text-danger-strong',
};

/** The tone says it in words too, for anyone who cannot tell the colours apart. */
const TONE_WORD: Record<Tone, string> = {
  ok: 'OK',
  warn: 'needs a look',
  bad: 'problem',
};

/**
 * One data panel, whatever it is about: a title, rows of label and value, an
 * optional table, an optional photo, or one plain line saying there is nothing
 * to show. The server builds every panel into this one shape (ADR 0057 §7), so
 * the DSR, the stock, the papers and the staff all draw here.
 */
export function KavachPanelView({
  panel,
  onOpenPhoto,
}: {
  panel: KavachPanel;
  /** Open the panel's photo big. Absent: the photo is shown but does not open. */
  onOpenPhoto?: (url: string, caption: string) => void;
}) {
  const hasBody = panel.rows.length > 0 || !!panel.table || !!panel.photo;
  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-sm font-semibold text-text">{panel.title}</h3>
        {panel.subtitle ? <span className="text-xs text-text-muted">{panel.subtitle}</span> : null}
      </div>

      {panel.empty && !hasBody ? (
        <p className="mt-2 text-sm text-text-muted">{panel.empty}</p>
      ) : null}

      {panel.rows.length > 0 ? (
        <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-sm">
          {panel.rows.map((r, i) => (
            <React.Fragment key={`${r.label}-${i}`}>
              <dt className="min-w-0 break-words text-text-muted">{r.label}</dt>
              <dd
                className={cn(
                  'min-w-0 break-words text-right font-medium tabular-nums',
                  r.tone ? TONE_TEXT[r.tone] : 'text-text',
                )}
              >
                {r.value}
                {r.tone && r.tone !== 'ok' ? (
                  <>
                    {r.tone === 'bad' ? (
                      <OctagonAlert aria-hidden className="ml-1.5 inline h-3.5 w-3.5 -translate-y-px" />
                    ) : (
                      <AlertTriangle aria-hidden className="ml-1.5 inline h-3.5 w-3.5 -translate-y-px" />
                    )}
                    <span className="sr-only"> ({TONE_WORD[r.tone]})</span>
                  </>
                ) : null}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}

      {panel.table && panel.table.rows.length > 0 ? (
        <div className="-mx-3 mt-2 overflow-x-auto px-3">
          <table className="w-full min-w-max border-collapse text-xs">
            <thead>
              <tr>
                {panel.table.columns.map((c, i) => (
                  <th
                    key={`${c}-${i}`}
                    scope="col"
                    className={cn(
                      'border-b border-border px-2 py-1.5 font-medium text-text-muted',
                      i === 0 ? 'text-left' : 'text-right',
                    )}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {panel.table.rows.map((row, ri) => (
                <tr key={ri} className="border-b border-border last:border-0">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={cn(
                        'px-2 py-1.5 tabular-nums text-text',
                        ci === 0 ? 'text-left font-medium' : 'text-right',
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {panel.photo ? (
        <figure className="mt-2">
          {onOpenPhoto ? (
            <button
              type="button"
              onClick={() => onOpenPhoto(panel.photo!.url, panel.photo!.caption)}
              className="block w-full overflow-hidden rounded-sm border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              aria-label={`Open photo: ${panel.photo.caption}`}
            >
              <img
                src={panel.photo.url}
                alt={panel.photo.caption}
                draggable={false}
                className="max-h-56 w-full object-contain"
              />
            </button>
          ) : (
            <img
              src={panel.photo.url}
              alt={panel.photo.caption}
              draggable={false}
              className="max-h-56 w-full rounded-sm border border-border object-contain"
            />
          )}
          <figcaption className="mt-1 text-xs text-text-muted">{panel.photo.caption}</figcaption>
        </figure>
      ) : null}
    </Card>
  );
}
