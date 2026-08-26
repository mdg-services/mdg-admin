import { X } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  DateRangeFilter,
  FilterBar,
  Input,
  Label,
  Select,
  dateRangeForPreset,
  type DateRangeValue,
} from '@/components/ui';
import {
  ASSIST_CHANNELS,
  ASSIST_FOLLOWUP_STATUSES,
  ASSIST_SESSION_STATUSES,
} from '@dk/shared';
import type {
  AssistChannel,
  AssistFollowupStatus,
  AssistSessionStatus,
} from '@dk/shared';

import { channelLabel, followupLabel, sessionStatusLabel } from './assistFormat';
import { activeFilterCount } from './assistParams';

/**
 * The four filters and the date window.
 *
 * At `≥ md` this is the card it has always been — `FilterBar` emits exactly the
 * old `<Card><CardContent className="grid gap-3 md:grid-cols-4">`. Below md the
 * same four controls cost about 428px of a 640px screen, which is why the first
 * conversation used to start more than a full screen below the fold: the reader
 * had to scroll past the filters to find out whether filtering had helped. They
 * now sit behind one 44px button, with a chip per set filter so nobody has to
 * open the sheet to see why the list is short.
 */
export function FiltersCard({
  channel,
  status,
  followupStatus,
  q,
  range,
  onChange,
  onSearchCommit,
}: {
  channel?: AssistChannel;
  status?: AssistSessionStatus;
  followupStatus?: AssistFollowupStatus;
  q: string;
  range: DateRangeValue | null;
  onChange: (patch: Record<string, string | undefined>) => void;
  onSearchCommit: (value: string) => void;
}) {
  const trimmedQ = q.trim() || undefined;
  const active = activeFilterCount({
    channel,
    status,
    followupStatus,
    q: trimmedQ,
    range,
  });

  const clearAll = React.useCallback(
    () =>
      onChange({
        channel: undefined,
        status: undefined,
        followup: undefined,
        q: undefined,
        preset: undefined,
        from: undefined,
        to: undefined,
      }),
    [onChange],
  );

  // `FilterBar` cannot derive these — `children` is opaque markup to it — so the
  // page that knows what a filter means renders its own chips.
  const chips =
    active === 0 ? null : (
      <>
        {channel ? (
          <FilterChip
            label={channelLabel(channel)}
            onRemove={() => onChange({ channel: undefined })}
          />
        ) : null}
        {status ? (
          <FilterChip
            label={sessionStatusLabel(status)}
            onRemove={() => onChange({ status: undefined })}
          />
        ) : null}
        {followupStatus ? (
          <FilterChip
            label={followupLabel(followupStatus)}
            onRemove={() => onChange({ followup: undefined })}
          />
        ) : null}
        {trimmedQ ? (
          <FilterChip label={`“${trimmedQ}”`} onRemove={() => onChange({ q: undefined })} />
        ) : null}
        {range ? (
          <FilterChip
            label={`${range.from} → ${range.to}`}
            onRemove={() =>
              onChange({ preset: undefined, from: undefined, to: undefined })
            }
          />
        ) : null}
      </>
    );

  return (
    <FilterBar
      className="mb-4"
      columnsAtMd={4}
      activeCount={active}
      onClear={active > 0 ? clearAll : undefined}
      chips={chips}
    >
      <div>
        <Label htmlFor="assist-channel">How they got in touch</Label>
        <Select
          id="assist-channel"
          value={channel ?? ''}
          onChange={(e) => onChange({ channel: e.target.value || undefined })}
        >
          <option value="">Any way</option>
          {ASSIST_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {channelLabel(c)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="assist-status">Where the visit got to</Label>
        <Select
          id="assist-status"
          value={status ?? ''}
          onChange={(e) => onChange({ status: e.target.value || undefined })}
        >
          <option value="">Any</option>
          {ASSIST_SESSION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {sessionStatusLabel(s)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="assist-followup-filter">What we have done about it</Label>
        <Select
          id="assist-followup-filter"
          value={followupStatus ?? ''}
          onChange={(e) => onChange({ followup: e.target.value || undefined })}
        >
          <option value="">Any</option>
          {ASSIST_FOLLOWUP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {followupLabel(s)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="assist-q" hint="a number typed here shows in the address bar">
          Search
        </Label>
        <SearchBox value={q} onCommit={onSearchCommit} />
      </div>

      <div className="md:col-span-4">
        {range ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <DateRangeFilter
              label="Date range"
              value={range}
              className="min-w-0"
              onChange={(next) =>
                onChange({ preset: next.preset, from: next.from, to: next.to })
              }
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange({ preset: undefined, from: undefined, to: undefined })
              }
            >
              Show all dates
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-text-muted">Showing every date on record.</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const w = dateRangeForPreset('last7');
                onChange({ preset: w.preset, from: w.from, to: w.to });
              }}
            >
              Narrow to a date range
            </Button>
          </div>
        )}
      </div>
    </FilterBar>
  );
}

/**
 * One set filter, with its own remove.
 *
 * `.tap-target` rather than a 44px pill: the painted size is load-bearing — a
 * row of 44px-tall chips is most of the screen the collapse just bought back —
 * so the halo does the reaching instead. It only renders below md, inside
 * `FilterBar`'s mobile branch.
 */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="tap-target inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text-muted"
    >
      <span className="min-w-0 truncate">{label}</span>
      <X width={12} height={12} strokeWidth={2} className="shrink-0" aria-hidden />
      <span className="sr-only">Remove this filter</span>
    </button>
  );
}

/**
 * The free-text box, committed to the URL 350 ms after the last keystroke.
 *
 * The ref is what keeps typing and the address bar from fighting: it remembers
 * the last value we ourselves pushed, so a change arriving on the props is
 * adopted only when it came from somewhere else — the back button, a tab
 * switch, a pasted link — and never when it is the echo of what is already in
 * the box.
 */
function SearchBox({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  const emittedRef = React.useRef(value);

  React.useEffect(() => {
    if (value === emittedRef.current) return;
    emittedRef.current = value;
    // What lands in the URL is trimmed; what is in the box is what was typed.
    // Adopting the trimmed form would eat the space the moment it was typed,
    // which reads as the box deleting your keystrokes.
    setDraft((cur) => (cur.trim() === value ? cur : value));
  }, [value]);

  React.useEffect(() => {
    if (draft === emittedRef.current) return;
    const t = window.setTimeout(() => {
      emittedRef.current = draft;
      onCommit(draft);
    }, 350);
    return () => window.clearTimeout(t);
  }, [draft, onCommit]);

  /**
   * Commit whatever is still in flight when this box goes away.
   *
   * Below md the field lives inside the filter sheet, and the sheet UNMOUNTS
   * its contents when it closes. Typing "Kolhapur" and tapping "Show results"
   * inside the 350 ms window used to clear the timer on the way out and search
   * for nothing — a box that silently discards what you typed. Reading the
   * latest values off a ref keeps the cleanup to `[]`, so it runs on unmount
   * and never on a keystroke.
   */
  const latestRef = React.useRef({ draft, onCommit });
  latestRef.current = { draft, onCommit };
  React.useEffect(
    () => () => {
      const { draft: pending, onCommit: commit } = latestRef.current;
      if (pending === emittedRef.current) return;
      emittedRef.current = pending;
      commit(pending);
    },
    [],
  );

  return (
    <Input
      id="assist-q"
      type="search"
      maxLength={80}
      value={draft}
      placeholder="Name, place, number, or the opening line"
      onChange={(e) => setDraft(e.target.value)}
    />
  );
}
