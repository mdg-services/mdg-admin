/**
 * The Pump details form's rules (the dealer's "पंप की जानकारी"), kept out of the
 * components so they read as plain decisions. The admin has no test runner:
 * everything here is pure, and `scripts/outletDetails.check.ts` runs it
 * (`npm run check:outlet-details`).
 *
 * THE SERVER OWNS THE QUESTIONS. The list lives in one server file and arrives with
 * every read: each question says its own kind, words, options and limits. So nothing
 * in this file may name a question or count them. It works from the kind alone
 * (state, choice, text, number, yesno, date), and a kind it has never heard of is
 * shown read-only instead of breaking, so a new kind never needs an admin release.
 *
 * The admin works in English: the English words come first, and the Hindi question is
 * kept in small grey type under it so the team knows what the dealer saw.
 *
 * Imports TYPES only (the check script runs this file outside Vite).
 */
import type {
  OutletDetailAnswer,
  OutletDetailKind,
  OutletDetailOption,
  OutletDetailValue,
  OutletDetailWords,
  OutletDetailsQuestionView,
  OutletDetailsView,
} from '@dk/shared';

import { isYmd } from './format';

/** The kinds this screen can draw a control for. Anything else is shown read-only. */
const DRAWN_KINDS: readonly string[] = ['state', 'choice', 'text', 'number', 'yesno', 'date'];

export function isDrawnKind(kind: string): kind is OutletDetailKind {
  return DRAWN_KINDS.includes(kind);
}

/** The longest text the shared save schema takes, when a question names no limit of its own. */
export const DEFAULT_TEXT_MAX = 500;

// ── Words ─────────────────────────────────────────────────────────────────

/** The English words; the Hindi ones only if a server left the English out. */
export function englishWords(w: OutletDetailWords | undefined): string {
  return w?.en?.trim() || w?.hi?.trim() || '';
}

/** The Hindi line to show small and grey under an English one, or null when it adds nothing. */
export function hindiUnder(w: OutletDetailWords | undefined): string | null {
  const hi = w?.hi?.trim();
  if (!hi) return null;
  return hi === englishWords(w) ? null : hi;
}

/**
 * The options in the order to draw. A state list is put in the admin's alphabet
 * (the server's order is the dealer's); a choice list keeps the server's order.
 */
export function optionsFor(q: OutletDetailsQuestionView): OutletDetailOption[] {
  const options = q.options ?? [];
  if (q.kind !== 'state') return options;
  return [...options].sort((a, b) => englishWords(a.label).localeCompare(englishWords(b.label)));
}

// ── Reading an answer ─────────────────────────────────────────────────────

/** No value, or a blank one, is "not answered". `false` and `0` are answers. */
export function hasValue(v: OutletDetailValue | undefined): v is string | number | boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

/** `2026-11-14` → `14 Nov 2026`, read as a label so no timezone moves the day. */
function dayWords(ymd: string): string {
  if (!isYmd(ymd)) return ymd;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(ymd.slice(8, 10))} ${months[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}`;
}

/**
 * A value in the words the admin reads: the option's English label for a state or a
 * choice (the raw value if the server's list no longer holds it), Yes / No, a number
 * as it is, a day as `14 Nov 2026`. `null` when there is nothing to show.
 */
export function valueWords(q: OutletDetailsQuestionView, value: OutletDetailValue): string | null {
  if (!hasValue(value)) return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (q.kind === 'state' || q.kind === 'choice') {
    const hit = (q.options ?? []).find((o) => o.value === String(value));
    return hit ? englishWords(hit.label) || String(value) : String(value);
  }
  if (q.kind === 'date' && typeof value === 'string') return dayWords(value);
  return String(value).trim();
}

/** The saved answer in words, or null when the question is not answered. */
export function answerWords(q: OutletDetailsQuestionView): string | null {
  return valueWords(q, q.answer.value);
}

/** The value MDG already holds elsewhere, in words, while the question is unanswered. Null otherwise. */
export function suggestedWords(q: OutletDetailsQuestionView): string | null {
  if (hasValue(q.answer.value)) return null;
  return valueWords(q, q.answer.suggested);
}

/** The line under an unanswered question when a suggestion exists. Generic on purpose: it names no question. */
export function suggestedLine(q: OutletDetailsQuestionView): string | null {
  const words = suggestedWords(q);
  return words ? `Suggested from what we hold: ${words}` : null;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * When an answer was saved, as an Indian reader counts the day: `14 Nov`, and the year
 * too once it is not this year's (`14 Nov 2025`). Empty for a time that cannot be read.
 * IST is added by hand (UTC+5:30), so the day is the same on every laptop.
 */
export function savedOn(iso: string | null | undefined, now: Date): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const ist = new Date(t + 330 * 60_000);
  const nowIst = new Date(now.getTime() + 330 * 60_000);
  const day = `${ist.getUTCDate()} ${MONTH_SHORT[ist.getUTCMonth()]}`;
  return ist.getUTCFullYear() === nowIst.getUTCFullYear() ? day : `${day} ${ist.getUTCFullYear()}`;
}

/**
 * Who filled an answer and when: "Filled by the dealer, 14 Nov" or "Filled by MDG
 * (Asha), 14 Nov". Null when nobody has answered. An admin's name is left out when the
 * server did not send one.
 */
export function savedByLine(answer: OutletDetailAnswer, now: Date): string | null {
  if (!hasValue(answer.value)) return null;
  const when = savedOn(answer.savedAt, now);
  const tail = when ? `, ${when}` : '';
  if (answer.savedVia === 'admin') {
    const name = answer.savedByName?.trim();
    return `Filled by MDG${name ? ` (${name})` : ''}${tail}`;
  }
  if (answer.savedVia === 'dealer') return `Filled by the dealer${tail}`;
  // An answer with no recorded saver (older data): say only that it is there.
  return when ? `Saved ${when}` : null;
}

// ── The card's own summary ────────────────────────────────────────────────

/** How many required questions still have no answer. */
/**
 * Required questions with no answer AND nothing we already hold to stand in for it.
 * A question the server can fill from elsewhere (the bill-to state for the pump's
 * state) is not chased: the server does not even ask those outlets, so the team must
 * not see them as work.
 */
export function unansweredCount(view: OutletDetailsView): number {
  return view.questions.filter(
    (q) => q.required && !hasValue(q.answer.value) && !hasValue(q.answer.suggested),
  ).length;
}

/** The badge on the outlet's card: whether the form is done, and if not, what is left. */
export function completionWords(view: OutletDetailsView): string {
  if (view.complete) return 'Answered';
  const left = unansweredCount(view);
  if (left > 0) return `${left} to answer`;
  return coveredBySuggestion(view) ? 'Using what we hold' : 'Not complete';
}

/** Some required question is unanswered but stood in for by a value we already hold. */
function coveredBySuggestion(view: OutletDetailsView): boolean {
  return view.questions.some(
    (q) => q.required && !hasValue(q.answer.value) && hasValue(q.answer.suggested),
  );
}

/** The badge's colour: green when answered, amber only when something is truly missing. */
export function completionIntent(view: OutletDetailsView): 'success' | 'warning' | 'neutral' {
  if (view.complete) return 'success';
  return unansweredCount(view) > 0 ? 'warning' : 'neutral';
}

// ── The form's draft ──────────────────────────────────────────────────────

/**
 * What the form holds while it is open: one string per question, because every box is
 * a string. A yes/no is `'yes'` or `'no'`; nothing chosen or typed is `''`.
 */
export type Draft = Record<string, string>;

function valueToDraft(v: OutletDetailValue | undefined): string {
  if (!hasValue(v)) return '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

/**
 * The form's starting point: each saved answer; and, for a question with none, the value
 * MDG already holds (if any) put in the box so the admin can confirm it with one press.
 * Pressing Save is what makes it an answer.
 */
export function initialDraft(view: OutletDetailsView): Draft {
  const out: Draft = {};
  for (const q of view.questions) {
    if (hasValue(q.answer.value)) {
      out[q.id] = valueToDraft(q.answer.value);
      continue;
    }
    // A suggestion that does not fit the question (a state the list no longer holds) is not offered.
    const offered = valueToDraft(q.answer.suggested);
    out[q.id] = offered !== '' && parseDraft(q, offered).ok ? offered : '';
  }
  return out;
}

export type ParsedDraft = { ok: true; value: OutletDetailValue } | { ok: false; problem: string };

/** Turn one box's text into the value the server takes, or say in plain words why it cannot be. */
export function parseDraft(q: OutletDetailsQuestionView, raw: string | undefined): ParsedDraft {
  const text = (raw ?? '').trim();
  if (text === '') return { ok: true, value: null };
  switch (q.kind) {
    case 'yesno':
      if (text === 'yes') return { ok: true, value: true };
      if (text === 'no') return { ok: true, value: false };
      return { ok: false, problem: 'Choose Yes or No.' };
    case 'state':
    case 'choice':
      return (q.options ?? []).some((o) => o.value === text)
        ? { ok: true, value: text }
        : { ok: false, problem: 'Choose one of the choices listed.' };
    case 'number': {
      const n = Number(text);
      if (!Number.isFinite(n)) return { ok: false, problem: 'Enter a number.' };
      const { min, max } = q;
      if (min !== undefined && max !== undefined && (n < min || n > max)) {
        return { ok: false, problem: `Enter a number from ${min} to ${max}.` };
      }
      if (min !== undefined && n < min) return { ok: false, problem: `Enter ${min} or more.` };
      if (max !== undefined && n > max) return { ok: false, problem: `Enter ${max} or less.` };
      return { ok: true, value: n };
    }
    case 'date':
      return isYmd(text) ? { ok: true, value: text } : { ok: false, problem: 'Pick a real date.' };
    case 'text': {
      const limit = q.maxLength ?? DEFAULT_TEXT_MAX;
      return text.length > limit
        ? { ok: false, problem: `Keep it to ${limit} characters or fewer.` }
        : { ok: true, value: text };
    }
    default:
      // A kind this screen cannot draw is never edited here.
      return { ok: false, problem: 'This cannot be changed from here.' };
  }
}

/** Two values are the same answer. A blank and a missing one are the same: nothing. */
export function sameValue(a: OutletDetailValue | undefined, b: OutletDetailValue | undefined): boolean {
  if (!hasValue(a) && !hasValue(b)) return true;
  return a === b;
}

/** The question's saved value, as the server would hold it, for comparing with a draft. */
function savedValue(q: OutletDetailsQuestionView): OutletDetailValue {
  return hasValue(q.answer.value) ? q.answer.value : null;
}

/**
 * The questions the admin changed: id -> what to send. A question left as it was is not
 * sent, so a save never rewrites (or re-stamps) an answer nobody touched. Clearing an
 * answer sends `null`. A question whose box cannot be read is left out here and named by
 * `draftProblems`.
 */
export function changedAnswers(
  view: OutletDetailsView,
  draft: Draft,
): Record<string, OutletDetailValue> {
  const out: Record<string, OutletDetailValue> = {};
  for (const q of view.questions) {
    if (!isDrawnKind(q.kind)) continue;
    const parsed = parseDraft(q, draft[q.id]);
    if (!parsed.ok) continue;
    if (!sameValue(parsed.value, savedValue(q))) out[q.id] = parsed.value;
  }
  return out;
}

/**
 * What is wrong with the boxes, by question id, in plain words. Only a question that
 * would be SENT is judged: a box that cannot be read, or a required answer cleared (the
 * server refuses that). A question nobody touched never blocks a save.
 */
export function draftProblems(view: OutletDetailsView, draft: Draft): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of view.questions) {
    if (!isDrawnKind(q.kind)) continue;
    const parsed = parseDraft(q, draft[q.id]);
    if (!parsed.ok) {
      // A box that holds the saved answer unchanged is not a problem the admin made.
      if (valueToDraft(q.answer.value) !== (draft[q.id] ?? '').trim()) out[q.id] = parsed.problem;
      continue;
    }
    if (q.required && parsed.value === null && hasValue(q.answer.value)) {
      out[q.id] = 'This cannot be left empty.';
    }
  }
  return out;
}

/**
 * The body of the save, or `null` when there is nothing to send (nothing changed, or a
 * box has a problem). The shape is the shared one: `{ answers: { <id>: value } }`.
 */
export function saveBody(
  view: OutletDetailsView,
  draft: Draft,
): { answers: Record<string, OutletDetailValue> } | null {
  if (Object.keys(draftProblems(view, draft)).length > 0) return null;
  const answers = changedAnswers(view, draft);
  return Object.keys(answers).length > 0 ? { answers } : null;
}
