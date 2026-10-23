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
import type {
  DealerDayRow,
  DsrSheet,
  DsrSheetAudience,
  DsrSheetHolders,
  DsrSheetPlan,
  OverviewDay,
  ShareAudience,
  TriageItem,
} from '@dk/shared';
import {
  DSR_SHEET_LABELS,
  DSR_SHEETS,
  dealerCodeLabel,
  dsrPlanSendsAnything,
} from '@dk/shared';


/**
 * A board row as the server sends it. `sent.outlet` is who is on the app at the
 * outlet today (owners counted, manager yes or no). Missing means the server
 * could not read it, or is an older one.
 */
export type BoardRow = DealerDayRow;

/** A rendered cell: the word, its colour, and where tapping it goes. */
export interface CellState {
  label: string;
  intent: Intent;
  href: string;
  /** Long-form, shown as the row's hint on a phone where there is room. */
  hint?: string;
  /**
   * Who the cell is about, written after the badge rather than inside it: a
   * badge is one nowrap line of fixed height, and "Sent 09:12 · owners and
   * manager" does not fit in half a phone card.
   */
  who?: string;
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
 *
 * A bill past its due date (`payment_overdue`) is money, not a to-do, so it is
 * red like a stale card. The other onboarding rows — a call to make, a step MDG
 * owes, a held message — are this morning's work and amber like any other.
 */
export function triageIntent(item: TriageItem): Intent {
  if (item.bucket === 'context') return 'neutral';
  switch (item.kind) {
    case 'login_rejected':
    case 'credit_card_superseded':
    case 'dsr_superseded':
    case 'waiting_urgent':
    case 'payment_overdue':
      return 'danger';
    default:
      return 'warning';
  }
}

/**
 * Is this row's one-tap a credit card send? Those go to owners only (the card
 * prints the outlet's credit position, and the manager's group chat cannot be
 * un-posted), so the row asks through a menu where Manager and Both are shown
 * greyed out, with the reason.
 */
export function isCreditShare(item: TriageItem): boolean {
  return item.kind === 'credit_card_superseded' || item.kind === 'credit_card_unsent';
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

/** The report's own page, or the outlet's DSR page when there is no report yet. */
function reportHref(row: DealerDayRow): string {
  return row.dsr.reportId
    ? `/dsr/dealers/${row.dealerId}?report=${row.dsr.reportId}`
    : `/dsr/dealers/${row.dealerId}`;
}

/** Was the day-book built, and is it still valid? */
export function dsrCell(row: DealerDayRow): CellState {
  const href = reportHref(row);
  if (!row.dsr.attached) return { label: 'Not set up', intent: 'neutral', href };
  if (!row.dsr.reportId) return { label: 'Not generated', intent: 'warning', href };
  // Stale outranks warnings: a receipt correction invalidates the edited day and
  // every later one, so the figures on it are known to be wrong, not merely odd.
  if (row.dsr.stale) {
    return {
      label: 'Figures moved',
      intent: 'danger',
      href,
      hint: row.sent.sharedAt ? STALE_SENT_REASON : STALE_REASON,
    };
  }
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

/** "owners and manager", "owners", "manager", or '' — the people, without counts. */
export function holdersWords(h: DsrSheetHolders): string {
  if (h.owners > 0 && h.manager) return 'owners and manager';
  if (h.owners > 0) return 'owners';
  if (h.manager) return 'manager';
  return '';
}

/** Everyone who holds at least one of the two sheets. */
function anyHolder(holders: Record<DsrSheet, DsrSheetHolders>): DsrSheetHolders {
  return {
    owners: Math.max(holders.sales.owners, holders.variation.owners),
    manager: holders.sales.manager || holders.variation.manager,
  };
}

/**
 * Which sheet reached whom, but only when it differs between the sheets. When
 * both went to the same people the cell's own words already say it, and a
 * second sentence repeating them is noise on a phone card. Short names and no
 * counts: this has to fit a half-width tile.
 */
export function sheetsHint(holders: Record<DsrSheet, DsrSheetHolders>): string | undefined {
  const { sales, variation } = holders;
  if (sales.owners === variation.owners && sales.manager === variation.manager) return undefined;
  const short: Record<DsrSheet, string> = { sales: 'Sales', variation: 'Variation' };
  return DSR_SHEETS.map((sheet) => `${short[sheet]}: ${holdersWords(holders[sheet]) || 'not sent'}.`).join(
    ' ',
  );
}

/** Did a sheet reach this side — somebody of it holds the sheet. */
function sidesOf(h: DsrSheetHolders): { owners: boolean; manager: boolean } {
  return { owners: h.owners > 0, manager: h.manager };
}

/**
 * The people a sent report reached, in words that stay true when the two sheets
 * went to different people.
 *
 * "owners and manager" alone, for a report whose stock variation sheet went to
 * the owners only, reads as if the manager got the verdict too. So when the
 * sides differ the narrower sheet is named right in the text: "owners and
 * manager · variation owners only". Where neither sheet sits inside the other
 * (sales to the manager, variation to the owners) each is spelled out.
 */
export function sentWho(holders: Record<DsrSheet, DsrSheetHolders>): string {
  const union = holdersWords(anyHolder(holders));
  const sales = sidesOf(holders.sales);
  const variation = sidesOf(holders.variation);
  if (sales.owners === variation.owners && sales.manager === variation.manager) return union;
  const none = (x: { owners: boolean; manager: boolean }) => !x.owners && !x.manager;
  if (none(variation)) return `${union} · variation not sent`;
  if (none(sales)) return `${union} · sales not sent`;
  const inside = (x: { owners: boolean; manager: boolean }, y: { owners: boolean; manager: boolean }) =>
    (!x.owners || y.owners) && (!x.manager || y.manager);
  if (inside(variation, sales)) return `${union} · variation ${holdersWords(holders.variation)} only`;
  if (inside(sales, variation)) return `${union} · sales ${holdersWords(holders.sales)} only`;
  return `sales ${holdersWords(holders.sales)} · variation ${holdersWords(holders.variation)}`;
}

/** Said when nobody from the outlet is on the app, so there is nobody to send to. */
export const NOBODY_ON_APP_HINT = 'Nobody from this outlet is on the app yet.';

/** Did it actually reach the dealer — and whom? */
export function sentCell(row: BoardRow): CellState {
  const href = reportHref(row);
  if (row.sent.supersededSharedAt && !row.sent.sharedAt) {
    return { label: 'Old copy with dealer', intent: 'danger', href };
  }
  if (row.sent.sharedAt) {
    const label = `Sent ${timeOfDay(row.sent.sharedAt)}`;
    const holders = row.sent.holders;
    if (holders) {
      const who = sentWho(holders);
      // Sent, and nobody who got it is on the app now (an owner was replaced).
      // That is not "done" in any sense that matters to the dealer.
      if (!holdersWords(anyHolder(holders))) {
        // Nobody at all on the app: the report has no button to send again, so
        // the hint must not send the admin there to look for one.
        const outlet = row.sent.outlet;
        const nobodyAtAll = !!outlet && outlet.owners === 0 && !outlet.manager;
        return {
          label,
          intent: 'warning',
          href,
          who: nobodyAtAll ? 'nobody on the app' : 'nobody on the app now',
          hint: nobodyAtAll
            ? NOBODY_ON_APP_HINT
            : 'Nobody who was sent this is on the app now. Open the report to send it again.',
        };
      }
      return { label, intent: 'success', href, who, hint: sheetsHint(holders) };
    }
    // `null` is a fact about the report (sent before copies were listed);
    // missing is only that the server could not read the outlet's people just now.
    return {
      label,
      intent: 'success',
      href,
      ...(holders === null ? { hint: 'Sent before MDG recorded who got it.' } : {}),
    };
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
  | {
      kind: 'share';
      label: string;
      path: string;
      confirm: string;
      /**
       * The outlet's saved rule for who gets each sheet. Set: the row gets one
       * Send button, whose confirm states the rule and which posts nothing but
       * `{}` — the server applies the rule, so the screen cannot disagree with it.
       * Null: the outlet has no rule, and the row asks who (Owners / Manager / Both).
       */
      rule: DsrSheetPlan | null;
    }
  // A report that must not be sent as it is. The admin is taken to it instead.
  | { kind: 'blocked'; label: string; reason: string; href: string }
  | null;

/** Why a stale report is not offered for sending. */
const STALE_REASON =
  'The figures behind this report changed after it was built. Regenerate it before it is sent.';
const STALE_SENT_REASON =
  'The figures changed after this was sent. Regenerate it and send the corrected copy.';

const AUDIENCE_PHRASE: Record<DsrSheetAudience, string> = {
  none: 'not sent',
  owners: 'owners only',
  managers: 'the manager only',
  both: 'owners and the manager',
};

/**
 * An outlet's rule in plain words, for the confirm:
 * "Daily sales → owners and the manager. Stock variation → owners only."
 */
export function ruleSentence(rule: DsrSheetPlan): string {
  return DSR_SHEETS.map((sheet) => `${DSR_SHEET_LABELS[sheet]} → ${AUDIENCE_PHRASE[rule[sheet]]}.`).join(
    ' ',
  );
}

/**
 * What the confirm must say when an outlet with NO saved rule is sent to the
 * manager: that BOTH sheets go, including the stock variation sheet with its
 * within-limit or over-limit verdict. A pick of "Manager" or "Both" gives the
 * same people both sheets, and nothing else on the confirm says there are two.
 * Null for "Owners", which is what a send has always meant.
 */
export function noRuleSheetsNote(audience: ShareAudience | undefined): string | null {
  if (audience !== 'managers' && audience !== 'both') return null;
  const who = audience === 'both' ? 'the owners and the manager' : 'the manager';
  return (
    `Both sheets go to ${who}: daily sales, and stock variation with its within-limit or over-limit verdict. ` +
    'To keep variation to the owners, open the report and choose who gets each sheet, or save a rule there.'
  );
}

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
    // A stale report is one the server's own check refuses to release (and, where
    // the check only observes, would send with figures known to be out of date).
    // The Report cell already says "Figures moved"; the button must not say Send.
    if (row.dsr.stale) {
      return {
        kind: 'blocked',
        label: 'Regenerate first',
        reason: STALE_REASON,
        href: reportHref(row),
      };
    }
    const rule = row.dsr.shareRule && dsrPlanSendsAnything(row.dsr.shareRule) ? row.dsr.shareRule : null;
    const day = dayInWords(reportingDate);
    // Only a chat that holds the old copy gets the "revised" banner; the sentence
    // says so rather than promising it to everybody.
    const revised = row.sent.supersededSharedAt
      ? ' Anyone who has the old copy gets it marked as revised.'
      : '';
    return {
      kind: 'share',
      label: row.sent.supersededSharedAt ? 'Send the new copy' : 'Send',
      path: `/dsr/reports/${row.dsr.reportId}/share`,
      confirm: rule
        ? `Send the ${day} report to ${who}? ${ruleSentence(rule)}${revised}`
        : `Send the ${day} report to ${who}? The dealer sees it in their chat straight away.${revised}`,
      rule,
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
