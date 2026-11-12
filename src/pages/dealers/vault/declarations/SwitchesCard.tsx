import * as React from 'react';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Checkbox,
  Input,
  Label,
  Textarea,
} from '@/components/ui';
import type { DeclarationsConfigView } from '@dk/shared';
import type { DeclarationsConfigBody } from '@dk/shared/schemas';

import { parseEveryDays } from './format';

/** Longest words the portal's boxes are given: the same limits the server holds. */
const FEEDBACK_MAX = 500;
const PLACE_MAX = 80;

/**
 * One setting that is typed, not ticked: a draft the admin edits and a Save
 * button that stays off until the draft is a real change. The draft follows the
 * saved value, so a change made elsewhere shows up here.
 */
function TextSetting({
  id,
  label,
  hint,
  saved,
  maxLength,
  multiline,
  placeholder,
  disabled,
  onSave,
}: {
  id: string;
  label: string;
  hint: string;
  /** What is stored now, as the box shows it. */
  saved: string;
  maxLength: number;
  multiline?: boolean;
  placeholder?: string;
  disabled: boolean;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = React.useState(saved);
  React.useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const dirty = draft.trim() !== saved.trim();

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="grid gap-2 md:grid-cols-[1fr_max-content] md:items-start">
        {multiline ? (
          <Textarea
            id={id}
            rows={2}
            value={draft}
            maxLength={maxLength}
            disabled={disabled}
            placeholder={placeholder}
            aria-describedby={`${id}-hint`}
            onChange={(e) => setDraft(e.target.value)}
          />
        ) : (
          <Input
            id={id}
            value={draft}
            maxLength={maxLength}
            disabled={disabled}
            placeholder={placeholder}
            aria-describedby={`${id}-hint`}
            onChange={(e) => setDraft(e.target.value)}
          />
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || !dirty}
          onClick={() => onSave(draft.trim())}
        >
          Save
        </Button>
      </div>
      <p id={`${id}-hint`} className="mt-1 text-xs text-text-subtle">
        {hint}
      </p>
    </div>
  );
}

/**
 * The attachment's switches and limits, edited in place. Each change is sent on
 * its own and rolls back if the server refuses it.
 */
export function SwitchesCard({
  config,
  disabled,
  onChange,
}: {
  config: DeclarationsConfigView;
  disabled: boolean;
  onChange: (patch: DeclarationsConfigBody) => void;
}) {
  const [daysDraft, setDaysDraft] = React.useState(String(config.washroomEveryDays));
  React.useEffect(() => {
    setDaysDraft(String(config.washroomEveryDays));
  }, [config.washroomEveryDays]);
  const days = parseEveryDays(daysDraft);
  const daysDirty = daysDraft.trim() !== String(config.washroomEveryDays);

  return (
    <Card>
      <CardHeader padding="comfortable" align="center">
        <div className="min-w-0">
          <CardTitle>Settings</CardTitle>
          <CardSubtitle>These apply to this outlet only.</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Checkbox
          align="start"
          checked={config.safetyDaily}
          disabled={disabled}
          onChange={(e) => onChange({ safetyDaily: e.target.checked })}
          label="File the safety declaration every day"
          hint={
            config.safetyDaily
              ? 'Every day MDG ticks every box and files it as the outlet’s own declaration. Switch off if this outlet has not agreed to that.'
              : 'The safety declaration is not filed by itself. Use File now on its card when you want one.'
          }
        />
        <Checkbox
          align="start"
          checked={config.washroomAuto}
          disabled={disabled}
          onChange={(e) => onChange({ washroomAuto: e.target.checked })}
          label="File the washroom declaration by itself"
          hint={
            config.washroomAuto
              ? 'Once both photos are in, MDG files it on the next round.'
              : 'Photos are collected, but nothing is filed until someone presses File now.'
          }
        />
        <Checkbox
          align="start"
          checked={config.standardAuto}
          disabled={disabled}
          onChange={(e) => onChange({ standardAuto: e.target.checked })}
          label="Fill the MDG and Customer Service Standard by itself"
          hint={
            config.standardAuto
              ? 'If the form is empty on the portal, MDG answers Yes and submits it. It is needed once in 7 to 8 years.'
              : 'An empty form becomes a task for an admin instead.'
          }
        />

        <div>
          <Label htmlFor="decl-every-days">Washroom every how many days</Label>
          <div className="grid gap-2 md:grid-cols-[8rem_max-content] md:items-start">
            <Input
              id="decl-every-days"
              inputMode="numeric"
              value={daysDraft}
              disabled={disabled}
              invalid={daysDirty && !!days.error}
              aria-describedby="decl-every-days-hint"
              onChange={(e) => setDaysDraft(e.target.value)}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || !daysDirty || days.value === null}
              onClick={() => {
                if (days.value !== null) onChange({ washroomEveryDays: days.value });
              }}
            >
              Save
            </Button>
          </div>
          {daysDirty && days.error ? (
            <p className="mt-1 text-xs text-danger">{days.error}</p>
          ) : null}
          <p id="decl-every-days-hint" className="mt-1 text-xs text-text-subtle">
            Counted from the day it was actually filed, so it drifts later, never earlier. Usually 7.
          </p>
        </div>

        <TextSetting
          id="decl-feedback"
          label="Words for IndianOil’s feedback box"
          hint="Put in the feedback box on the safety and washroom pages. NA means not applicable. Leave it empty to send nothing."
          saved={config.feedbackText}
          maxLength={FEEDBACK_MAX}
          multiline
          disabled={disabled}
          onSave={(text) => onChange({ feedbackText: text })}
        />
        <TextSetting
          id="decl-place"
          label="Place of declaration"
          hint="Put in IndianOil’s Place of declaration box. Leave it empty to use the outlet’s city, then its site name, then what the portal shows."
          saved={config.placeOfDeclaration ?? ''}
          maxLength={PLACE_MAX}
          placeholder="The outlet’s city"
          disabled={disabled}
          onSave={(text) => onChange({ placeOfDeclaration: text === '' ? null : text })}
        />
      </CardContent>
    </Card>
  );
}
