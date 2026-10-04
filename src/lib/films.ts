import {
  FILM_IDS,
  type FilmBreakdownKey,
  type FilmBreakdownRow,
  type FilmId,
  type FilmLine,
  type FilmSessionRow,
} from '@dk/shared';

/**
 * The decidable half of the admin "Films" screen (docs/films/FILM_PAGES_SPEC.md
 * §4): ranges, formatting, the retention curve's geometry and the lookups the
 * readout needs. Pure and small on purpose — the admin has no test runner, so
 * anything with an edge case lives here where it can be read in one sitting.
 */

/* ─────────────────────────────── URL state ──────────────────────────────── */

export function isFilmId(v: string | null | undefined): v is FilmId {
  return !!v && (FILM_IDS as readonly string[]).includes(v);
}

export type FilmRangePreset = '7d' | '30d' | 'all';

export const FILM_RANGE_PRESETS: ReadonlyArray<{ value: FilmRangePreset; label: string }> = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
];

export function isRangePreset(v: string | null | undefined): v is FilmRangePreset {
  return v === '7d' || v === '30d' || v === 'all';
}

/** Short names for the switcher; the full Hindi title comes from the server. */
export const FILM_SWITCH_LABELS: Record<FilmId, string> = {
  kavach: 'Full film',
  'kavach-short': '35-s short',
};

/** `YYYY-MM-DD` moved by whole days, on the calendar (no timezone involved). */
export function addDaysYmd(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(t)) return ymd;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The IST days a preset covers, ending today. "7 days" is today and the six
 * before it. "All time" leaves `from` out: the server starts at the film's
 * first recorded open.
 */
export function rangeForPreset(
  preset: FilmRangePreset,
  todayYmd: string,
): { from?: string; to: string } {
  if (preset === 'all') return { to: todayYmd };
  const days = preset === '7d' ? 7 : 30;
  return { from: addDaysYmd(todayYmd, -(days - 1)), to: todayYmd };
}

/* ─────────────────────────────── Formatting ─────────────────────────────── */

const COUNT_FMT = new Intl.NumberFormat('en-IN');

export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return COUNT_FMT.format(Math.round(n));
}

/**
 * A 0..1 share as a percentage. Whole numbers by default; a non-zero share that
 * would round to 0 prints as "<1%", so "a few" never reads as "none".
 */
export function formatPercent(ratio: number | null | undefined, dp = 0): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—';
  const pct = ratio * 100;
  const floor = 1 / 10 ** dp;
  if (pct > 0 && pct < floor) return `<${floor}%`;
  return `${pct.toFixed(dp)}%`;
}

/** A playhead position: `0:07`, `12:34`, `1:02:03`. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** A length of watching: `42 s`, `4 min 12 s`, `3 h 5 min`. */
export function formatWatchTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m} min ${rem} s` : `${m} min`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Start-up time: `850 ms`, `1.2 s`; a dash when nobody reported one. */
export function formatStartup(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/* ─────────────────────────────── Retention curve ────────────────────────── */

export interface CurvePoint {
  /** Seconds into the film. */
  t: number;
  /** 0..1. */
  v: number;
}

/**
 * Thin a per-second series to at most `maxPoints` by averaging each bucket.
 * The full film is 1,590 seconds and a phone plot is ~300px wide, so drawing
 * every second only buys a path ten times longer than the pixels can show.
 * Each point sits at the middle of the seconds it stands for.
 */
export function downsample(series: readonly number[], maxPoints: number): CurvePoint[] {
  const n = series.length;
  if (n === 0) return [];
  const size = Math.max(1, Math.ceil(n / Math.max(1, maxPoints)));
  const out: CurvePoint[] = [];
  for (let start = 0; start < n; start += size) {
    const end = Math.min(n, start + size);
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += series[i] ?? 0;
    out.push({ t: (start + end) / 2, v: sum / (end - start) });
  }
  return out;
}

/**
 * The curve as an SVG path in a `0 0 duration 100` viewBox (y grows downwards,
 * so 100 % is y = 0). The line is carried flat to both ends of the film so it
 * starts at the left edge and finishes at the right one.
 */
export function curvePath(points: readonly CurvePoint[], duration: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || duration <= 0) return '';
  const y = (v: number) => ((1 - Math.min(1, Math.max(0, v))) * 100).toFixed(2);
  const parts = [`M0 ${y(first.v)}`];
  for (const p of points) parts.push(`L${p.t.toFixed(2)} ${y(p.v)}`);
  parts.push(`L${duration.toFixed(2)} ${y(last.v)}`);
  return parts.join(' ');
}

/** The same curve closed down to the baseline, for the soft fill under it. */
export function curveArea(points: readonly CurvePoint[], duration: number): string {
  const line = curvePath(points, duration);
  return line ? `${line} L${duration.toFixed(2)} 100 L0 100 Z` : '';
}

const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

/**
 * Time-axis ticks: the smallest round step that gives at most `maxTicks`
 * labels, counted from 0. 26 minutes at 6 ticks is every 5 minutes; 35 seconds
 * is every 10.
 */
export function timeTicks(duration: number, maxTicks = 6): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const step =
    TICK_STEPS.find((s) => Math.floor(duration / s) + 1 <= maxTicks) ??
    Math.ceil(duration / Math.max(1, maxTicks - 1));
  const out: number[] = [];
  for (let t = 0; t <= duration + 1e-9; t += step) out.push(t);
  return out;
}

/** Which whole second a horizontal fraction of the plot lands on. */
export function secondAtFraction(fraction: number, duration: number): number {
  const last = Math.max(0, Math.ceil(duration) - 1);
  if (!Number.isFinite(fraction)) return 0;
  return Math.min(last, Math.max(0, Math.floor(fraction * duration)));
}

/** The series' value at a whole second, 0 past either end. */
export function valueAt(series: readonly number[], second: number): number {
  return series[Math.floor(second)] ?? 0;
}

/**
 * The line being spoken at `t`, or the one that finished at most 3 s earlier —
 * the same rule the server uses to name a drop-off, so the curve and the
 * drop-off list never disagree about what was being said.
 */
export function lineAt(lines: readonly FilmLine[], t: number): FilmLine | null {
  let best: FilmLine | null = null;
  for (const l of lines) {
    if (l.t <= t && t < l.end) return l;
    if (l.end <= t && t - l.end <= 3 && (!best || l.end > best.end)) best = l;
  }
  return best;
}

export interface ChapterBand {
  index: number;
  title: string;
  start: number;
  end: number;
}

/** Chapters as `[start, end)` spans, the last one running to the end of the film. */
export function chapterBands(
  chapters: ReadonlyArray<{ t: number; title: string }>,
  duration: number,
): ChapterBand[] {
  const sorted = [...chapters].sort((a, b) => a.t - b.t);
  return sorted.map((c, i) => ({
    index: i,
    title: c.title,
    start: Math.max(0, c.t),
    end: Math.min(duration, sorted[i + 1]?.t ?? duration),
  }));
}

export function chapterAt(bands: readonly ChapterBand[], t: number): ChapterBand | null {
  let hit: ChapterBand | null = null;
  for (const b of bands) if (b.start <= t) hit = b;
  return hit;
}

/**
 * The curve read out as a table, every `step` seconds plus the last second —
 * the way to read any value without hovering. A minute apart on the full film,
 * five seconds on the short.
 */
export function retentionTableStep(duration: number): number {
  if (duration > 600) return 60;
  if (duration > 120) return 15;
  return 5;
}

export function sampleSeries(
  series: readonly number[],
  step: number,
): Array<{ t: number; v: number }> {
  const out: Array<{ t: number; v: number }> = [];
  if (series.length === 0) return out;
  for (let t = 0; t < series.length; t += Math.max(1, step)) out.push({ t, v: series[t] ?? 0 });
  const last = series.length - 1;
  if (out[out.length - 1]?.t !== last) out.push({ t: last, v: series[last] ?? 0 });
  return out;
}

/* ─────────────────────────────── Breakdowns ─────────────────────────────── */

export const BREAKDOWN_TABS: ReadonlyArray<{ key: FilmBreakdownKey; label: string }> = [
  { key: 'tag', label: 'Share link' },
  { key: 'region', label: 'State' },
  { key: 'city', label: 'City' },
  { key: 'device', label: 'Device' },
  { key: 'network', label: 'Network' },
  { key: 'inApp', label: 'Source app' },
  { key: 'referrer', label: 'Came from' },
];

export function isBreakdownKey(v: string | null | undefined): v is FilmBreakdownKey {
  return BREAKDOWN_TABS.some((b) => b.key === v);
}

const APP_NAMES: Record<string, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  messenger: 'Messenger',
  telegram: 'Telegram',
  linkedin: 'LinkedIn',
  twitter: 'X (Twitter)',
  snapchat: 'Snapchat',
  youtube: 'YouTube',
  gsa: 'Google app',
  line: 'LINE',
  wechat: 'WeChat',
};

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function appName(key: string): string {
  return APP_NAMES[key.toLowerCase()] ?? capitalise(key);
}

/** What a breakdown row is called on screen. The server's placeholders read as words. */
export function breakdownRowLabel(kind: FilmBreakdownKey, row: FilmBreakdownRow): string {
  if (row.label) return row.label;
  const k = row.key;
  if (kind === 'tag' && k === 'none') return 'No link (opened directly)';
  if (kind === 'referrer' && k === 'direct') return 'Direct (no site before it)';
  if (kind === 'inApp' && k === 'browser') return 'A normal browser';
  if (kind === 'inApp') return appName(k);
  if (k === 'unknown') return 'Not known';
  if (kind === 'network') return k.toUpperCase();
  return k;
}

/* ─────────────────────────────── Recent views ───────────────────────────── */

export function sessionPlace(row: FilmSessionRow): string {
  const parts = [row.city, row.region].filter((p): p is string => !!p);
  return parts.length ? parts.join(', ') : 'Not known';
}

export function sessionDevice(row: FilmSessionRow): string {
  const kind = row.mobile === true ? 'phone' : row.mobile === false ? 'computer' : null;
  const base = [row.os, row.browser].filter((p): p is string => !!p).join(' · ') || 'Not known';
  const parts = [kind ? `${base} (${kind})` : base];
  if (row.inApp) parts.push(`in ${appName(row.inApp)}`);
  return parts.join(', ');
}

export function sessionSource(row: FilmSessionRow): string {
  if (row.tagLabel) return row.tagLabel;
  if (row.tag) return `Code ${row.tag}`;
  if (row.from === 'short') return 'From the short';
  return 'No link';
}

/* ─────────────────────────────── Sharing ────────────────────────────────── */

/** The message a share link goes out with: the film's title, then the link. */
export function shareMessage(title: string, url: string): string {
  return `${title}\n${url}`;
}

/** WhatsApp's own "send this text" link — the user picks the chat. */
export function whatsAppUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/* ─────────────────────────────── Phone lists ────────────────────────────── */

/**
 * How many rows a list on the Films page shows on a phone before "Show all".
 * Breakdowns can return 50 rows and every share link ever made is listed; on a
 * 390 px screen that pushed the "make a link" form eight screens down.
 */
export const PHONE_LIST_LIMIT = 5;

/**
 * The rows to draw. `limit` is `null` where nothing is capped (a desktop
 * table); a list one row over the cap is shown whole, because a "Show all 6"
 * button costs as much height as the sixth row it hides.
 */
export function cappedRows<T>(
  rows: readonly T[],
  limit: number | null,
  expanded: boolean,
): readonly T[] {
  if (limit === null || expanded || rows.length <= limit + 1) return rows;
  return rows.slice(0, Math.max(0, limit));
}

/** A breakdown row's figures on one phone line, after its view count. */
export function breakdownPhoneLine(row: FilmBreakdownRow): string {
  return [
    `${formatPercent(row.avgPercent)} watched`,
    `${formatCount(row.viewers)} ${row.viewers === 1 ? 'viewer' : 'viewers'}`,
    `${formatPercent(row.completionRate)} completed`,
    `${formatPercent(row.soundOnRate)} sound on`,
  ].join(' · ');
}

/** A share link's all-time figures on one phone line. */
export function shareLinkPhoneLine(row: {
  opens: number;
  views: number;
  viewers: number;
  avgPercent: number;
}): string {
  const parts = [
    `${formatCount(row.opens)} ${row.opens === 1 ? 'open' : 'opens'}`,
    `${formatCount(row.views)} ${row.views === 1 ? 'view' : 'views'}`,
    `${formatCount(row.viewers)} ${row.viewers === 1 ? 'viewer' : 'viewers'}`,
  ];
  if (row.views > 0) parts.push(`${formatPercent(row.avgPercent)} watched`);
  return parts.join(' · ');
}
