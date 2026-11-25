import { ApiError } from '@/lib/api';
import type { KavachTaskDef, KavachTaskOverride } from '@dk/shared';
import type { KavachTaskBody } from '@dk/shared/schemas';


/**
 * The editor's working copy of a point, and the checks it runs before the
 * server's own. The server's messages (a zod issue list) are shown inline too.
 */

export type TaskFields = KavachTaskBody;

/** A new point: a daily photo for the manager. */
export function blankTaskFields(): TaskFields {
  return {
    titleEn: '',
    titleHi: '',
    howToEn: '',
    howToHi: '',
    points: 10,
    everyDays: 1,
    dueTime: null,
    how: 'photo',
    uploader: 'manager',
    source: null,
    sheet: null,
    panels: [],
    group: 'daily',
    iocOnly: false,
    acceptsFile: false,
  };
}

export function fieldsFromTask(t: KavachTaskDef): TaskFields {
  return {
    titleEn: t.titleEn,
    titleHi: t.titleHi,
    howToEn: t.howToEn,
    howToHi: t.howToHi,
    points: t.points,
    everyDays: t.everyDays,
    dueTime: t.dueTime,
    how: t.how,
    uploader: t.uploader,
    source: t.source,
    sheet: t.sheet,
    panels: [...t.panels],
    group: t.group,
    iocOnly: t.iocOnly,
    acceptsFile: t.acceptsFile,
    sort: t.sort,
  };
}

export type FieldErrors = Partial<Record<string, string>>;

/** The same rules as the server's `kavachTaskBodySchema`, so the form can say it before sending. */
export function validateTaskFields(f: TaskFields): FieldErrors {
  const errors: FieldErrors = {};
  if (!f.titleEn.trim()) errors.titleEn = 'Write the title in English';
  if (!f.titleHi.trim()) errors.titleHi = 'Write the title in Hindi';
  if (!Number.isInteger(f.points) || f.points < 0 || f.points > 5000) {
    errors.points = 'Points must be a whole number from 0 to 5000';
  }
  if (f.everyDays !== null && (!Number.isInteger(f.everyDays) || f.everyDays < 1 || f.everyDays > 3650)) {
    errors.everyDays = 'Days must be a whole number from 1 to 3650';
  }
  if (f.how === 'data' && !f.source) errors.source = 'Pick where the data comes from';
  if (f.how === 'sheet' && !f.sheet) errors.sheet = 'Pick which sheet MDG makes';
  if (f.dueTime) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.dueTime)) errors.dueTime = 'Use HH:MM, like 10:00';
    else if (f.everyDays !== 1) errors.dueTime = 'A due time is only for daily points';
  }
  return errors;
}

/** What to send: a point the server will accept, with fields that do not apply cleared. */
export function bodyFromFields(f: TaskFields): TaskFields {
  return {
    ...f,
    titleEn: f.titleEn.trim(),
    titleHi: f.titleHi.trim(),
    howToEn: f.howToEn.trim(),
    howToHi: f.howToHi.trim(),
    source: f.how === 'data' ? f.source : null,
    sheet: f.how === 'sheet' ? f.sheet : null,
    dueTime: f.everyDays === 1 && f.dueTime ? f.dueTime : null,
  };
}

/** The server's zod issues, as one message per field. `task.titleEn` and `titleEn` both land on `titleEn`. */
export function fieldErrorsFromApi(err: unknown): FieldErrors {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return {};
  const out: FieldErrors = {};
  for (const issue of err.details as { path?: unknown; message?: unknown }[]) {
    if (!Array.isArray(issue?.path) || typeof issue.message !== 'string') continue;
    const path = (issue.path as (string | number)[]).filter((p) => p !== 'task');
    const key = String(path[0] ?? '');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** A readable slug for a new point's code, from its English title. */
export function codeFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return slug.length >= 3 ? slug : '';
}

/** The fields an outlet may change on a shared point, in the order the editor shows them. */
export const OVERRIDE_KEYS = [
  'points',
  'everyDays',
  'dueTime',
  'how',
  'uploader',
  'source',
  'sheet',
  'panels',
  'howToEn',
  'howToHi',
  'acceptsFile',
] as const;

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

/**
 * What an outlet changes about a shared point: only the fields that differ from
 * the shared one. `null` when nothing differs (the override can be removed).
 */
export function diffOverride(
  shared: KavachTaskDef,
  edited: TaskFields,
): KavachTaskOverride | null {
  const body = bodyFromFields(edited);
  const out: Record<string, unknown> = { code: shared.code };
  for (const key of OVERRIDE_KEYS) {
    if (!sameValue(shared[key], body[key])) out[key] = body[key];
  }
  return Object.keys(out).length > 1 ? (out as KavachTaskOverride) : null;
}

/** Put an override into a list: replaces the one for the same code, or drops it when `override` is null. */
export function withOverride(
  list: readonly KavachTaskOverride[],
  code: string,
  override: KavachTaskOverride | null,
): KavachTaskOverride[] {
  const rest = list.filter((o) => o.code !== code);
  return override ? [...rest, override] : rest;
}

/** Hide or show a shared point in an outlet's hidden list. */
export function withHidden(hidden: readonly string[], code: string, hide: boolean): string[] {
  const rest = hidden.filter((c) => c !== code);
  return hide ? [...rest, code] : rest;
}
