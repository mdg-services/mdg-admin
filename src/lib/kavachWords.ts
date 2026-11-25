import type { Intent } from '@/lib/statusIntent';
import type {
  KavachCheckRow,
  KavachCheckState,
  KavachOutletRow,
  KavachGroup,
  KavachHow,
  KavachPanelId,
  KavachReviewGroup,
  KavachSendBackReason,
  KavachSheetId,
  KavachSourceId,
  KavachUploader,
} from '@dk/shared';
import { KAVACH_GROUPS } from '@dk/shared';


/**
 * The plain words of the Kavach screens, and the small pure rules behind them:
 * how long something has waited, what a state is called, which check opens
 * next. Kept apart from the components so each rule can be tested on its own.
 */

/* ───────────────────────────── Time in words ───────────────────────────── */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "3 min", "3 h", "2 days": how long a span is, in the unit a person says. */
export function spanWords(ms: number): string {
  const span = Math.max(0, ms);
  if (span < MIN) return 'under a minute';
  if (span < HOUR) return `${Math.round(span / MIN)} min`;
  if (span < DAY) return `${Math.floor(span / HOUR)} h`;
  const days = Math.floor(span / DAY);
  return days === 1 ? '1 day' : `${days} days`;
}

/** "waiting 3 h". Empty when there is no start time. */
export function waitWords(sinceIso: string | null | undefined, now = Date.now()): string {
  if (!sinceIso) return '';
  const t = Date.parse(sinceIso);
  if (Number.isNaN(t)) return '';
  const span = now - t;
  if (span < MIN) return 'just arrived';
  return `waiting ${spanWords(span)}`;
}

/** "due 10:00" before the time, "2 h late" after it. */
export function dueWords(
  dueIso: string | null | undefined,
  late: boolean,
  now = Date.now(),
): string {
  if (!dueIso) return '';
  const t = Date.parse(dueIso);
  if (Number.isNaN(t)) return '';
  if (late || t < now) return `${spanWords(now - t)} late`;
  const time = new Date(t).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
  const sameDay =
    new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) ===
    new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (sameDay) return `due ${time}`;
  const day = new Date(t).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
  return `due ${day}, ${time}`;
}

/* ───────────────────────────── The checklist's words ───────────────────────────── */

const GROUP_LABEL: Record<KavachGroup, string> = {
  daily: 'Every day',
  cleanliness: 'Cleanliness',
  safety: 'Safety',
  licences: 'Licences and papers',
  displays: 'Displays',
  sdms: 'IndianOil portal',
  equipment: 'Equipment',
};

export function groupLabel(group: KavachGroup): string {
  return GROUP_LABEL[group] ?? group;
}

/** The groups in the order the checklist shows them. */
export const GROUP_ORDER: readonly KavachGroup[] = KAVACH_GROUPS;

const HOW_LABEL: Record<KavachHow, string> = {
  photo: 'Photo',
  sheet: 'Sheet',
  data: 'From our data',
};
export function howLabel(how: KavachHow): string {
  return HOW_LABEL[how];
}
export const HOW_HINT: Record<KavachHow, string> = {
  photo: 'The outlet sends a photo.',
  sheet: 'MDG makes a sheet. The outlet fills it and sends a photo of it.',
  data: 'MDG reads it from data we already pull. No photo.',
};

const UPLOADER_LABEL: Record<KavachUploader, string> = {
  manager: 'Manager',
  owner: 'Owner',
  either: 'Manager or owner',
};
export function uploaderLabel(u: KavachUploader): string {
  return UPLOADER_LABEL[u];
}

const SHEET_LABEL: Record<KavachSheetId, string> = {
  'dsr-book': 'DSR book page',
  'toilet-inspection': 'Toilet inspection sheet',
  'toilet-display': 'Bathroom display sheet',
  'emergency-numbers': 'Emergency numbers poster',
};
export function sheetLabel(s: KavachSheetId): string {
  return SHEET_LABEL[s];
}

const SOURCE_LABEL: Record<KavachSourceId, string> = {
  'dsr-variation-ok': 'DSR variations within limit',
  'density-register': 'Density register sent',
  'licence-dto': 'DTO trade licence valid',
  'licence-wm': 'Weights and measures certificate valid',
  'licence-peso': 'PESO licence valid',
  'mock-drill-filed': 'Mock drill filed',
  'safety-declaration': 'Safety declaration filed',
};
export function sourceLabel(s: KavachSourceId): string {
  return SOURCE_LABEL[s];
}

const PANEL_LABEL: Record<KavachPanelId, string> = {
  dsr: 'Daily sales report',
  stock: 'Tank stock',
  density: 'Density register',
  'credit-dod': 'Credit and DOD',
  papers: 'Licences and papers',
  staff: 'Staff',
};
export function panelLabel(p: KavachPanelId): string {
  return PANEL_LABEL[p];
}

/** How often a point comes round. `null` is a point on no clock. */
export function everyWords(everyDays: number | null): string {
  if (everyDays === null) return 'When it happens';
  if (everyDays === 1) return 'Every day';
  if (everyDays === 7) return 'Every week';
  if (everyDays === 30) return 'Every month';
  if (everyDays === 365) return 'Every year';
  return `Every ${everyDays} days`;
}

/* ───────────────────────────── Reviewing ───────────────────────────── */

const REASON_LABEL: Record<KavachSendBackReason, string> = {
  not_clear: 'Photo not clear',
  wrong_page: 'Wrong page',
  numbers_differ: "Numbers don't match",
  not_updated: 'Not updated today',
  other: 'Something else…',
};
export function reasonLabel(r: KavachSendBackReason): string {
  return REASON_LABEL[r];
}

const STATE_LABEL: Record<KavachCheckState, string> = {
  todo: 'To do',
  sent: 'Waiting for MDG',
  sent_back: 'Sent back',
  done: 'Done',
  missed: 'Missed',
  excused: 'Excused',
};
export function stateLabel(state: KavachCheckState, late = false): string {
  if (late && (state === 'todo' || state === 'sent_back')) return `${STATE_LABEL[state]} (late)`;
  return STATE_LABEL[state];
}

/** Colour is never the only sign: every state also has its word. */
export function stateIntent(state: KavachCheckState, late = false): Intent {
  switch (state) {
    case 'done':
      return 'success';
    case 'sent':
      return 'info';
    case 'sent_back':
    case 'missed':
      return 'danger';
    case 'todo':
      return late ? 'danger' : 'warning';
    case 'excused':
      return 'neutral';
  }
}

/** The word for "who last touched it" under a history line. */
const HISTORY_LABEL: Record<string, string> = {
  opened: 'Opened',
  sent: 'Sent by the outlet',
  approved: 'Approved',
  sent_back: 'Sent back',
  told_owner: 'Owner told',
  excused: 'Excused',
  marked_done: 'Marked done',
  marked_not_done: 'Marked not done',
  data: 'Read from data',
  missed: 'Missed',
};
export function historyLabel(what: string): string {
  return HISTORY_LABEL[what] ?? what;
}

/* ───────────────────────────── Review groups ───────────────────────────── */

/** "12 to check · 3 late · waiting 2 h" for a group row. */
export function groupSummary(g: KavachReviewGroup, now = Date.now()): string {
  const parts = [`${g.count} to check`];
  if (g.lateCount > 0) parts.push(`${g.lateCount} late`);
  const wait = waitWords(g.oldestAt, now);
  if (wait) parts.push(wait);
  return parts.join(' · ');
}

/** Oldest wait first: the group that has been waiting longest goes on top. */
export function sortGroups(groups: readonly KavachReviewGroup[]): KavachReviewGroup[] {
  return [...groups].sort(
    (a, b) => Date.parse(a.oldestAt) - Date.parse(b.oldestAt) || a.label.localeCompare(b.label),
  );
}

/** The number on the nav badge: every check waiting for a person. */
export function waitingTotal(groups: readonly KavachReviewGroup[] | undefined): number {
  return (groups ?? []).reduce((sum, g) => sum + g.count, 0);
}

/* ───────────────────────────── The run ───────────────────────────── */

export interface RunProgress {
  /** Checks already decided in this run. */
  done: number;
  /** Checks still to look at, including the one on screen. */
  left: number;
  /** The place of the one on screen: done + 1, never above the total. */
  position: number;
  total: number;
}

/**
 * The checks still to look at, in the order to look at them: the one the admin
 * opened first (if any), then what the server lists, minus what was decided in
 * this run, with the ones the admin skipped moved to the back (in the order
 * they were skipped). The opened check stays in even when the server's list
 * does not hold it (a data check is not "sent"), until it is decided.
 */
export function runQueue(
  rows: readonly Pick<KavachCheckRow, 'id'>[],
  decided: ReadonlySet<string>,
  skipped: readonly string[],
  startId?: string | null,
): string[] {
  const live = rows.map((r) => r.id).filter((id) => !decided.has(id));
  const skippedLive = skipped.filter((id, i) => live.includes(id) && skipped.indexOf(id) === i);
  const skippedSet = new Set(skippedLive);
  const ordered = [...live.filter((id) => !skippedSet.has(id)), ...skippedLive];
  if (startId && !decided.has(startId) && !skippedSet.has(startId)) {
    return [startId, ...ordered.filter((id) => id !== startId)];
  }
  return ordered;
}

/**
 * Which check opens after one is dealt with: the head of the queue once the
 * check just handled is taken out of it. `null` when nothing is left.
 */
export function nextCheckId(queue: readonly string[], handledId: string): string | null {
  const rest = queue.filter((id) => id !== handledId);
  return rest[0] ?? null;
}

/** "3 of 12". */
export function runProgress(decidedCount: number, leftCount: number): RunProgress {
  const total = decidedCount + leftCount;
  return {
    done: decidedCount,
    left: leftCount,
    position: Math.min(decidedCount + 1, Math.max(total, 1)),
    total,
  };
}
export function progressWords(p: RunProgress): string {
  return `${p.position} of ${p.total}`;
}

/** Skipping moves the check to the back. Skipping it twice does not list it twice. */
export function withSkipped(skipped: readonly string[], id: string): string[] {
  return [...skipped.filter((s) => s !== id), id];
}

/* ───────────────────────────── Outlets ───────────────────────────── */

export type OutletFilter = 'all' | 'on' | 'off';

/** The three numbers on an outlet's row. "To do" includes what was sent back. */
export function outletFigures(row: Pick<KavachOutletRow, 'summary' | 'waitingReview'>): {
  todo: number | null;
  late: number | null;
  waiting: number;
} {
  const c = row.summary?.counts;
  return {
    todo: c ? c.todo + c.sentBack : null,
    late: c ? c.late : null,
    waiting: row.waitingReview,
  };
}

/** On / off filter, then a search on the code, the name or the oil company. */
export function filterOutlets<T extends Pick<KavachOutletRow, 'on' | 'dealerCode' | 'dealerName' | 'oilCompany'>>(
  rows: readonly T[],
  filter: OutletFilter,
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (filter === 'on' && !r.on) return false;
    if (filter === 'off' && r.on) return false;
    if (!q) return true;
    return [r.dealerCode, r.dealerName, r.oilCompany ?? ''].some((v) => v.toLowerCase().includes(q));
  });
}

/** "1 outlet" / "9 outlets". */
export function outletsWord(n: number): string {
  return n === 1 ? '1 outlet' : `${n} outlets`;
}

/* ───────────────────────────── One outlet's checks ───────────────────────────── */

const STATE_WEIGHT: Record<KavachCheckState, number> = {
  sent: 0,
  sent_back: 1,
  todo: 2,
  missed: 3,
  done: 4,
  excused: 5,
};

/**
 * The order of an outlet's check list: what waits for MDG first, then what the
 * outlet still owes (late ones before the rest), then what is finished.
 */
export function sortOutletChecks<T extends Pick<KavachCheckRow, 'state' | 'late' | 'dueAt' | 'title'>>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    const w = STATE_WEIGHT[a.state] - STATE_WEIGHT[b.state];
    if (w !== 0) return w;
    if (a.late !== b.late) return a.late ? -1 : 1;
    const da = a.dueAt ? Date.parse(a.dueAt) : Infinity;
    const db = b.dueAt ? Date.parse(b.dueAt) : Infinity;
    return da - db || a.title.localeCompare(b.title);
  });
}

/** A check an admin can open in the review run: sent for review, or a data point to decide by hand. */
export function canReview(row: Pick<KavachCheckRow, 'state' | 'how'>): boolean {
  return row.state === 'sent' || (row.how === 'data' && row.state !== 'excused');
}
