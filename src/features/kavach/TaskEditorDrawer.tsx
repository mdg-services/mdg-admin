import * as React from 'react';

import {
  Button,
  Callout,
  Checkbox,
  Drawer,
  FieldError,
  Input,
  Label,
  Select,
  Textarea,
} from '@/components/ui';
import {
  type FieldErrors,
  type TaskFields,
  blankTaskFields,
  bodyFromFields,
  codeFromTitle,
  fieldErrorsFromApi,
  validateTaskFields,
} from '@/lib/kavachForm';
import {
  HOW_HINT,
  groupLabel,
  howLabel,
  panelLabel,
  sheetLabel,
  sourceLabel,
  uploaderLabel,
} from '@/lib/kavachWords';
import {
  KAVACH_GROUPS,
  KAVACH_HOWS,
  KAVACH_PANELS,
  KAVACH_SHEETS,
  KAVACH_SOURCES,
  KAVACH_UPLOADERS,
} from '@dk/shared';

type EveryMode = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' | 'event';

const EVERY_OPTIONS: { value: EveryMode; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month (30 days)' },
  { value: 'yearly', label: 'Every year (365 days)' },
  { value: 'custom', label: 'Every … days' },
  { value: 'event', label: 'When it happens (no clock)' },
];

function modeOf(everyDays: number | null): EveryMode {
  if (everyDays === null) return 'event';
  if (everyDays === 1) return 'daily';
  if (everyDays === 7) return 'weekly';
  if (everyDays === 30) return 'monthly';
  if (everyDays === 365) return 'yearly';
  return 'custom';
}
function daysOf(mode: EveryMode, custom: string): number | null {
  switch (mode) {
    case 'daily':
      return 1;
    case 'weekly':
      return 7;
    case 'monthly':
      return 30;
    case 'yearly':
      return 365;
    case 'event':
      return null;
    case 'custom': {
      const n = Number(custom);
      return custom.trim() === '' || !Number.isFinite(n) ? NaN : n;
    }
  }
}

export interface TaskEditorProps {
  open: boolean;
  onClose: () => void;
  heading: string;
  description?: string;
  /** The point being edited, or `null` to start a new one. */
  initial: TaskFields | null;
  /**
   * `global`: a shared point (a code is asked for when new). `own`: an outlet's
   * own point. `override`: an outlet changing a shared point — the title, group
   * and oil-company rule stay as they are.
   */
  kind: 'global' | 'own' | 'override';
  /** An existing point keeps its code. */
  fixedCode?: string;
  /** Throws (the server's `ApiError` shows inline); resolves when saved. */
  onSave: (fields: TaskFields, code: string) => Promise<void>;
  /** Extra footer button on the left, for example "Go back to the shared setting". */
  extraAction?: React.ReactNode;
}

/**
 * The editor for one point, shared by the checklist page and the dealer page.
 * Every field of the point's body is here; the server's own messages are shown
 * under the field they are about.
 */
export function TaskEditorDrawer(props: TaskEditorProps) {
  const { open, onClose, heading, description, initial, kind, fixedCode, onSave, extraAction } = props;
  const [fields, setFields] = React.useState<TaskFields>(() => initial ?? blankTaskFields());
  const [code, setCode] = React.useState(fixedCode ?? '');
  const [codeTouched, setCodeTouched] = React.useState(false);
  const [mode, setMode] = React.useState<EveryMode>(() => modeOf((initial ?? blankTaskFields()).everyDays));
  const [customDays, setCustomDays] = React.useState('');
  const [pointsText, setPointsText] = React.useState('');
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [general, setGeneral] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // `initial` is a fresh object on every render of some callers: the drawer opening is the signal.
  const startRef = React.useRef({ initial, fixedCode });
  startRef.current = { initial, fixedCode };

  // Start from the point each time the drawer opens.
  React.useEffect(() => {
    if (!open) return;
    const start = startRef.current.initial ?? blankTaskFields();
    setFields(start);
    setCode(startRef.current.fixedCode ?? '');
    setCodeTouched(false);
    setMode(modeOf(start.everyDays));
    setCustomDays(modeOf(start.everyDays) === 'custom' ? String(start.everyDays) : '');
    setPointsText(String(start.points));
    setErrors({});
    setGeneral(null);
    setSaving(false);
  }, [open]);

  const set = <K extends keyof TaskFields>(key: K, value: TaskFields[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const isNew = !initial;
  const needsCode = kind === 'global' && isNew;
  const shownCode = needsCode && !codeTouched ? codeFromTitle(fields.titleEn) : code;
  const override = kind === 'override';
  const daily = fields.everyDays === 1;

  function chooseMode(next: EveryMode) {
    setMode(next);
    const days = daysOf(next, customDays);
    setFields((f) => ({
      ...f,
      everyDays: Number.isNaN(days) ? f.everyDays : days,
      dueTime: days === 1 ? f.dueTime : null,
    }));
    setErrors((e) => ({ ...e, everyDays: undefined, dueTime: undefined }));
  }

  async function save() {
    const points = Number(pointsText);
    const days = daysOf(mode, customDays);
    const draft: TaskFields = {
      ...fields,
      points: pointsText.trim() === '' || !Number.isFinite(points) ? NaN : points,
      everyDays: days === null ? null : (days as number),
    };
    const found = validateTaskFields(draft);
    if (needsCode && !/^[a-z0-9][a-z0-9-]{2,60}$/.test(shownCode)) {
      found.code = 'Lower-case letters, digits and dashes, at least 3 characters';
    }
    setErrors(found);
    setGeneral(null);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await onSave(bodyFromFields(draft), shownCode);
    } catch (err) {
      const fromServer = fieldErrorsFromApi(err);
      if (Object.keys(fromServer).length > 0) setErrors(fromServer);
      else setGeneral(err instanceof Error ? err.message : 'That did not save. Try again.');
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  const togglePanel = (p: (typeof KAVACH_PANELS)[number], on: boolean) =>
    set('panels', on ? [...fields.panels, p] : fields.panels.filter((x) => x !== p));

  return (
    <Drawer
      open={open}
      onClose={saving ? () => {} : onClose}
      title={heading}
      description={description}
      width="md"
      footerBelow="row"
      footer={
        <>
          {extraAction}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        {general ? <Callout>{general}</Callout> : null}

        {override ? (
          <Callout intent="info">
            You are changing this point for this outlet only. The shared checklist stays as it is.
          </Callout>
        ) : null}

        {!override ? (
          <>
            <div>
              <Label htmlFor="kt-title-en" required>
                Title (English)
              </Label>
              <Input
                id="kt-title-en"
                value={fields.titleEn}
                maxLength={120}
                invalid={!!errors.titleEn}
                onChange={(e) => set('titleEn', e.target.value)}
              />
              <FieldError message={errors.titleEn} />
            </div>
            <div>
              <Label htmlFor="kt-title-hi" required>
                Title (Hindi)
              </Label>
              <Input
                id="kt-title-hi"
                lang="hi"
                value={fields.titleHi}
                maxLength={120}
                invalid={!!errors.titleHi}
                onChange={(e) => set('titleHi', e.target.value)}
              />
              <FieldError message={errors.titleHi} />
            </div>
          </>
        ) : null}

        {needsCode ? (
          <div>
            <Label htmlFor="kt-code" hint="Short, lower case. It cannot be changed later.">
              Code
            </Label>
            <Input
              id="kt-code"
              value={shownCode}
              invalid={!!errors.code}
              onChange={(e) => {
                setCodeTouched(true);
                setCode(e.target.value.toLowerCase());
                setErrors((x) => ({ ...x, code: undefined }));
              }}
            />
            <FieldError message={errors.code} />
          </div>
        ) : null}

        <div>
          <Label htmlFor="kt-how-en" hint="One or two lines. The photo must show this.">
            What to do and what to check (English)
          </Label>
          <Textarea
            id="kt-how-en"
            rows={3}
            maxLength={600}
            value={fields.howToEn}
            invalid={!!errors.howToEn}
            onChange={(e) => set('howToEn', e.target.value)}
          />
          <FieldError message={errors.howToEn} />
        </div>
        <div>
          <Label htmlFor="kt-how-hi">What to do and what to check (Hindi)</Label>
          <Textarea
            id="kt-how-hi"
            lang="hi"
            rows={3}
            maxLength={600}
            value={fields.howToHi}
            invalid={!!errors.howToHi}
            onChange={(e) => set('howToHi', e.target.value)}
          />
          <FieldError message={errors.howToHi} />
        </div>

        {!override ? (
          <div>
            <Label htmlFor="kt-group">Group</Label>
            <Select id="kt-group" value={fields.group} onChange={(e) => set('group', e.target.value as TaskFields['group'])}>
              {KAVACH_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {groupLabel(g)}
                </option>
              ))}
            </Select>
            <FieldError message={errors.group} />
          </div>
        ) : null}

        <div>
          <Label htmlFor="kt-how">How it is proven</Label>
          <Select
            id="kt-how"
            value={fields.how}
            onChange={(e) => {
              const how = e.target.value as TaskFields['how'];
              setFields((f) => ({
                ...f,
                how,
                source: how === 'data' ? f.source : null,
                sheet: how === 'sheet' ? f.sheet : null,
              }));
              setErrors((x) => ({ ...x, how: undefined, source: undefined, sheet: undefined }));
            }}
          >
            {KAVACH_HOWS.map((h) => (
              <option key={h} value={h}>
                {howLabel(h)}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-text-muted">{HOW_HINT[fields.how]}</p>
          <FieldError message={errors.how} />
        </div>

        {fields.how === 'data' ? (
          <div>
            <Label htmlFor="kt-source" required>
              Where we read it from
            </Label>
            <Select
              id="kt-source"
              value={fields.source ?? ''}
              invalid={!!errors.source}
              onChange={(e) => set('source', (e.target.value || null) as TaskFields['source'])}
            >
              <option value="">Pick one…</option>
              {KAVACH_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {sourceLabel(s)}
                </option>
              ))}
            </Select>
            <FieldError message={errors.source} />
          </div>
        ) : null}

        {fields.how === 'sheet' ? (
          <div>
            <Label htmlFor="kt-sheet" required>
              The sheet MDG makes
            </Label>
            <Select
              id="kt-sheet"
              value={fields.sheet ?? ''}
              invalid={!!errors.sheet}
              onChange={(e) => set('sheet', (e.target.value || null) as TaskFields['sheet'])}
            >
              <option value="">Pick one…</option>
              {KAVACH_SHEETS.map((s) => (
                <option key={s} value={s}>
                  {sheetLabel(s)}
                </option>
              ))}
            </Select>
            <FieldError message={errors.sheet} />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="kt-uploader">Who sends it</Label>
            <Select
              id="kt-uploader"
              value={fields.uploader}
              disabled={fields.how === 'data'}
              onChange={(e) => set('uploader', e.target.value as TaskFields['uploader'])}
            >
              {KAVACH_UPLOADERS.map((u) => (
                <option key={u} value={u}>
                  {uploaderLabel(u)}
                </option>
              ))}
            </Select>
            <FieldError message={errors.uploader} />
          </div>
          <div>
            <Label htmlFor="kt-points" required>
              Points
            </Label>
            <Input
              id="kt-points"
              inputMode="numeric"
              value={pointsText}
              invalid={!!errors.points}
              onChange={(e) => {
                setPointsText(e.target.value.replace(/[^\d]/g, ''));
                setErrors((x) => ({ ...x, points: undefined }));
              }}
            />
            <FieldError message={errors.points} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={mode === 'custom' ? '' : 'col-span-2'}>
            <Label htmlFor="kt-every">How often</Label>
            <Select id="kt-every" value={mode} onChange={(e) => chooseMode(e.target.value as EveryMode)}>
              {EVERY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <FieldError message={mode !== 'custom' ? errors.everyDays : undefined} />
          </div>
          {mode === 'custom' ? (
            <div>
              <Label htmlFor="kt-days">Days</Label>
              <Input
                id="kt-days"
                inputMode="numeric"
                value={customDays}
                invalid={!!errors.everyDays}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, '');
                  setCustomDays(v);
                  setFields((f) => ({ ...f, everyDays: v === '' ? f.everyDays : Number(v), dueTime: null }));
                  setErrors((x) => ({ ...x, everyDays: undefined }));
                }}
              />
              <FieldError message={errors.everyDays} />
            </div>
          ) : null}
        </div>
        {fields.everyDays === null ? (
          <p className="-mt-2 text-xs text-text-muted">
            No clock and not in the percentage. The outlet sends it from the Kavach tab when it happens.
          </p>
        ) : null}

        {daily ? (
          <div>
            <Label htmlFor="kt-due" hint="Late after this time (IST). Leave empty for end of day.">
              Due time
            </Label>
            <Input
              id="kt-due"
              type="time"
              value={fields.dueTime ?? ''}
              invalid={!!errors.dueTime}
              onChange={(e) => set('dueTime', e.target.value || null)}
            />
            <FieldError message={errors.dueTime} />
          </div>
        ) : null}

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-text">Data the reviewer sees beside the photo</legend>
          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            {KAVACH_PANELS.map((p) => (
              <Checkbox
                key={p}
                label={panelLabel(p)}
                checked={fields.panels.includes(p)}
                onChange={(e) => togglePanel(p, e.target.checked)}
              />
            ))}
          </div>
          <FieldError message={errors.panels} />
        </fieldset>

        <Checkbox
          label="A PDF is accepted as well as a photo"
          checked={fields.acceptsFile}
          onChange={(e) => set('acceptsFile', e.target.checked)}
        />
        {!override ? (
          <Checkbox
            label="Only for IndianOil outlets"
            hint="Work on the IndianOil portal. Hidden for other oil companies."
            checked={fields.iocOnly}
            onChange={(e) => set('iocOnly', e.target.checked)}
          />
        ) : null}
      </form>
    </Drawer>
  );
}
