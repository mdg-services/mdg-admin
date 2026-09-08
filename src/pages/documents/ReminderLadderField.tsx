import { BellOff, BellRing } from 'lucide-react';
import * as React from 'react';

import {
  Callout,
  ConfirmDialog,
  Input,
  Label,
  SegmentedControl,
} from '@/components/ui';
import {
  DOCUMENT_REMINDER_OFFSETS_MAX,
  formatReminderLadder,
  parseReminderLadder,
  type ReminderLadderParse,
} from '@dk/shared';

import { cadenceSentence } from './format';

/**
 * THE REMINDER LADDER, EDITED SO THAT SILENCE CANNOT HAPPEN BY ACCIDENT.
 *
 * An empty ladder means NEVER REMIND. That is a real setting somebody wants —
 * for the one certificate a dealer has already said is being replaced, or for a
 * kind MDG chases by hand — and `nextDocumentReminder` honours it completely,
 * lapsed notice included. It is also, if this control is built the obvious way,
 * what happens when somebody selects the contents of a text box in order to
 * retype them and then closes the drawer. The two must not be the same gesture.
 *
 * So the ladder is not a text box. It is a MODE plus a text box:
 *
 *  - "Remind" — the steps live in the field, and an EMPTY field is an ERROR
 *    ("type at least one step"), never a silent `[]`. `parseReminderLadder`
 *    refuses the empty string for exactly this reason, where
 *    `normaliseReminderOffsets` — which is total by design and must stay that
 *    way for reading old rows — returns `[]`. The two are a pair: one guards the
 *    keyboard, the other guards the database.
 *  - "Never remind" — chosen by name, confirmed in a dialog that states what
 *    stops, and then shown as a standing warning for as long as it is set.
 *
 * The confirm fires only when the setting is actually CHANGING to silence. A
 * drawer opened on a paper that is already silent does not interrogate somebody
 * about a decision they made last week.
 *
 * Used by both the per-paper drawer and the per-kind catalog editor, so the two
 * cannot come to disagree about what an empty box means — which is the whole
 * failure this component exists to prevent.
 */

export type LadderMode = 'remind' | 'never';

export interface ReminderLadderValue {
  mode: LadderMode;
  /** The steps as typed. Only meaningful while `mode === 'remind'`. */
  text: string;
}

/** The stored ladder as this control edits it. `[]` opens in the silent mode. */
export function ladderValueFrom(offsets: readonly number[]): ReminderLadderValue {
  return offsets.length === 0
    ? { mode: 'never', text: '' }
    : { mode: 'remind', text: formatReminderLadder(offsets) };
}

/**
 * The control's value as the API takes it.
 *
 * `never` is the ONLY path to `[]`, which is the invariant this whole module
 * exists to hold.
 */
export function ladderValueToOffsets(value: ReminderLadderValue): ReminderLadderParse {
  if (value.mode === 'never') return { offsets: [], error: null };
  return parseReminderLadder(value.text);
}

export interface ReminderLadderFieldProps {
  id: string;
  value: ReminderLadderValue;
  onChange: (next: ReminderLadderValue) => void;
  disabled?: boolean;
  /**
   * What goes silent, named — "this Fire NOC for 15E", "every Fire NOC". The
   * consequence line is worthless if it does not say whose reminders stop.
   */
  subject: string;
  /**
   * The ladder that applies when this one is left alone, in words. Shown under
   * the field on a per-PAPER editor, where "inherits its kind's 30, 15, 7, 3, 1"
   * is the fact somebody needs before deciding to override it.
   */
  inherited?: string;
  /** A validation message from the parent's submit, shown under the field. */
  error?: string | null;
}

export function ReminderLadderField({
  id,
  value,
  onChange,
  disabled = false,
  subject,
  inherited,
  error,
}: ReminderLadderFieldProps) {
  const [confirmSilence, setConfirmSilence] = React.useState(false);

  // Typed as the person types, so the preview under the box moves with them and
  // a bad character is named before they press anything.
  const parsed = value.mode === 'remind' ? parseReminderLadder(value.text) : null;
  const liveError = error ?? (value.text.trim() === '' ? null : parsed?.error) ?? null;

  function pickMode(next: LadderMode): void {
    if (next === value.mode) return;
    if (next === 'never') {
      // Confirmed, always, when moving INTO silence. Moving out of it needs no
      // ceremony — turning reminders back on cannot lose anybody anything.
      setConfirmSilence(true);
      return;
    }
    onChange({ mode: 'remind', text: value.text });
  }

  return (
    <div>
      <Label htmlFor={id}>Reminder ladder</Label>
      <SegmentedControl
        aria-label="Whether to remind about this at all"
        value={value.mode}
        onChange={pickMode}
        options={[
          {
            value: 'remind',
            label: 'Remind',
            icon: <BellRing width={14} height={14} strokeWidth={1.75} />,
          },
          {
            value: 'never',
            label: 'Never remind',
            icon: <BellOff width={14} height={14} strokeWidth={1.75} />,
          },
        ]}
        className="mb-2"
      />

      {value.mode === 'remind' ? (
        <>
          <Input
            id={id}
            value={value.text}
            disabled={disabled}
            inputMode="numeric"
            placeholder="15, 3, 2, 1"
            aria-describedby={`${id}-help`}
            invalid={Boolean(liveError)}
            onChange={(e) => onChange({ mode: 'remind', text: e.target.value })}
          />
          <p id={`${id}-help`} className="mt-1 text-xs text-text-muted">
            Days BEFORE the date it runs out, biggest first. Up to{' '}
            {DOCUMENT_REMINDER_OFFSETS_MAX} steps, none more than a year out. Zero means the day
            it runs out.
          </p>
          {parsed?.offsets ? (
            // What WILL happen, in the same words the table prints, so the box
            // and the row can never read as two different settings.
            <p className="mt-1 text-xs text-text-subtle">
              {subject} will be chased {cadenceSentence(parsed.offsets).toLowerCase()}.
            </p>
          ) : null}
        </>
      ) : (
        <Callout intent="warning">
          Nothing will be sent about {subject} — not the countdown, and not the notice on the
          day it runs out. It will still show as expired on this screen.
        </Callout>
      )}

      {inherited ? (
        <p className="mt-1 text-xs text-text-subtle">Without an override: {inherited}.</p>
      ) : null}
      {liveError ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {liveError}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmSilence}
        onCancel={() => setConfirmSilence(false)}
        onConfirm={() => {
          setConfirmSilence(false);
          onChange({ mode: 'never', text: '' });
        }}
        title="Stop reminding about this?"
        confirmLabel="Yes, stop reminding"
        cancelLabel="Keep the reminders"
        description={
          <span>
            No countdown will go out for {subject}, and no notice on the day it runs out either.
            It will still appear here as expired once the date passes — but nobody will be told.
          </span>
        }
      />
    </div>
  );
}
