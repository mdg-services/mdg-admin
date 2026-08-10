import Form from '@rjsf/core';
import { getDefaultFormState, type RJSFSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import * as React from 'react';

import { Button, FieldError, Input, Label, Select } from '@/components/ui';
import { CADENCES, type Cadence } from '@dk/shared';
import { cronSchema } from '@dk/shared/schemas';

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
 * Every character a cron field can legally hold: digits, the wildcard/range
 * punctuation, `?`/`L`/`W`/`#` for the day fields, and letters for the JAN/MON
 * style names.
 */
const CRON_FIELD = /^[0-9A-Za-z*,\-/?#LW]+$/;

/**
 * Client-side cron check. Returns undefined when the value is usable — an empty
 * string included, since that just means "no custom cron".
 *
 * Worth doing because nothing downstream will complain: the shared `cronSchema`
 * only counts fields, and the backend's `nextRunFor` swallows a cron it cannot
 * parse and returns null. A garbled expression is therefore accepted, stored,
 * and leaves the row with no `nextRunAt` — the service silently never runs
 * again. Catching the obvious typos here (and warning after a save that
 * produced no next run) is the whole defence against that.
 */
export function customCronError(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const parsed = cronSchema.safeParse(value);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? 'Invalid cron expression';
  }
  const fields = parsed.data.split(/\s+/);
  const bad = fields.findIndex((f) => !CRON_FIELD.test(f));
  if (bad >= 0) {
    return `Field ${bad + 1} (“${fields[bad]}”) is not a valid cron field.`;
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
  customCron: string;
  onCustomCronChange: (next: string) => void;
  /** Shown under the cron input; the caller blocks its own submit on it. */
  cronError?: string;
  /** Extra note under the cron input, e.g. what this flow cannot do. */
  cronNote?: React.ReactNode;
  /** When given, a "Remove custom cron" button appears while a cron is set. */
  onCronClear?: () => void;
  /**
   * Shown instead of the generated form when `schema` is null. Defaults to
   * "the plugin isn't in the catalog" — which is only true when the caller
   * actually read the catalog, so a caller whose catalog query failed must
   * pass its own wording rather than let this one blame the registry.
   */
  noSchemaNote?: React.ReactNode;
}

/**
 * The cadence / custom cron / plugin-config trio, shared by the attach and the
 * edit dialog so the cadence list and the RJSF styling have one definition. The
 * flows differ only in which cadence options they offer and which notes hang
 * under the cron input, both passed in.
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
  cronNote,
  onCronClear,
  noSchemaNote,
}: ServiceConfigFieldsProps) {
  const cadenceId = `${idPrefix}-cadence`;
  const cronId = `${idPrefix}-customCron`;
  const cronNotesId = `${idPrefix}-customCron-notes`;
  const hasCron = customCron.trim().length > 0;
  // A custom cron wins over the cadence in `nextRunFor` — the cron branch
  // returns before the cadence switch is ever reached — so while one is set the
  // cadence is a label and nothing more. Say so for every cadence, not just the
  // ON_DEMAND spelling of it: picking MONTHLY over a weekly cron changes the
  // badge in the list and not one thing about when the service fires.
  const overrideNote = !hasCron
    ? null
    : cadence === 'ON_DEMAND'
      ? 'A custom cron overrides “on demand” — the scheduler will run this service on it.'
      : 'A custom cron overrides the cadence — the schedule follows the cron, not the cadence above.';
  const hasNotes = !!overrideNote || !!cronNote;

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor={cadenceId}>Cadence</Label>
          <Select
            id={cadenceId}
            value={cadence}
            onChange={(e) => onCadenceChange(e.target.value as CadenceChoice)}
          >
            {cadenceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {cadence === 'ON_DEMAND' && !hasCron ? (
            <p className="mt-1 text-xs text-text-subtle">
              No timer — it runs only when someone presses Run now.
            </p>
          ) : null}
        </div>
        <div>
          <Label htmlFor={cronId} hint="(optional)">
            Custom cron
          </Label>
          <Input
            id={cronId}
            className="font-mono"
            placeholder="0 9 * * 1"
            value={customCron}
            invalid={!!cronError}
            aria-invalid={cronError ? true : undefined}
            aria-describedby={hasNotes ? cronNotesId : undefined}
            onChange={(e) => onCustomCronChange(e.target.value)}
          />
          <FieldError message={cronError} />
          {hasNotes ? (
            <div
              id={cronNotesId}
              className="mt-1 grid gap-1 text-xs text-text-subtle"
            >
              {overrideNote ? <p>{overrideNote}</p> : null}
              {cronNote ? <p>{cronNote}</p> : null}
            </div>
          ) : null}
          {onCronClear && hasCron ? (
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={onCronClear}
            >
              Remove custom cron
            </Button>
          ) : null}
        </div>
      </div>

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
              uiSchema={{ 'ui:submitButtonOptions': { norender: true } }}
            />
          </RJSFContainer>
        ) : (
          <p className="text-sm text-text-muted">
            {noSchemaNote ??
              'This plugin is not in the catalog, so its config form cannot be generated. The cadence and cron can still be changed.'}
          </p>
        )}
      </div>
    </>
  );
}

/**
 * Light-touch styling for RJSF. We rely on default markup, but make labels
 * and inputs visually consistent with the rest of the app.
 */
function RJSFContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="rjsf [&_label]:text-sm [&_label]:font-medium [&_label]:text-text [&_input]:h-11 md:[&_input]:h-9 [&_input]:w-full [&_input]:rounded-sm [&_input]:border [&_input]:border-border-strong [&_input]:bg-surface [&_input]:px-3 [&_input]:text-sm [&_textarea]:w-full [&_textarea]:rounded-sm [&_textarea]:border [&_textarea]:border-border-strong [&_textarea]:bg-surface [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-sm [&_select]:h-11 md:[&_select]:h-9 [&_select]:w-full [&_select]:rounded-sm [&_select]:border [&_select]:border-border-strong [&_select]:bg-surface [&_select]:px-2 [&_select]:text-sm [&_.field]:mb-3 [&_.field-description]:text-xs [&_.field-description]:text-text-subtle [&_.error-detail]:text-xs [&_.error-detail]:text-danger">
      {children}
    </div>
  );
}
