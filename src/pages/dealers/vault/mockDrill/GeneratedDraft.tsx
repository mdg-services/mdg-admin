import { KeyValueList, type KeyValueItem } from '@/components/ui';
import { formatYmd } from '@/lib/format';
import type { MockDrillGenerated } from '@dk/shared';

import { seconds } from './format';

/**
 * The part of the report the system writes fresh for every drill, read-only:
 * what the portal's page will be given. Shown in full so an admin checks the
 * whole report, not only the boxes they can edit.
 */
export function GeneratedDraft({
  generated,
  personsPresent,
  headCountShort,
}: {
  generated: MockDrillGenerated;
  /** The dependent fields as they stand (the review form's live values). */
  personsPresent: number | null;
  headCountShort: number | null;
}) {
  const present = personsPresent;
  const short = headCountShort ?? 0;
  const atAssembly = present === null ? null : Math.max(present - short, 0);

  const items: KeyValueItem[] = [
    { key: 'day', label: 'Day', value: formatYmd(generated.date) },
    { key: 'time', label: 'Start time', value: generated.time, numeric: true },
    { key: 'duration', label: 'Duration', value: `${generated.durationMinutes} minutes` },
    { key: 'clear', label: 'All clear', value: generated.allClear, numeric: true },
    { key: 'init', label: 'Initiation', value: generated.initiation, block: true },
    { key: 'desc', label: 'Description', value: generated.description, block: true },
  ];

  return (
    <div className="grid gap-4">
      <KeyValueList items={items} />

      <div>
        <h4 className="mb-1.5 text-sm font-semibold text-text">Response times</h4>
        <ul className="grid gap-1.5 md:hidden">
          {generated.events.map((e) => (
            <li key={e.event} className="rounded-md border border-border px-3 py-2 text-sm">
              <p className="font-medium text-text">{e.event}</p>
              <p className="text-text-muted">
                Expected {seconds(e.expected)} · Actual {seconds(e.actual)}
              </p>
              {e.remark ? <p className="break-words text-text-muted">Remark: {e.remark}</p> : null}
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-md border border-border md:block">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Event</th>
                <th className="px-3 py-2 text-right font-semibold">Expected</th>
                <th className="px-3 py-2 text-right font-semibold">Actual</th>
                <th className="px-3 py-2 text-left font-semibold">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {generated.events.map((e) => (
                <tr key={e.event} className="border-t border-border">
                  <td className="px-3 py-2 text-text">{e.event}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text">
                    {seconds(e.expected)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-text">
                    {seconds(e.actual)}
                  </td>
                  <td className="break-words px-3 py-2 text-text-muted">{e.remark || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h4 className="mb-1.5 text-sm font-semibold text-text">Head count</h4>
        <p className="text-sm text-text-muted">
          {present === null || atAssembly === null
            ? 'Fill in the persons present to see the head count.'
            : `${present} present before the drill, ${atAssembly} at the assembly point, ${short} short.`}
        </p>
        <p className="mt-0.5 break-words text-sm text-text-muted">
          Action taken: {generated.headCountAction || '-'}
        </p>
      </div>
    </div>
  );
}
