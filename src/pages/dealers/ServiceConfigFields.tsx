import Form from '@rjsf/core';
import { getDefaultFormState, type RJSFSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { AlertTriangle } from 'lucide-react';
import * as React from 'react';

import { FieldError, Input, Label, Select } from '@/components/ui';
import { CADENCES, type Cadence } from '@dk/shared';
import { cronSchema } from '@dk/shared/schemas';

import { RJSF_TEMPLATES, RJSF_WIDGETS } from './rjsfTheme';
import {
  buildCron,
  DEFAULT_PARTS,
  describePickerSchedule,
  isTimedCadence,
  MONTHS,
  parseCron,
  partsToTimeValue,
  timeValueToParts,
  WEEKDAYS,
  type ScheduleParts,
} from './schedulePicker';

/**
 * `''` means "send no cadence at all". Only the attach POST can express that —
 * the server falls back to `reg.plugin.cadence` when the field is missing.
 * PATCH has no such fallback, so the edit dialog never uses this value.
 */
export type CadenceChoice = '' | Cadence;

export interface CadenceOption {
  value: CadenceChoice;
  label: string;
}

const CADENCE_LABELS: Record<Cadence, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
  ON_DEMAND: 'On demand',
};

/** Attach: "Plugin default" omits `cadence` from the body. */
export const ATTACH_CADENCE_OPTIONS: CadenceOption[] = [
  { value: '', label: 'Plugin default' },
  ...CADENCES.map((c) => ({ value: c, label: CADENCE_LABELS[c] })),
];

/**
 * Edit: the same list WITHOUT a "Plugin default" entry.
 *
 * PATCH /dealer-services/:dsId cannot unset a field — omitting `cadence` means
 * "leave it alone", not "go back to the plugin's". A "Plugin default" entry
 * here could therefore only resolve itself client-side and write today's
 * catalog value into the row, which would read as "tracks the plugin" while
 * actually freezing a copy of it. Instead the plugin's own cadence is labelled
 * in the list, so an admin who wants it picks it knowing exactly what is sent.
 */
export function editCadenceOptions(pluginDefault?: Cadence): CadenceOption[] {
  return CADENCES.map((c) => ({
    value: c,
    label:
      c === pluginDefault
        ? `${CADENCE_LABELS[c]} (plugin default)`
        : CADENCE_LABELS[c],
  }));
}

/**
 * Client-side check on the cron the picker builds. Returns undefined when the
 * value is usable — an empty string included, since that just means "no schedule
 * override". The picker only ever emits well-formed crons, so this now mostly
 * guards a legacy stored expression the admin has chosen to keep; it stays
 * because the backend's `nextRunFor` swallows a cron it cannot parse and leaves
 * the row with no `nextRunAt`, so a garbled legacy value would otherwise be
 * accepted and the service would silently never run.
 */
export function customCronError(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const parsed = cronSchema.safeParse(value);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? 'Invalid cron expression';
  }
  return undefined;
}

/**
 * A config with the plugin schema's defaults filled in, exactly as the form
 * below will hold it.
 *
 * RJSF does this to `formData` itself: its constructor (and every later
 * `formData` prop change) runs the value through `getDefaultFormState` and, if
 * that added anything, immediately calls `onChange` with the enriched object.
 * So a row stored before a defaulted key existed gets that key the moment the
 * form mounts, with nobody having touched a field. Anything comparing "what the
 * form holds" against "what is stored" has to compare against this, or it
 * reports an edit the admin never made.
 */
export function withSchemaDefaults(
  schema: Record<string, unknown> | null,
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (!schema) return config;
  const rjsfSchema = schema as RJSFSchema;
  return (getDefaultFormState(validator, rjsfSchema, config, rjsfSchema) ??
    {}) as Record<string, unknown>;
}

export interface ServiceConfigFieldsProps {
  /** Prefix for the field ids; must be unique among mounted dialogs. */
  idPrefix: string;
  /** The plugin's `defaultConfigSchema`. Null when it isn't in the catalog. */
  schema: Record<string, unknown> | null;
  config: Record<string, unknown>;
  onConfigChange: (next: Record<string, unknown>) => void;
  cadence: CadenceChoice;
  cadenceOptions: CadenceOption[];
  onCadenceChange: (next: CadenceChoice) => void;
  /** The cron the schedule picker builds (or a kept legacy expression). */
  customCron: string;
  onCustomCronChange: (next: string) => void;
  /** Shown under the picker; the caller blocks its own submit on it. */
  cronError?: string;
  /**
   * A dependency/timing advisory shown under the picker (warning-styled), e.g.
   * the DSR needing IRAS attached and scheduled earlier. Advisory only — it does
   * not block submit. The caller computes it (it is service-specific).
   */
  scheduleWarning?: React.ReactNode;
  /**
   * Shown instead of the generated form when `schema` is null. Defaults to
   * "the plugin isn't in the catalog" — which is only true when the caller
   * actually read the catalog, so a caller whose catalog query failed must
   * pass its own wording rather than let this one blame the registry.
   */
  noSchemaNote?: React.ReactNode;
}

/**
 * The cadence / schedule / plugin-config trio, shared by the attach and the edit
 * dialog so the cadence list, the schedule picker and the RJSF styling have one
 * definition. The flows differ only in which cadence options they offer, passed
 * in.
 */
export function ServiceConfigFields({
  idPrefix,
  schema,
  config,
  onConfigChange,
  cadence,
  cadenceOptions,
  onCadenceChange,
  customCron,
  onCustomCronChange,
  cronError,
  scheduleWarning,
  noSchemaNote,
}: ServiceConfigFieldsProps) {
  return (
    <>
      <ScheduleFields
        idPrefix={idPrefix}
        cadence={cadence}
        cadenceOptions={cadenceOptions}
        onCadenceChange={onCadenceChange}
        customCron={customCron}
        onCustomCronChange={onCustomCronChange}
        cronError={cronError}
        scheduleWarning={scheduleWarning}
      />

      <div className="rounded-md border border-border bg-surface p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Config
        </p>
        {schema ? (
          <RJSFContainer>
            <Form
              schema={schema as RJSFSchema}
              validator={validator}
              formData={config}
              onChange={(e) =>
                onConfigChange((e.formData ?? {}) as Record<string, unknown>)
              }
              liveValidate
              showErrorList={false}
              templates={RJSF_TEMPLATES}
              widgets={RJSF_WIDGETS}
              uiSchema={{ 'ui:submitButtonOptions': { norender: true } }}
            />
          </RJSFContainer>
        ) : (
          <p className="text-sm text-text-muted">
            {noSchemaNote ??
              'This plugin is not in the catalog, so its config form cannot be generated. The cadence and schedule can still be changed.'}
          </p>
        )}
      </div>
    </>
  );
}

interface ScheduleFieldsProps {
  idPrefix: string;
  cadence: CadenceChoice;
  cadenceOptions: CadenceOption[];
  onCadenceChange: (next: CadenceChoice) => void;
  customCron: string;
  onCustomCronChange: (next: string) => void;
  cronError?: string;
  scheduleWarning?: React.ReactNode;
}

/**
 * Cadence + a friendly IST time / weekday / date picker that stands in for a raw
 * cron. Everything is derived from `customCron` (parsed each render), so there is
 * no local state to drift: the picker reads the current cron, and each change
 * rebuilds and emits a new one. It never emits on mount, so opening the edit
 * dialog on a row leaves its schedule untouched until the admin actually picks
 * something — which is what keeps "Save changes only what I touched" honest.
 */
function ScheduleFields({
  idPrefix,
  cadence,
  cadenceOptions,
  onCadenceChange,
  customCron,
  onCustomCronChange,
  cronError,
  scheduleWarning,
}: ScheduleFieldsProps) {
  const cadenceId = `${idPrefix}-cadence`;

  const parsed = parseCron(customCron);
  const parts: ScheduleParts = parsed?.parts ?? DEFAULT_PARTS;
  const hasCron = customCron.trim().length > 0;
  // A cron is set but is not one of the shapes the picker can display — a legacy
  // raw expression. Show it read-only so the admin knows what is there; picking
  // anything below replaces it.
  const legacy = hasCron && !parsed;

  const timed = isTimedCadence(cadence);

  function emit(next: ScheduleParts) {
    if (isTimedCadence(cadence)) onCustomCronChange(buildCron(cadence, next));
  }

  function handleCadence(next: CadenceChoice) {
    onCadenceChange(next);
    // Keep the cron in step with the cadence the moment it changes: a timed
    // cadence gets a matching cron (reusing whatever time is already chosen); a
    // non-timed one (On demand / Plugin default) drops the cron entirely.
    if (isTimedCadence(next)) onCustomCronChange(buildCron(next, parts));
    else onCustomCronChange('');
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor={cadenceId}>How often</Label>
          <Select
            id={cadenceId}
            value={cadence}
            onChange={(e) => handleCadence(e.target.value as CadenceChoice)}
          >
            {cadenceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        {timed ? (
          <div className="grid gap-3">
            {cadence === 'WEEKLY' ? (
              <div>
                <Label htmlFor={`${idPrefix}-weekday`}>On</Label>
                <Select
                  id={`${idPrefix}-weekday`}
                  value={String(parts.weekday)}
                  onChange={(e) =>
                    emit({ ...parts, weekday: Number(e.target.value) })
                  }
                >
                  {WEEKDAYS.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            {cadence === 'YEARLY' ? (
              <div>
                <Label htmlFor={`${idPrefix}-month`}>Month</Label>
                <Select
                  id={`${idPrefix}-month`}
                  value={String(parts.month)}
                  onChange={(e) =>
                    emit({ ...parts, month: Number(e.target.value) })
                  }
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            {cadence === 'MONTHLY' || cadence === 'YEARLY' ? (
              <div>
                <Label htmlFor={`${idPrefix}-monthday`}>Day of month</Label>
                <Select
                  id={`${idPrefix}-monthday`}
                  value={String(parts.monthday)}
                  onChange={(e) =>
                    emit({ ...parts, monthday: Number(e.target.value) })
                  }
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            <div>
              <Label htmlFor={`${idPrefix}-time`}>Time (IST)</Label>
              <Input
                id={`${idPrefix}-time`}
                type="time"
                value={partsToTimeValue(parts)}
                onChange={(e) => {
                  const t = timeValueToParts(e.target.value);
                  if (t) emit({ ...parts, ...t });
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* One plain sentence telling the admin exactly when it fires. */}
      <ScheduleHint
        cadence={cadence}
        parts={parts}
        hasCron={hasCron}
        legacy={legacy}
        legacyCron={customCron.trim()}
      />
      <FieldError message={cronError} />

      {/* Advisory only (e.g. the DSR needing IRAS attached / scheduled earlier).
          role=alert so its appearance/changes are announced as the admin edits. */}
      {scheduleWarning ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-warning bg-warning-soft px-3 py-2 text-xs font-medium text-warning"
        >
          <AlertTriangle
            width={14}
            height={14}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0"
            aria-hidden
          />
          <span>{scheduleWarning}</span>
        </div>
      ) : null}
    </div>
  );
}

function ScheduleHint({
  cadence,
  parts,
  hasCron,
  legacy,
  legacyCron,
}: {
  cadence: CadenceChoice;
  parts: ScheduleParts;
  hasCron: boolean;
  legacy: boolean;
  legacyCron: string;
}) {
  if (legacy) {
    return (
      <p className="text-xs text-warning">
        This service runs on a custom schedule (
        <code className="font-mono">{legacyCron}</code>) that can’t be shown
        here. Pick an option above to replace it.
      </p>
    );
  }
  if (cadence === 'ON_DEMAND') {
    return (
      <p className="text-xs text-text-subtle">
        No timer — it runs only when someone presses Run now.
      </p>
    );
  }
  if (cadence === '') {
    return (
      <p className="text-xs text-text-subtle">
        Uses the plugin’s own cadence and time. Pick a specific option to set
        exactly when it runs.
      </p>
    );
  }
  if (isTimedCadence(cadence) && !hasCron) {
    return (
      <p className="text-xs text-text-subtle">
        Currently on the plugin’s default schedule — pick a time to set exactly
        when it runs.
      </p>
    );
  }
  if (isTimedCadence(cadence)) {
    return (
      <p className="text-xs text-text-muted">{describePickerSchedule(cadence, parts)}</p>
    );
  }
  return null;
}

/**
 * Light-touch styling for RJSF. We rely on default markup, but make labels
 * and inputs visually consistent with the rest of the app.
 *
 * The input rules are scoped away from checkboxes and radios. `[&_input]` also
 * matches `input[type="checkbox"]`, and Blink honours width and height on one —
 * so three attachable plugins that declare a boolean (IRAS shift data,
 * TT density, water-ingress testing) drew that field as a full-width, 44px-tall
 * bordered rectangle with no visible checked state and a label sitting apart
 * from it. Booleans now come through `rjsfTheme`'s `CheckboxWidget` instead, and
 * the selectors below only have to describe text, number, textarea and select.
 *
 * `text-sm` is also now `md:` only. `index.css` floors every `input`,
 * `textarea` and `select` at 16px against iOS focus-zoom, but that is a bare
 * element rule (0,0,1) and an arbitrary `[&_input]:text-sm` compiles to a
 * class-plus-element descendant selector (0,1,1) — so it won every time, at
 * every width, and every generated field rendered at 14px. Below md the floor
 * now holds; `md:` restores today's desktop density, exactly as `Input`,
 * `Select` and `Textarea` themselves do.
 */
function RJSFContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="rjsf [&_label]:text-sm [&_label]:font-medium [&_label]:text-text [&_input:not([type=checkbox]):not([type=radio])]:h-11 md:[&_input:not([type=checkbox]):not([type=radio])]:h-9 [&_input:not([type=checkbox]):not([type=radio])]:w-full [&_input:not([type=checkbox]):not([type=radio])]:rounded-sm [&_input:not([type=checkbox]):not([type=radio])]:border [&_input:not([type=checkbox]):not([type=radio])]:border-border-strong [&_input:not([type=checkbox]):not([type=radio])]:bg-surface [&_input:not([type=checkbox]):not([type=radio])]:px-3 md:[&_input:not([type=checkbox]):not([type=radio])]:text-sm [&_textarea]:w-full [&_textarea]:rounded-sm [&_textarea]:border [&_textarea]:border-border-strong [&_textarea]:bg-surface [&_textarea]:px-3 [&_textarea]:py-2 md:[&_textarea]:text-sm [&_select]:h-11 md:[&_select]:h-9 [&_select]:w-full [&_select]:rounded-sm [&_select]:border [&_select]:border-border-strong [&_select]:bg-surface [&_select]:px-2 md:[&_select]:text-sm [&_.field]:mb-3 [&_.field-description]:text-xs [&_.field-description]:text-text-subtle [&_.error-detail]:text-xs [&_.error-detail]:text-danger">
      {children}
    </div>
  );
}
