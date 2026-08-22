import { inrFormat } from '@/lib/format';
import type {
  AssistChannel,
  AssistCostSplit,
  AssistEndReason,
  AssistFlag,
  AssistFollowupStatus,
  AssistGuardStage,
  AssistLang,
  AssistSessionStatus,
} from '@dk/shared';

/**
 * Plain-words vocabulary for the assistant console.
 *
 * Every enum in `@dk/shared/types/assist` is a name an engineer chose. The
 * person reading this screen is deciding whether to ring a stranger back or to
 * block them, and `drive-by` / `prompt-echo` / `speech-budget` tell them
 * nothing. Nothing on the page prints a raw enum value; it prints one of these.
 */

/**
 * Paise → rupees, the ONE place the conversion happens.
 *
 * Every money figure the assistant records is an integer count of paise —
 * `estPaise`, `todayPaise`, `budgetPaise` — because a fraction of a rupee
 * accumulated over ten thousand turns is exactly where a float loses the plot.
 * Dividing by 100 anywhere else is how one screen ends up a hundred times out.
 */
export function formatPaise(paise?: number | null): string {
  if (paise === undefined || paise === null || !Number.isFinite(paise)) return '—';
  return inrFormat(paise / 100);
}

/**
 * The vendor split of a bill, or `null` when the row does not carry one.
 *
 * The split is DERIVED — the counters and the rate table were always stored, so
 * every row the current API answers with has one. The tolerance is for the
 * browser that was left open across the deploy which added it: a page holding
 * pre-split rows must fall back to printing the total, not to a blank screen.
 */
export function costSplitOf(row: { costSplit?: AssistCostSplit }): AssistCostSplit | null {
  const split = row.costSplit;
  if (!split) return null;
  if (!Number.isFinite(split.vertexPaise) || !Number.isFinite(split.voicePaise)) return null;
  return split;
}

/**
 * `AI ₹0.12 · Voice ₹2.30` — the split as a tooltip, for the places where only
 * the total fits on screen. `undefined` when there is no split to show, so it
 * can be handed straight to a `title` attribute without printing "undefined".
 */
export function costSplitTitle(row: { costSplit?: AssistCostSplit }): string | undefined {
  const split = costSplitOf(row);
  if (!split) return undefined;
  return `AI ${formatPaise(split.vertexPaise)} · Voice ${formatPaise(split.voicePaise)}`;
}

/**
 * The split said in one sentence, with the real percentage in it.
 *
 * Written as "speech is N%" in both directions rather than naming whichever
 * side happens to be bigger: the whole reason this number is on the screen is
 * that speech is charged per character SPOKEN and is nearly the entire bill, so
 * the day that stops being true is exactly the day the sentence must show it.
 */
export function spendSplitSentence(split: AssistCostSplit, period: string): string {
  const total = split.vertexPaise + split.voicePaise;
  if (total <= 0) return `Nothing has been spent over ${period}.`;
  const voicePct = Math.round((split.voicePaise / total) * 100);
  return `Speech is ${voicePct}% of the bill over ${period} — the AI itself is the other ${100 - voicePct}%.`;
}

export function channelLabel(channel: AssistChannel): string {
  switch (channel) {
    case 'chat':
      return 'Chat';
    case 'voice-note':
      return 'Voice note';
    case 'call':
      return 'Call';
    default:
      return channel;
  }
}

export function langLabel(lang: AssistLang): string {
  return lang === 'hi' ? 'Hindi' : 'English';
}

export function sessionStatusLabel(status: AssistSessionStatus): string {
  switch (status) {
    case 'active':
      return 'Still talking';
    case 'ended':
      return 'Finished';
    case 'escalated':
      return 'Wants a call back';
    default:
      return status;
  }
}

export function followupLabel(status: AssistFollowupStatus): string {
  switch (status) {
    case 'new':
      return 'Not touched yet';
    case 'contacted':
      return 'We rang them';
    case 'closed':
      return 'Done with';
    default:
      return status;
  }
}

/** Why the conversation stopped, said the way a person would say it. */
export function endReasonText(reason?: AssistEndReason): string | null {
  if (!reason) return null;
  switch (reason) {
    case 'visitor-left':
      return 'they left';
    case 'inactivity':
      return 'they went quiet';
    case 'max-duration':
      return 'hit the 15-minute limit';
    case 'max-turns':
      return 'hit the limit on how many questions one visit gets';
    case 'speech-budget':
      return 'used up the talking time one call gets';
    case 'abuse':
      return 'ended after abuse';
    case 'blocked':
      return 'they are blocked';
    case 'error':
      return 'something on our side broke';
    case 'capacity':
      return 'no line was free';
    case 'shutdown':
      return 'the server restarted';
    default:
      return reason;
  }
}

/**
 * The short phrase that finishes "we did not answer this — …" on a turn a
 * guard replaced.
 */
export function guardStageText(stage: AssistGuardStage): string {
  switch (stage) {
    case 'rules-in':
      return 'the question was off limits';
    case 'classifier':
      return 'the question was off limits';
    case 'ungrounded':
      return 'we have nothing written down on it';
    case 'rules-out':
      return 'the draft answer broke a rule';
    case 'leak':
      return 'the draft gave away how we work';
    case 'pricing':
      return 'pricing';
    case 'prompt-echo':
      return 'the draft repeated its own instructions';
    case 'no-citation':
      return 'the draft cited nothing';
    default:
      return stage;
  }
}

/**
 * Two or three words, for a chip in a table column.
 *
 * Separate from `flagShortText` because a badge is a fixed-height pill: a whole
 * sentence inside one wraps to three lines and the coloured box, which does not
 * grow with it, spills over the rows above and below. Anything printed inside a
 * `<Badge>` has to fit on one line at a column's width — the sentence goes in
 * the tooltip beside it, and the whole sentence is in the drawer.
 */
export function flagChipText(flag: AssistFlag): string {
  switch (flag.kind) {
    case 'repeat-fingerprint':
      return 'Repeat visitor';
    case 'drive-by':
      return 'Drive-by';
    case 'duplicate-opening':
      return 'Same opening';
    case 'abusive':
      return 'Abusive';
    case 'bad-mobile':
      return 'Bad numbers';
    case 'guard-hits':
      return 'Off-limits asks';
    default:
      return flag.kind;
  }
}

/**
 * Why the spam pass flagged this visit, in a sentence. No counts — this is the
 * version for somewhere a sentence fits: the drawer, and the Flagged tab, where
 * the reason is the whole point of the row. A chip gets `flagChipText`.
 */
export function flagShortText(flag: AssistFlag): string {
  switch (flag.kind) {
    case 'repeat-fingerprint':
      return 'Several visits from the same number in a day';
    case 'drive-by':
      return 'Turned up and left again without asking anything, more than once';
    case 'duplicate-opening':
      return 'Opened with the very same line as an earlier visit';
    case 'abusive':
      return 'Was abusive more than once';
    case 'bad-mobile':
      return 'Gave several mobile numbers that were not real numbers';
    case 'guard-hits':
      return 'Kept asking for things we will not answer';
    default:
      return flag.kind;
  }
}

/**
 * The same sentence with the computed counts on the end.
 *
 * `detail` carries the actual figures ("4 in 24h"), so it is appended rather
 * than replacing the sentence: the words say what happened, the detail says how
 * much. A reason with no numbers in it is not a reason anyone can act on.
 */
export function flagReasonText(flag: AssistFlag): string {
  const base = flagShortText(flag);
  return flag.detail ? `${base} — ${flag.detail}` : base;
}

const DOC_LABELS: Record<string, string> = {
  'mdg-2024': 'MDG 2024',
  mdg2024: 'MDG 2024',
  'display-boards': 'Display boards',
  'first-aid-kit': 'First aid kit',
  'toilet-cleanliness': 'Toilet cleanliness advisory',
  'mdg-services': 'What MDG does',
};

/** `mdg-2024` → `MDG 2024`. An unknown id is shown as-is rather than hidden. */
export function docLabel(docId: string): string {
  return DOC_LABELS[docId] ?? docId.replace(/[-_]/g, ' ');
}

/** `p.7`, or `p.7–9` when the passage straddles a page break. */
export function pageLabel(pageFrom: number, pageTo: number): string {
  return pageTo > pageFrom ? `p.${pageFrom}–${pageTo}` : `p.${pageFrom}`;
}
