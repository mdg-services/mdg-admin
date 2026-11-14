import * as React from 'react';

import { Input, Label, Textarea } from '@/components/ui';
import { MOCK_DRILL_LIMITS, type MockDrillGenerated } from '@dk/shared';
import type { MockDrillGeneratedEdit } from '@dk/shared/schemas';

/**
 * The part of the report the system wrote for the drill — its day and time, the
 * response table and the text — as boxes an admin may correct while checking. The
 * all-clear time is not a box: it is always the start plus the duration.
 */
export interface GeneratedForm {
  date: string;
  time: string;
  duration: string;
  initiation: string;
  description: string;
  events: Array<{ event: string; expected: string; actual: string; remark: string }>;
  headCountAction: string;
}

export type GeneratedErrors = Partial<
  Record<
    'date' | 'time' | 'duration' | 'initiation' | 'description' | 'events' | 'headCountAction',
    string
  >
>;

export function startingGeneratedForm(g: MockDrillGenerated): GeneratedForm {
  return {
    date: g.date,
    time: g.time,
    duration: String(g.durationMinutes),
    initiation: g.initiation,
    description: g.description,
    events: g.events.map((e) => ({
      event: e.event,
      expected: String(e.expected),
      actual: String(e.actual),
      remark: e.remark,
    })),
    headCountAction: g.headCountAction,
  };
}

const wholeNumber = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null);

/** The all clear, as the portal writes it (dd/mm/yyyy HH:mm), or null while the boxes cannot give one. */
export function allClearOf(form: Pick<GeneratedForm, 'date' | 'time' | 'duration'>): string | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(form.date);
  const tm = /^(\d{2}):(\d{2})$/.exec(form.time);
  const dur = wholeNumber(form.duration);
  if (!day || !tm || dur === null) return null;
  const end = Number(tm[1]) * 60 + Number(tm[2]) + dur;
  if (end >= 24 * 60) return null;
  const hh = String(Math.floor(end / 60)).padStart(2, '0');
  const mm = String(end % 60).padStart(2, '0');
  return `${day[3]}/${day[2]}/${day[1]} ${hh}:${mm}`;
}

/** Plain-words problems, in the portal's own limits. `today` is the IST date now, YYYY-MM-DD. */
export function validateGenerated(form: GeneratedForm, today: string): GeneratedErrors {
  const errors: GeneratedErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) errors.date = 'Pick the day of the drill.';
  else if (form.date > today) errors.date = 'The day cannot be in the future.';
  else {
    const oldest = new Date(`${today}T00:00:00Z`);
    oldest.setUTCDate(oldest.getUTCDate() - 60);
    if (form.date < oldest.toISOString().slice(0, 10)) errors.date = 'The day cannot be more than 60 days back.';
  }
  const tm = /^(\d{2}):(\d{2})$/.exec(form.time);
  if (!tm || Number(tm[1]) > 23 || Number(tm[2]) > 59) errors.time = 'Enter the start time.';
  const dur = wholeNumber(form.duration);
  if (dur === null || dur < 1 || dur > 240) errors.duration = 'Enter minutes, from 1 to 240.';
  else if (!errors.time && allClearOf(form) === null) errors.duration = 'The drill must end before midnight.';
  const init = form.initiation.trim();
  if (init.length < 3) errors.initiation = 'Write at least 3 characters.';
  else if (init.length > MOCK_DRILL_LIMITS.initiation) errors.initiation = `At most ${MOCK_DRILL_LIMITS.initiation} characters.`;
  const desc = form.description.trim();
  if (desc.length < 3) errors.description = 'Write at least 3 characters.';
  else if (desc.length > MOCK_DRILL_LIMITS.description) errors.description = `At most ${MOCK_DRILL_LIMITS.description} characters.`;
  if (
    form.events.some(
      (e) =>
        wholeNumber(e.expected) === null ||
        wholeNumber(e.actual) === null ||
        Number(e.expected) > 3600 ||
        Number(e.actual) > 3600 ||
        e.remark.trim().length > MOCK_DRILL_LIMITS.eventRemark,
    )
  ) {
    errors.events = 'Every time must be whole seconds, 0 to 3600.';
  }
  const act = form.headCountAction.trim();
  if (act === '') errors.headCountAction = 'Write "NO" if nobody was missing.';
  else if (act.length > MOCK_DRILL_LIMITS.headCountAction) {
    errors.headCountAction = `At most ${MOCK_DRILL_LIMITS.headCountAction} characters.`;
  }
  return errors;
}

/** Only what the admin changed, so the server records exactly their corrections. */
export function generatedEditsFrom(original: MockDrillGenerated, form: GeneratedForm): MockDrillGeneratedEdit {
  const edits: MockDrillGeneratedEdit = {};
  if (form.date !== original.date) edits.date = form.date;
  if (form.time !== original.time) edits.time = form.time;
  const dur = wholeNumber(form.duration);
  if (dur !== null && dur !== original.durationMinutes) edits.durationMinutes = dur;
  if (form.initiation.trim() !== original.initiation.trim()) edits.initiation = form.initiation.trim();
  if (form.description.trim() !== original.description.trim()) edits.description = form.description.trim();
  const rows = form.events.map((e) => ({
    expected: wholeNumber(e.expected) ?? 0,
    actual: wholeNumber(e.actual) ?? 0,
    remark: e.remark.trim(),
  }));
  const before = original.events.map((e) => ({ expected: e.expected, actual: e.actual, remark: (e.remark ?? '').trim() }));
  if (JSON.stringify(rows) !== JSON.stringify(before)) edits.events = rows;
  if (form.headCountAction.trim() !== original.headCountAction.trim()) {
    edits.headCountAction = form.headCountAction.trim();
  }
  return edits;
}

function FieldHead({ htmlFor, label, counter }: { htmlFor: string; label: string; counter?: string }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <Label htmlFor={htmlFor} className="mb-0">
        {label}
      </Label>
      {counter ? <span className="text-xs tabular-nums text-text-subtle">{counter}</span> : null}
    </div>
  );
}

function ErrorLine({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-danger">
      {message}
    </p>
  );
}

export function GeneratedEditor({
  form,
  onChange,
  disabled,
  errors,
  today,
  personsPresent,
  headCountShort,
}: {
  form: GeneratedForm;
  onChange: (next: GeneratedForm) => void;
  disabled: boolean;
  errors: GeneratedErrors;
  /** The IST date now: the latest day the drill may be on. */
  today: string;
  personsPresent: number | null;
  headCountShort: number | null;
}) {
  const set = <K extends keyof GeneratedForm>(key: K, value: GeneratedForm[K]) =>
    onChange({ ...form, [key]: value });
  const setRow = (i: number, key: 'expected' | 'actual' | 'remark', value: string) =>
    onChange({ ...form, events: form.events.map((e, j) => (j === i ? { ...e, [key]: value } : e)) });
  const allClear = allClearOf(form);
  const short = headCountShort ?? 0;
  const atAssembly = personsPresent === null ? null : Math.max(personsPresent - short, 0);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <FieldHead htmlFor="md-g-date" label="Day of the drill" />
          <Input
            id="md-g-date"
            type="date"
            value={form.date}
            max={today}
            disabled={disabled}
            invalid={!!errors.date}
            aria-describedby="md-g-date-err"
            onChange={(e) => set('date', e.target.value)}
          />
          <ErrorLine id="md-g-date-err" message={errors.date} />
        </div>
        <div>
          <FieldHead htmlFor="md-g-time" label="Start time" />
          <Input
            id="md-g-time"
            type="time"
            value={form.time}
            disabled={disabled}
            invalid={!!errors.time}
            aria-describedby="md-g-time-err"
            onChange={(e) => set('time', e.target.value)}
          />
          <ErrorLine id="md-g-time-err" message={errors.time} />
        </div>
        <div>
          <FieldHead htmlFor="md-g-duration" label="Duration (minutes)" />
          <Input
            id="md-g-duration"
            inputMode="numeric"
            value={form.duration}
            disabled={disabled}
            invalid={!!errors.duration}
            aria-describedby="md-g-duration-err"
            onChange={(e) => set('duration', e.target.value)}
          />
          <ErrorLine id="md-g-duration-err" message={errors.duration} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-text-muted">
        All clear: <span className="tabular-nums text-text">{allClear ?? '—'}</span> (start plus duration, set
        for you)
      </p>

      <div>
        <FieldHead
          htmlFor="md-g-init"
          label="Initiation"
          counter={`${form.initiation.length}/${MOCK_DRILL_LIMITS.initiation}`}
        />
        <Textarea
          id="md-g-init"
          rows={2}
          value={form.initiation}
          maxLength={MOCK_DRILL_LIMITS.initiation}
          disabled={disabled}
          invalid={!!errors.initiation}
          aria-describedby="md-g-init-err"
          onChange={(e) => set('initiation', e.target.value)}
        />
        <ErrorLine id="md-g-init-err" message={errors.initiation} />
      </div>

      <div>
        <FieldHead
          htmlFor="md-g-desc"
          label="Description"
          counter={`${form.description.length}/${MOCK_DRILL_LIMITS.description}`}
        />
        <Textarea
          id="md-g-desc"
          rows={5}
          value={form.description}
          maxLength={MOCK_DRILL_LIMITS.description}
          disabled={disabled}
          invalid={!!errors.description}
          aria-describedby="md-g-desc-err"
          onChange={(e) => set('description', e.target.value)}
        />
        <ErrorLine id="md-g-desc-err" message={errors.description} />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold text-text">
          Response times{' '}
          <span className="text-xs font-normal text-text-subtle">seconds, expected and actual</span>
        </legend>
        {form.events.map((e, i) => (
          <div
            key={e.event}
            className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[minmax(0,1.4fr)_5.5rem_5.5rem_minmax(0,2fr)] sm:items-center sm:border-0 sm:p-0"
          >
            <p className="text-sm font-medium text-text">{e.event}</p>
            <Input
              aria-label={`${e.event}: expected seconds`}
              inputMode="numeric"
              placeholder="Expected"
              value={e.expected}
              disabled={disabled}
              onChange={(ev) => setRow(i, 'expected', ev.target.value)}
            />
            <Input
              aria-label={`${e.event}: actual seconds`}
              inputMode="numeric"
              placeholder="Actual"
              value={e.actual}
              disabled={disabled}
              onChange={(ev) => setRow(i, 'actual', ev.target.value)}
            />
            <Input
              aria-label={`${e.event}: remark`}
              placeholder="Remark (optional)"
              value={e.remark}
              maxLength={MOCK_DRILL_LIMITS.eventRemark}
              disabled={disabled}
              onChange={(ev) => setRow(i, 'remark', ev.target.value)}
            />
          </div>
        ))}
        <ErrorLine id="md-g-events-err" message={errors.events} />
      </fieldset>

      <div>
        <h4 className="mb-1 text-sm font-semibold text-text">Head count</h4>
        <p className="mb-2 text-sm text-text-muted">
          {personsPresent === null || atAssembly === null
            ? 'Fill in the persons present above to see the head count.'
            : `${personsPresent} present before the drill, ${atAssembly} at the assembly point, ${short} short.`}
        </p>
        <FieldHead htmlFor="md-g-action" label="Action taken to search for the shortfall" />
        <Input
          id="md-g-action"
          value={form.headCountAction}
          maxLength={MOCK_DRILL_LIMITS.headCountAction}
          disabled={disabled}
          invalid={!!errors.headCountAction}
          aria-describedby="md-g-action-err"
          onChange={(e) => set('headCountAction', e.target.value)}
        />
        <ErrorLine id="md-g-action-err" message={errors.headCountAction} />
      </div>
    </div>
  );
}
