/**
 * The Reply helper's pure rules (ADR 0025). Pure, so each decision reads in one
 * place and `scripts/replyHelper.check.ts` runs them (this app has no test
 * runner). Types only from `@dk/shared`, as `lib/chatTranscript.ts` does: the
 * check script imports this file under plain node, where `@dk/shared` resolves
 * to a compiled `dist/` and not to source.
 *
 * WHAT LIVES HERE AND WHY. The panel is a thin skin over a handful of decisions
 * that are easy to get subtly wrong and costly when they are: which stretch of a
 * draft is painted as a warning when the server's ranges overlap or run past the
 * end; how a draft is put after what the admin has already typed; which warning
 * is shown first; how an instruction is cleaned before it is sent. None of them
 * needs React, so none of them lives in a component.
 */
import type {
  ReplyHelperContext,
  ReplyHelperDraft,
  ReplyHelperHighlight,
  ReplyHelperTarget,
  ReplyHelperThread,
  ReplyHelperTurn,
  ReplyHelperWarning,
  ReplyHelperWarningKind,
} from '@dk/shared';

/* ───────────────────────────── Which conversation ────────────────────────── */

/**
 * A stable string for "this open conversation", used in query keys and mutation
 * keys. The helper thread belongs to a person, but the CLIENT names only the
 * conversation it is looking at (the server works out the person), so the
 * cache is keyed the same way: two chats never share an entry, and the same
 * person on the other WhatsApp number is deliberately a different one until the
 * server says otherwise.
 */
export function targetKey(target: ReplyHelperTarget): string {
  return target.channel === 'app'
    ? `app:${target.conversationId}`
    : `whatsapp:${target.line}:${target.person}`;
}

/** The query string the `GET /admin/reply-helper/thread` route reads for this target. */
export function targetQuery(target: ReplyHelperTarget): Record<string, string> {
  return target.channel === 'app'
    ? { channel: 'app', conversationId: target.conversationId }
    : { channel: 'whatsapp', line: target.line, person: target.person };
}

/* ─────────────────────────────── The instruction ─────────────────────────── */

/**
 * The words as they go to the server: line endings made plain, the ends
 * trimmed, and cut to the longest the server accepts. Returns '' for nothing
 * worth sending, which the caller treats as "do not send".
 *
 * `max` is passed in, not imported: it is a VALUE in `@dk/shared`, and this
 * file only takes types from there. The cut never splits an emoji in two — a
 * lone half of a surrogate pair is a character the server's own validation
 * would refuse, and the admin would get an error for a sentence that looked fine.
 */
export function sanitiseInstruction(raw: string, max: number): string {
  let text = raw.replace(/\r\n?/g, '\n').trim();
  if (text.length > max) {
    let end = max;
    if (isHighSurrogate(text.charCodeAt(end - 1))) end -= 1;
    text = text.slice(0, end).trim();
  }
  return text;
}

/* ───────────────────────────── Drafts and warnings ───────────────────────── */

/**
 * Put `text` after what the box already holds: an empty box gets the text; a
 * box with words gets a blank line and then the text. The same rule the dealer
 * `Composer` uses for its inserts, so a draft never overwrites half a reply the
 * admin is typing.
 */
export function appendToBox(current: string, text: string): string {
  const add = text.trim();
  if (!add) return current;
  return current.trim() ? `${current.replace(/\s+$/, '')}\n\n${add}` : add;
}

/** Red first, then amber; within a severity the server's order is kept. */
export function sortWarnings(warnings: readonly ReplyHelperWarning[]): ReplyHelperWarning[] {
  const rank = (w: ReplyHelperWarning) => (w.severity === 'red' ? 0 : 1);
  return warnings
    .map((w, i) => ({ w, i }))
    .sort((a, b) => rank(a.w) - rank(b.w) || a.i - b.i)
    .map((x) => x.w);
}

/** Does the draft carry a rule-breaking (red) warning? */
export function hasRedWarning(draft: Pick<ReplyHelperDraft, 'warnings'>): boolean {
  return draft.warnings.some((w) => w.severity === 'red');
}

export type MarkSeverity = 'red' | 'amber';

/**
 * How severe a highlight of each kind is, read off the draft's own warnings. A
 * highlight has a kind and no severity of its own; the warning of the same kind
 * carries it. Red wins when a kind has both, and a highlight with no matching
 * warning is amber — shown, not shouted.
 */
export function severityByKind(
  warnings: readonly ReplyHelperWarning[],
): Map<ReplyHelperWarningKind, MarkSeverity> {
  const out = new Map<ReplyHelperWarningKind, MarkSeverity>();
  for (const w of warnings) {
    if (out.get(w.kind) === 'red') continue;
    out.set(w.kind, w.severity);
  }
  return out;
}

/** The warning words that belong to one kind, joined for a tooltip. */
export function warningWordsFor(
  warnings: readonly ReplyHelperWarning[],
  kinds: readonly ReplyHelperWarningKind[],
): string {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const w of sortWarnings(warnings)) {
    if (!kinds.includes(w.kind) || seen.has(w.words)) continue;
    seen.add(w.words);
    words.push(w.words);
  }
  return words.join(' ');
}

/** One run of a draft: plain text, or text under one or more highlights. */
export interface DraftSegment {
  text: string;
  /** Every highlight kind covering this run, in the order the server listed them. Empty = plain. */
  kinds: ReplyHelperWarningKind[];
  /** The worst severity among `kinds`; null for plain text. */
  severity: MarkSeverity | null;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Cut a draft into runs for painting, applying the server's highlights safely.
 *
 * THE SERVER'S RANGES ARE NOT TRUSTED TO BE TIDY. They are `[start, end)` in
 * UTF-16 code units, written by code that finds a figure in a string the model
 * wrote, and then the string is edited (the payment link is spliced in, a
 * marker is removed). A range can come back past the end, backwards, empty,
 * fractional, or overlapping another. Painting must never throw, never drop a
 * character of the draft, and never show a character twice — the admin copies
 * from this text, so a dropped letter is a wrong message sent to a dealer.
 *
 * So: ranges are clipped to the text; an empty or inverted one is dropped; an
 * edge that falls inside an emoji is moved out to the emoji's edge; and where
 * two ranges overlap the overlap carries BOTH kinds (and the worse severity)
 * rather than one hiding the other. Neighbouring runs with the same kinds are
 * joined, so a figure flagged twice paints as one mark.
 *
 * `severity` maps a kind to how it is painted (see {@link severityByKind}).
 * The concatenation of the runs' `text` is always exactly `text`.
 */
export function draftSegments(
  text: string,
  highlights: readonly ReplyHelperHighlight[],
  severity: ReadonlyMap<ReplyHelperWarningKind, MarkSeverity> = new Map(),
): DraftSegment[] {
  if (text.length === 0) return [];

  interface Range {
    start: number;
    end: number;
    kind: ReplyHelperWarningKind;
  }
  const ranges: Range[] = [];
  for (const h of highlights) {
    if (!Number.isFinite(h.start) || !Number.isFinite(h.end)) continue;
    let start = Math.max(0, Math.floor(h.start));
    let end = Math.min(text.length, Math.ceil(h.end));
    if (end <= start) continue;
    // An edge inside a surrogate pair moves OUT, so the mark takes the whole emoji.
    if (start > 0 && isLowSurrogate(text.charCodeAt(start)) && isHighSurrogate(text.charCodeAt(start - 1))) {
      start -= 1;
    }
    if (end < text.length && isLowSurrogate(text.charCodeAt(end)) && isHighSurrogate(text.charCodeAt(end - 1))) {
      end += 1;
    }
    ranges.push({ start, end, kind: h.kind });
  }
  if (ranges.length === 0) return [{ text, kinds: [], severity: null }];

  const cuts = new Set<number>([0, text.length]);
  for (const r of ranges) {
    cuts.add(r.start);
    cuts.add(r.end);
  }
  const points = [...cuts].sort((a, b) => a - b);

  const out: DraftSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const kinds: ReplyHelperWarningKind[] = [];
    for (const r of ranges) {
      if (r.start <= from && r.end >= to && !kinds.includes(r.kind)) kinds.push(r.kind);
    }
    let worst: MarkSeverity | null = null;
    for (const k of kinds) {
      const s = severity.get(k) ?? 'amber';
      if (s === 'red') worst = 'red';
      else if (worst === null) worst = 'amber';
    }
    const piece = text.slice(from, to);
    const last = out[out.length - 1];
    if (last && last.kinds.length === kinds.length && last.kinds.every((k, j) => k === kinds[j])) {
      last.text += piece;
    } else {
      out.push({ text: piece, kinds, severity: worst });
    }
  }
  return out;
}

/* ───────────────────────────── Keeping the thread ────────────────────────── */

/** Turns oldest first, each id once (the later copy wins, as it is the fresher read). */
export function mergeTurns(
  older: readonly ReplyHelperTurn[],
  newer: readonly ReplyHelperTurn[],
): ReplyHelperTurn[] {
  const byId = new Map<string, ReplyHelperTurn>();
  for (const t of older) byId.set(t.id, t);
  for (const t of newer) byId.set(t.id, t);
  return [...byId.values()]
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.at < b.t.at ? -1 : a.t.at > b.t.at ? 1 : a.i - b.i))
    .map((x) => x.t);
}

/**
 * A fresh read of the newest page, laid over what is already held.
 *
 * Why not just take the fresh page: "Load earlier" puts older turns in the same
 * cache entry, and a refetch (the admin comes back to the tab, another admin
 * asks something) returns only the newest twenty. Taking it as is would silently
 * throw away what the admin scrolled back to read.
 *
 * Why it sometimes does: the held turns belong to ONE helper thread, and the
 * server can move this chat to another (an admin picks which dealer login a
 * shared WhatsApp number is). Then the held turns are about someone else, and
 * mixing them in is the one mistake this panel must not make. So the held turns
 * are kept only while the chat's login is the same one.
 *
 * `hasMore` follows whichever page reaches furthest back.
 */
export function mergeThread(prev: ReplyHelperThread | undefined, fresh: ReplyHelperThread): ReplyHelperThread {
  if (!prev || prev.context.login?.userId !== fresh.context.login?.userId) return fresh;
  const turns = mergeTurns(prev.turns, fresh.turns);
  const prevOldest = prev.turns[0];
  const freshOldest = fresh.turns[0];
  const heldReachesFurther = !!prevOldest && (!freshOldest || prevOldest.at < freshOldest.at);
  return {
    context: fresh.context,
    turns,
    hasMore: heldReachesFurther ? prev.hasMore : fresh.hasMore,
  };
}

/**
 * A new turn, and the context that came with it, put into the held thread. With
 * nothing held yet, the turn stands alone and `hasMore` is left false: the next
 * thread read will say otherwise.
 */
export function withTurn(
  prev: ReplyHelperThread | undefined,
  turn: ReplyHelperTurn,
  context: ReplyHelperContext,
): ReplyHelperThread {
  // A different login than the held thread's means a different person's thread: an
  // answer that took half a minute can land after a teammate picked another login
  // for a shared number. Never mix the two — the answer stands alone, and the next
  // read of the thread fills in the rest.
  if (prev && prev.context.login?.userId !== context.login?.userId) {
    return { context, turns: [turn], hasMore: false };
  }
  return {
    context,
    turns: mergeTurns(prev?.turns ?? [], [turn]),
    hasMore: prev?.hasMore ?? false,
  };
}

/** Older turns put in front of the held thread. */
export function withEarlier(prev: ReplyHelperThread, earlier: ReplyHelperThread): ReplyHelperThread {
  // Older turns of a different login's thread are not this thread's history.
  if (prev.context.login?.userId !== earlier.context.login?.userId) return earlier;
  return {
    context: prev.context,
    turns: mergeTurns(earlier.turns, prev.turns),
    hasMore: earlier.hasMore,
  };
}

/* ─────────────────────────────── Words on screen ─────────────────────────── */

/** Who asked, for the bubble: "You" for the admin looking at it, else the name. */
export function askedByLabel(turn: Pick<ReplyHelperTurn, 'askedBy'>, meId: string | null): string {
  if (meId && turn.askedBy.id === meId) return 'You';
  return turn.askedBy.name?.trim() || 'A teammate';
}

/**
 * When a turn was asked: the clock time today, "Yesterday 14:05", else the date
 * and time. In the browser's own time zone, which is the admin's.
 */
export function turnWhen(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const two = (n: number) => String(n).padStart(2, '0');
  const clock = `${two(at.getHours())}:${two(at.getMinutes())}`;
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayStart(now) - dayStart(at)) / 86_400_000);
  if (days === 0) return clock;
  if (days === 1) return `Yesterday ${clock}`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${at.getDate()} ${months[at.getMonth()]}, ${clock}`;
}

/**
 * What to tell the admin when asking failed before the server could answer
 * (a turn the server itself recorded as failed carries its own words).
 *
 * `REPLY_HELPER_BUSY` is the server refusing a second request for one person
 * while the first still runs: nothing was lost and nothing was paid for twice.
 */
export function askFailureWords(err: { status?: number; code?: string; message?: string } | null | undefined): string {
  if (err?.code === 'REPLY_HELPER_BUSY') return 'Already writing a reply for this person — wait for it.';
  if (err?.status === 0 || err?.code === 'NETWORK_ERROR') {
    // The server may still be writing it, and a second ask pays twice.
    return 'The connection dropped. The answer may still arrive — check the thread before asking again.';
  }
  if (err?.status === 502 || err?.status === 504) {
    return 'The answer took too long to come back. It may still arrive — check the thread before asking again.';
  }
  if (err?.status === 401 || err?.status === 403) return 'You are not allowed to use the Reply helper here.';
  if (err?.status === 404) return 'This chat could not be found any more.';
  if (err?.status && err.status >= 500) return 'The Reply helper had a problem on the server. Ask again in a moment.';
  return err?.message?.trim() || 'The Reply helper could not answer. Ask again in a moment.';
}

/** The words when "Load earlier" fails: it is history that did not load, not an answer. */
export const LOAD_EARLIER_FAILED_WORDS = 'Could not load the earlier requests. Try again.';

/** The words after a draft is put in the reply box (or saved for it). */
export const DRAFT_PLACED_WORDS = 'Put in the reply box — not sent.';
export const DRAFT_SAVED_WORDS =
  'Saved as the draft for this chat — it shows when the reply box opens. Not sent.';
