/**
 * Every decidable rule the Overview page renders, with no JSX anywhere in it.
 *
 * `mdg-admin` has NO test runner at all — there is no `test` script in its
 * package.json — so the only defence a rule has here is being readable in one
 * place instead of scattered through three components as inline ternaries. The
 * same argument put `aiFirstLineView` into @dk/shared; this is its local form.
 *
 * NOTHING IN HERE INVENTS JUDGEMENT. The server ranks, dedupes, caps and
 * thresholds. These functions only turn what it sent into words and colours.
 */

import type { Intent } from '@/lib/statusIntent';
import type { DealerDayRow, OverviewDay, TriageItem } from '@dk/shared';
import { dealerCodeLabel } from '@dk/shared';


/** A rendered cell: the word, its colour, and where tapping it goes. */
export interface CellState {
  label: string;
  intent: Intent;
  href: string;
  /** Long-form, shown as the row's hint on a phone where there is room. */
  hint?: string;
}

const SPELLED = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

/**
 * "All ten outlets" reads as a sentence; "All 10 outlets" reads as a dashboard.
 * Past ten, digits are clearer than words.
 */
export function spell(n: number): string {
  return SPELLED[n] ?? String(n);
}

/** `2026-09-05` → `Fri 5 Sep`. Never the year: this page only ever shows recent days. */
export function dayInWords(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  // Noon avoids any chance of a timezone rounding the date to its neighbour.
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** `2026-09-05` relative to the server's today — "yesterday", not a date, when it is one. */
export function dayRelativeToToday(ymd: string, today: string): string {
  if (ymd === today) return 'today';
  const [y, m, d] = today.split('-').map(Number);
  if (y && m && d) {
    const prev = new Date(Date.UTC(y, m - 1, d - 1, 12)).toISOString().slice(0, 10);
    if (ymd === prev) return 'yesterday';
  }
  return dayInWords(ymd);
}

/**
 * How long something has been waiting, from a RAW ISO instant.
 *
 * Computed on the client against a ticking `now` for a reason: the server
 * caches this payload for 20 seconds, so a duration rendered server-side would
 * visibly freeze and then jump.
 */
export function ageSince(iso: string | null, now: number): string {
  if (!iso) return '';
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

/** Clock time in IST, for "Sent 07:12". */
export function timeOfDay(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * The colour of a triage row.
 *
 * Only bucket A is ever allowed to be red or amber. Bucket B is standing
 * backlog — a Kavach programme starts with about forty never-verified items —
 * and colouring it would drown the four rows that are actually this morning's.
 */
export function triageIntent(item: TriageItem): Intent {
  if (item.bucket === 'context') return 'neutral';
  switch (item.kind) {
    case 'login_rejected':
    case 'credit_card_superseded':
    case 'dsr_superseded':
    case 'waiting_urgent':
      return 'danger';
    default:
      return 'warning';
  }
}

/** The badge on the left of a triage row: how long, or how many. */
export function triageBadge(item: TriageItem, now: number): string {
  const age = ageSince(item.sinceIso, now);
  if (age) return age;
  if (item.count && item.count > 0) return String(item.count);
  return '·';
}

// ---------------------------------------------------------------- the board

/**
 * Did the day's figures arrive?
 *
 * `PAUSED` portal collection is the hand-entry outlet — no automation reaches
 * it and somebody types the shift in. That is a normal way to run a pump here,
 * not a fault, so it asks for the typing rather than colouring the row red.
 */
export function shiftCell(row: DealerDayRow, reportingDate: string): CellState {
  const href = `/data-vault?dataset=iras-shift-data&date=${reportingDate}`;
  const editor = `/data-vault/dealers/${row.dealerId}/days/${reportingDate}`;
  if (!row.shift.attached) return { label: 'Not set up', intent: 'neutral', href };
  if (row.shift.status === 'COMPLETE') {
    return {
      label: row.shift.source === 'MANUAL' ? 'Typed in' : 'Collected',
      intent: 'success',
      href: editor,
    };
  }
  if (row.shift.status === 'PARTIAL') {
    return { label: 'Partly collected', intent: 'warning', href: editor };
  }
  if (row.shift.status === 'FAILED') {
    return {
      label: 'Collection failed',
      intent: 'danger',
      href: editor,
      hint: row.shift.failureReason ?? undefined,
    };
  }
  if (row.shift.portalCollection === 'PAUSED') {
    return { label: 'Type it in', intent: 'warning', href: editor };
  }
  return { label: 'No data', intent: 'danger', href: editor };
}

/** Was the day-book built, and is it still valid? */
export function dsrCell(row: DealerDayRow): CellState {
  const href = row.dsr.reportId
    ? `/dsr/dealers/${row.dealerId}?report=${row.dsr.reportId}`
    : `/dsr/dealers/${row.dealerId}`;
  if (!row.dsr.attached) return { label: 'Not set up', intent: 'neutral', href };
  if (!row.dsr.reportId) return { label: 'Not generated', intent: 'warning', href };
  // Stale outranks warnings: a receipt correction invalidates the edited day and
  // every later one, so the figures on it are known to be wrong, not merely odd.
  if (row.dsr.stale) return { label: 'Figures moved', intent: 'danger', href };
  if (row.dsr.warningCount > 0) {
    return {
      label: `${row.dsr.warningCount} warning${row.dsr.warningCount === 1 ? '' : 's'}`,
      intent: 'warning',
      href,
      hint: row.dsr.firstWarning ?? undefined,
    };
  }
  return { label: 'Generated', intent: 'success', href };
}

/** Did it actually reach the dealer? */
export function sentCell(row: DealerDayRow): CellState {
  const href = row.dsr.reportId
    ? `/dsr/dealers/${row.dealerId}?report=${row.dsr.reportId}`
    : `/dsr/dealers/${row.dealerId}`;
  if (row.sent.supersededSharedAt && !row.sent.sharedAt) {
    return { label: 'Old copy with dealer', intent: 'danger', href };
  }
  if (row.sent.sharedAt) {
    return { label: `Sent ${timeOfDay(row.sent.sharedAt)}`, intent: 'success', href };
  }
  if (!row.dsr.reportId) return { label: '—', intent: 'neutral', href };
  return { label: 'Not sent', intent: 'warning', href };
}

/**
 * What Kavach is holding for this outlet.
 *
 * A dealer with no programme reads "Not scored yet" — never 0% and never 100%.
 * Both of those are claims, and neither is true of an outlet nobody has set up.
 */
export function kavachCell(row: DealerDayRow): CellState {
  const base = `/kavach?dealerId=${row.dealerId}`;
  if (!row.kavach.hasProgramme) {
    return { label: 'Not scored yet', intent: 'neutral', href: base };
  }
  if (row.kavach.sosFlagged > 0) {
    return {
      label: `${row.kavach.sosFlagged} flagged on a visit`,
      intent: 'danger',
      href: `${base}&status=SOS_FLAGGED`,
    };
  }
  if (row.kavach.expired > 0) {
    return {
      label: `${row.kavach.expired} overdue`,
      intent: 'danger',
      href: `${base}&status=EXPIRED`,
    };
  }
  if (row.kavach.submitted > 0) {
    return {
      label: `${row.kavach.submitted} to review`,
      intent: 'warning',
      href: `${base}&awaitingReview=1`,
    };
  }
  if (row.kavach.held > 0) {
    return { label: `${row.kavach.held} on hold`, intent: 'warning', href: `${base}&status=HELD` };
  }
  return { label: 'Nothing', intent: 'success', href: base };
}

/** Is anybody at this outlet waiting on us? */
export function chatCell(row: DealerDayRow, now: number): CellState {
  const href = row.chat.conversationId
    ? `/inbox?c=${row.chat.conversationId}&lens=all`
    : '/inbox?lens=all';
  if (row.chat.oldestAwaitingSince) {
    return {
      label: `Waiting ${ageSince(row.chat.oldestAwaitingSince, now)}`,
      intent: 'warning',
      href,
    };
  }
  if (row.chat.unread > 0) {
    return { label: `${row.chat.unread} unread`, intent: 'neutral', href };
  }
  return { label: 'Nothing', intent: 'success', href };
}

/**
 * The one button a board row offers: the next unmet step in the chain.
 *
 * One, not four. A row with four buttons is a row nobody reads, and the steps
 * are strictly ordered anyway — you cannot generate from figures that have not
 * arrived, and you cannot send a report that does not exist.
 */
export type BoardAction =
  | { kind: 'collect'; label: string; path: string; body: Record<string, string> }
  | { kind: 'type'; label: string; href: string }
  | { kind: 'generate'; label: string; path: string; body: Record<string, string> }
  | { kind: 'share'; label: string; path: string; confirm: string }
  | null;

export function boardAction(row: DealerDayRow, reportingDate: string): BoardAction {
  const who = dealerCodeLabel(row.dealerCode);
  if (row.shift.attached && row.shift.status !== 'COMPLETE') {
    if (row.shift.portalCollection === 'PAUSED') {
      return {
        kind: 'type',
        label: 'Type it in',
        href: `/data-vault/dealers/${row.dealerId}/days/${reportingDate}`,
      };
    }
    return {
      kind: 'collect',
      label: 'Collect',
      path: `/iras-data/dealers/${row.dealerId}/collect`,
      body: { businessDate: reportingDate },
    };
  }
  if (row.shift.status === 'COMPLETE' && row.dsr.attached && !row.dsr.reportId) {
    return {
      kind: 'generate',
      label: 'Generate',
      path: `/dsr/dealers/${row.dealerId}/generate`,
      body: { businessDate: reportingDate },
    };
  }
  if (row.dsr.reportId && !row.sent.sharedAt) {
    return {
      kind: 'share',
      label: row.sent.supersededSharedAt ? 'Send the new copy' : 'Send',
      path: `/dsr/reports/${row.dsr.reportId}/share`,
      confirm: `Send the ${dayInWords(reportingDate)} report to ${who}? The dealer sees it in their chat straight away.`,
    };
  }
  return null;
}

// -------------------------------------------------------------- the verdict

/**
 * The sentence at the top of the page.
 *
 * It reads from the same `done` the grid does — computed once on the server —
 * so the headline and the rows below it can never disagree.
 */
export function verdictSentence(data: OverviewDay): string {
  const { done, behind, dealersTotal } = data.summary;
  // "for yesterday" and "for Fri 5 Sep" both read naturally, so one form covers
  // the relative and the absolute case.
  const prefix = `for ${dayRelativeToToday(data.reportingDate, data.today)}`;
  const blind = data.checks.filter((c) => !c.ok).length;
  if (dealersTotal === 0) {
    return blind > 0
      ? 'Could not read the outlets just now.'
      : 'No outlets are set up yet.';
  }
  if (behind === 0) {
    const ran = data.checks.length - blind;
    return blind > 0
      ? `All clear on ${ran} of ${data.checks.length} checks — ${blind} could not run.`
      : `All ${spell(dealersTotal)} outlets are done ${prefix}.`;
  }
  if (done === 0) {
    return `None of the ${spell(dealersTotal)} outlets are done ${prefix}.`;
  }
  return `${spell(behind)} of ${spell(dealersTotal)} outlets ${behind === 1 ? 'is' : 'are'} behind ${prefix}.`;
}

/** The muted line under the verdict: what else is outstanding, in plain words. */
export function verdictDetail(data: OverviewDay): string {
  const bits: string[] = [];
  if (data.summary.peopleWaiting > 0) {
    bits.push(
      `${data.summary.peopleWaiting} ${data.summary.peopleWaiting === 1 ? 'person is' : 'people are'} waiting`,
    );
  }
  if (data.summary.notSent > 0) {
    bits.push(`${data.summary.notSent} not sent`);
  }
  const failed = data.checks.filter((c) => !c.ok).length;
  if (failed > 0) {
    bits.push(`${failed} check${failed === 1 ? '' : 's'} could not run`);
  }
  if (bits.length === 0) {
    const ran = data.checks.length;
    return `${ran} check${ran === 1 ? '' : 's'} ran at ${timeOfDay(data.asOf)}.`;
  }
  return bits.join(' · ');
}

/**
 * Is the page allowed to claim all-clear?
 *
 * Only when every check actually ran. Absence is what a quiet page uses as
 * evidence, so a check that could not run must downgrade the claim rather than
 * silently vanish from it.
 */
export function allChecksRan(data: OverviewDay): boolean {
  return data.checks.every((c) => c.ok);
}
