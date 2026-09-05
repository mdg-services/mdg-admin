import {
  CircleSlash2,
  CornerUpRight,
  ExternalLink,
  FileText,
  MessageSquare,
  PenLine,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  Undo2,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  ClampedText,
  EmptyState,
  FilterBar,
  Label,
  Pagination,
  Select,
  Skeleton,
  Tabs,
  useToast,
} from '@/components/ui';
import {
  useAiTurnCountsQuery,
  useAiTurnsQuery,
  useReviewAiTurn,
} from '@/hooks/api/useAiTurns';
import { useConversationCounts } from '@/hooks/api/useConversations';
import { useDealersQuery } from '@/hooks/api/useDealers';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import {
  AI_HANDOFF_REASON_LABEL,
  AI_INTENT_LABEL,
  AI_LANG_LABEL,
  AI_OUTCOME_LABEL,
  AI_OUTCOME_TONE,
  AI_VERDICT_LABEL,
  aiCostLabel,
  aiPlanAsks,
  aiProduction,
  aiProseRate,
  aiReasonTone,
  aiRefusal,
  aiRuleHint,
  aiRuleLabel,
  aiToolLabel,
  aiTurnAge,
  aiWithheldAnswer,
  aiWriterSplit,
  dealerCodeLabel,
} from '@dk/shared';
import type {
  AiFirstLineLang,
  AiHandoffReason,
  AiProductionKind,
  AiTurn,
  AiTurnOutcome,
  AiTurnVerdict,
} from '@dk/shared';
import type { AiTurnListQuery } from '@dk/shared/schemas';

import { AiFirstLineSwitches } from './AiFirstLineSwitches';
import {
  OUTCOME_OPTIONS,
  REASON_OPTIONS,
  REVIEW_FACETS,
  activeFilterCount,
  facetQuery,
  resolveReviewFacet,
  type AiReviewFacet,
} from './format';

/**
 * Every answer the machine has given, across every dealer, newest first — and
 * the buttons that say whether it was any good.
 *
 * THIS PAGE IS THE SAFETY CASE. The feature's whole claim is that a machine
 * answering a customer is safe because a person reads what it said; that claim
 * is only true if somebody actually opens this screen. Which is why the default
 * view is `unreviewed` and why the nav item carries an unreviewed COUNT — a page
 * nobody is nudged to open is not a safety case, it is a page.
 *
 * WHAT v2 ADDED, AND WHY EACH THING IS ON THE ROW RATHER THAN BEHIND A CLICK
 * -------------------------------------------------------------------------
 * The machine now writes its own sentences. Three things follow, and all three
 * have to be legible while SCANNING, because a reviewer with sixty rows and ten
 * minutes opens almost none of them:
 *
 *  - HOW THE REPLY WAS PRODUCED — written, a fixed sentence, or a handoff. Under
 *    v1 there was one answer and it was "a person wrote it, months ago". There
 *    are now four, they carry different risk, and they are reviewed differently.
 *  - THE SENTENCE WE REFUSED TO SEND, with the rules that refused it. This is
 *    the most valuable thing on the page twice over: it is the only evidence
 *    that says whether a refusal was RIGHT — and it exists nowhere else, because
 *    the dealer never saw the text and it was never posted — and it is the only
 *    evidence that the guard is doing anything at all. A fence with no visible
 *    refusals looks exactly like a fence that is switched off.
 *  - WHICH LOOKUPS RAN. A turn used to run one; it now runs up to five in one
 *    batch, so this stopped being a footnote and became the answer to "why did
 *    it say that?".
 *
 * ADMIN, not super-admin, for the reading and the judging. The people who answer
 * the tickets are the people who can tell whether an answer was any good; gating
 * this behind super-admin would mean the verdicts came from whoever had the
 * rights rather than whoever had the context. Only the SWITCHES at the bottom
 * are super-admin.
 */

const PAGE_SIZE = 20;

/**
 * The four verdicts, as buttons, in the order somebody reaches for them.
 *
 * `POORLY_WORDED` sits beside `WRONG` on purpose and their labels carry the
 * narrow meaning rather than the enum's name, because a verdict's semantics live
 * at the point of the click. ONLY `WRONG` TRIPS THE BREAKER: three of them in
 * twenty-four hours switch the whole first line off. A reviewer who reaches for
 * it because the Hindi was stiff has spent one of three lives on a sentence that
 * was entirely true — which, without this fourth button, is what a fortnight of
 * careful review would have done.
 */
const VERDICT_BUTTONS: ReadonlyArray<{
  verdict: AiTurnVerdict;
  icon: LucideIcon;
  /**
   * The word ON the button. The full sentence stays in `AI_VERDICT_LABEL` and
   * reaches the reviewer twice — in the `title`, and once per screen in the
   * legend above the list.
   *
   * IT USED TO BE THE SENTENCE, and the sentence is what broke the page. A
   * button cannot wrap, so "Wrong — it stated something untrue" set a ~300px
   * floor under the last column of a seven-column table; the columns that CAN
   * wrap paid for it, and the answer being judged was rendered two words to a
   * line. The meaning is not lost by moving it: a verdict is chosen once, and
   * the sentence is there at the moment of choosing.
   */
  label: string;
  /** The paint when this verdict is the one standing. */
  activeVariant: 'primary' | 'danger';
}> = [
  { verdict: 'RIGHT', icon: ThumbsUp, label: 'Looks right', activeVariant: 'primary' },
  /**
   * RED ONLY ONCE CHOSEN, never at rest. Twenty rows each carrying a filled red
   * button is a screen whose loudest colour means "not yet decided", and a team
   * that reads this page daily stops seeing red at all — which is a problem on
   * the one control that trips the breaker.
   */
  { verdict: 'WRONG', icon: ThumbsDown, label: 'Wrong', activeVariant: 'danger' },
  {
    verdict: 'POORLY_WORDED',
    icon: PenLine,
    label: 'Badly written',
    activeVariant: 'primary',
  },
  {
    verdict: 'SHOULD_HAVE_HANDED_OFF',
    icon: UserPlus,
    label: 'Should have handed off',
    activeVariant: 'primary',
  },
];

function VerdictButtons({
  turn,
  onReview,
  busy,
}: {
  turn: AiTurn;
  onReview: (verdict: AiTurnVerdict) => void;
  busy: boolean;
}) {
  const current = turn.review?.verdict;
  return (
    <>
      {VERDICT_BUTTONS.map(({ verdict, icon: Icon, label, activeVariant }) => {
        const active = current === verdict;
        return (
          <Button
            key={verdict}
            size="sm"
            // A verdict may be CHANGED — the same admin looking again, or a
            // colleague who knows the dealer — so the current one is shown as
            // pressed rather than locking the row. The breaker reads the same
            // field, so a corrected verdict corrects the breaker too.
            variant={active ? activeVariant : 'secondary'}
            aria-pressed={active}
            disabled={busy}
            onClick={() => onReview(verdict)}
            title={AI_VERDICT_LABEL[verdict]}
            leftIcon={<Icon width={14} height={14} strokeWidth={1.75} />}
          >
            {label}
          </Button>
        );
      })}
    </>
  );
}

/**
 * The glyph for each way a reply can be produced.
 *
 * SHAPE AND TEXT, NEVER COLOUR ALONE, and here it is load-bearing rather than
 * polite: a handoff and a refused template deliberately share amber — they are
 * the two rows worth a second look — so the pen, the page and the arrow are what
 * actually tell them apart, on the greyscale a cheap phone in bright sun
 * effectively is.
 */
const PRODUCTION_ICON: Record<AiProductionKind, LucideIcon> = {
  written: PenLine,
  template: FileText,
  handoff: CornerUpRight,
  silent: CircleSlash2,
};

/** How this turn's reply was made — the column v2 is supervised through. */
function ProductionMark({ turn }: { turn: AiTurn }) {
  const view = aiProduction(turn);
  if (!view) return null;
  const Icon = PRODUCTION_ICON[view.kind];
  return (
    <Badge intent={view.tone} title={view.hint}>
      <span className="inline-flex items-center gap-1">
        <Icon width={11} height={11} strokeWidth={2} />
        {view.label}
      </span>
    </Badge>
  );
}

/**
 * Which lookups ran, in the words the question was asked in.
 *
 * NAMES, NEVER PAYLOADS. The turn log stores which lookups ran and deliberately
 * not what they returned — a turn log is not a data export — so what a lookup
 * found is visible through the answer it fed and never as a dump of a dealer's
 * figures on a support screen.
 *
 * An empty list is stated rather than left blank: "none" is a real and readable
 * fact about a greeting or a stand-down, and an empty cell reads as missing data.
 */
function Lookups({ turn }: { turn: AiTurn }) {
  const ids = turn.toolIds ?? [];
  if (ids.length === 0) {
    return <span className="text-xs text-text-subtle">No lookup ran</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ids.map((id, i) => (
        <span
          key={`${id}-${i}`}
          // `whitespace-nowrap` for the reason `Badge` carries it: squeezed by a
          // flex neighbour these broke a two-word label one word to a line, so
          // "Papers open, both ways" rendered as a four-line column. Refusing to
          // wrap pushes the pressure onto the prose beside them, which has
          // `min-w-0 break-words` and can take it.
          className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-muted"
          title={id}
        >
          {aiToolLabel(id)}
        </span>
      ))}
    </div>
  );
}

/**
 * The marks that change nothing about the answer but change how it should be
 * read: a guard hit, a part-answered question, and a dealer who wrote straight
 * back.
 *
 * `quickFollowUp` is the dispute window's real value, kept. The old rule spent
 * that evidence on a HANDOFF that destroyed a perfectly good answer, and it
 * fired on "What do I need to do now?" on the very first real conversation. The
 * signal became a flag on the review queue instead of a gate on the reply — so
 * it belongs here, on the row, and nowhere in the machine's behaviour.
 */
function TurnMarks({ turn }: { turn: AiTurn }) {
  const guard = turn.guard;
  return (
    <>
      {guard ? (
        <Badge
          // Advisory guard hits are recorded and the turn carries on; only a
          // blocking one is an event. Amber for both rather than red, because a
          // guard firing is the guard WORKING — red here would teach the team to
          // read the screen's worst colour as normal.
          intent={guard.action === 'advisory' ? 'neutral' : 'warning'}
          title={`${guard.rules.map((r) => aiRuleLabel(r)).join(', ')} — ${
            guard.stage === 'input'
              ? 'caught in the dealer’s message, before the model saw it'
              : 'caught in what the writer produced'
          }.`}
        >
          <span className="inline-flex items-center gap-1">
            <ShieldAlert width={11} height={11} strokeWidth={2} />
            {guard.stage === 'input' ? 'Guard — message' : 'Guard — reply'}
          </span>
        </Badge>
      ) : null}
      {turn.partial ? (
        <Badge
          intent="warning"
          title="One of the things they asked about was refused or dropped. The reply carries a hand-written line saying the rest went to the team."
        >
          Answered part of it
        </Badge>
      ) : null}
      {turn.quickFollowUp ? (
        <Badge
          intent="neutral"
          title="The dealer wrote again within minutes of this answer. It changes nothing about the machine's behaviour — it is the cheapest quality signal there is, and under v1 it was unmeasurable."
        >
          <span className="inline-flex items-center gap-1">
            <Undo2 width={11} height={11} strokeWidth={2} />
            Wrote straight back
          </span>
        </Badge>
      ) : null}
    </>
  );
}

/**
 * THE SENTENCE WE DID NOT SEND, and the rules that stopped it.
 *
 * Shown in full — not clamped to a line, not behind a disclosure — because
 * judging whether a refusal was right means reading the whole sentence, and a
 * reviewer who has to click to see it will judge from the rule name alone. The
 * rule names carry their long form in a `title`, and the long form is the tuning
 * instruction: THE FIX FOR A HIGH REFUSAL RATE IS A BETTER ENVELOPE OR A CLEARER
 * PROMPT, NEVER A LOOSER FENCE.
 *
 * `attack` gets its own line rather than another badge. "The dealer planted this
 * figure and the machine repeated it back" is a different kind of finding from
 * "our Hindi was stiff", it is the one that marked the thread, and it must not
 * be readable as one more amber pill in a row of them.
 */
function RefusedProse({ turn }: { turn: AiTurn }) {
  const refusal = aiRefusal(turn);
  if (!refusal) return null;
  return (
    // No top margin: this is a grid child of the card now, and the card's own
    // `gap-3` sets the distance. It used to hang off the bottom of the answer.
    <div className="grid gap-1.5 rounded-md border border-border bg-surface-2 p-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
        It wanted to send this
      </p>
      {refusal.prose ? (
        <p className="min-w-0 whitespace-pre-wrap break-words text-sm text-text">
          {refusal.prose}
        </p>
      ) : null}
      <p className="text-xs text-text-muted">{refusal.headline}</p>
      {refusal.rules.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {refusal.rules.map((rule, i) => (
            <Badge key={`${rule}-${i}`} intent="warning" title={aiRuleHint(rule) ?? rule}>
              {aiRuleLabel(rule)}
            </Badge>
          ))}
        </div>
      ) : null}
      {refusal.attack ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-text">
          <ShieldAlert
            width={13}
            height={13}
            strokeWidth={2}
            className="mt-0.5 shrink-0"
          />
          <span>
            This one is evidence of an attempt, not a clumsy sentence — the thread
            is marked in the AI guard lens and only a super-admin clearing it
            removes that.
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** The outcome + reason + verdict trio, which is how a turn is read at a glance. */
function OutcomeCell({ turn }: { turn: AiTurn }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge intent={AI_OUTCOME_TONE[turn.outcome]}>
        {AI_OUTCOME_LABEL[turn.outcome]}
      </Badge>
      {turn.reason ? (
        <Badge intent={aiReasonTone(turn.reason)}>
          {AI_HANDOFF_REASON_LABEL[turn.reason]}
        </Badge>
      ) : null}
      {turn.review ? (
        <Badge intent={turn.review.verdict === 'WRONG' ? 'danger' : 'info'}>
          {AI_VERDICT_LABEL[turn.review.verdict]}
        </Badge>
      ) : null}
    </div>
  );
}

/**
 * What the machine said, or — when it composed something and kept it — what it
 * would have said, labelled as such.
 *
 * Labelling matters more than it looks. A shadow turn's answer never reached a
 * dealer, and a reviewer who reads it as something that DID would judge a
 * rehearsal as a live mistake, which is precisely the confusion the `SHADOW`
 * outcome exists to prevent.
 */
function AnswerCell({ turn }: { turn: AiTurn }) {
  const withheld = aiWithheldAnswer(turn);
  // `RefusedProse` used to hang off the bottom of this. It does not any more:
  // the refused sentence is the longest thing on the row and it now spans the
  // whole card, under both columns, where it has the measure to be read.
  return (
    <div className="grid min-w-0 gap-0.5">
      {withheld ? (
        <>
          <span className="text-xs font-medium uppercase tracking-wide text-text-subtle">
            Written, not sent
          </span>
          <ClampedText className="min-w-0 break-words text-sm text-text">
            {withheld}
          </ClampedText>
        </>
      ) : turn.answer ? (
        <ClampedText className="min-w-0 break-words text-sm text-text">
          {turn.answer}
        </ClampedText>
      ) : (
        <span className="text-sm text-text-subtle">Nothing was posted</span>
      )}
    </div>
  );
}

/** What the router made of the message: one line per thing they asked about. */
function AsksCell({ turn }: { turn: AiTurn }) {
  const asks = aiPlanAsks(turn.plan);
  if (asks.length === 0) {
    return (
      <span className="text-xs text-text-subtle">
        {turn.intent ? AI_INTENT_LABEL[turn.intent] : 'The model never ran'}
      </span>
    );
  }
  return (
    <div className="grid gap-0.5">
      {asks.map((ask, i) => (
        <span
          key={`${ask.intent}-${i}`}
          className={
            ask.primary ? 'text-xs text-text' : 'text-xs text-text-subtle'
          }
        >
          {ask.summary}
        </span>
      ))}
    </div>
  );
}

/** The small grey word that names a half of the card. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-wide text-text-subtle">
      {children}
    </span>
  );
}

/**
 * One turn, as a card the whole width of the page.
 *
 * WHY THIS IS NOT A TABLE ROW ANY MORE, and it is worth writing down because a
 * table is the obvious shape for "a list of turns" and it was the wrong one.
 * A row here holds a question, an answer, a refused sentence, a stack of badges
 * and four buttons — a document, not a record. In a seven-column `<table>` the
 * browser hands width to whatever cannot wrap, so the four buttons and the
 * badges took it and the two things a reviewer actually has to READ were left
 * around 200px each: an answer rendered two words to a line, a row over 1,000px
 * tall, and a wide empty band across the middle of the screen where the narrow
 * columns had nothing to fill it with.
 *
 * ONE LAYOUT FOR EVERY WIDTH, so the phone and the desktop cannot drift. The
 * card stacks below `lg` and splits into "they asked" / "it said" above it; the
 * table and the `MobileCardList` that used to be maintained side by side are
 * both gone. `MobileCardList`'s key/value shape was never right for this screen
 * anyway — its values are meant to be short, and three of these are paragraphs.
 *
 * THE PROSE COLUMN IS THE WIDE ONE and the ask column is capped at 20rem: the
 * question is a sentence, the answer is several. `minmax(0,…)` on both tracks
 * rather than a bare `20rem`, because a grid track sized by its content refuses
 * to shrink below `min-content` and overflows the card — the trap this repo has
 * already paid for on three pages.
 */
function TurnCard({
  turn,
  now,
  busy,
  onReview,
}: {
  turn: AiTurn;
  now: number;
  busy: boolean;
  onReview: (verdict: AiTurnVerdict) => void;
}) {
  return (
    <article className="grid gap-3 border-b border-border p-3 last:border-b-0 md:px-4 md:py-3.5">
      {/*
       * The identity strip. Everything here is a GLANCE fact — who, when, how it
       * was made, how it ended, what it cost — so it is one wrapping row above
       * the reading, rather than four columns beside it.
       */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Link
          to={`/inbox?c=${turn.conversationId}`}
          className="font-mono text-sm font-medium text-brand hover:underline"
        >
          {dealerCodeLabel(turn.dealerCode)}
        </Link>
        <span className="text-xs text-text-subtle">{aiTurnAge(turn.createdAt, now)}</span>
        {/* Hidden below sm, where the strip wraps and a lone 1px rule would
            start a line of its own. */}
        <span aria-hidden className="hidden h-3 w-px bg-border sm:inline-block" />
        <ProductionMark turn={turn} />
        <OutcomeCell turn={turn} />
        <TurnMarks turn={turn} />
        {/* Cost is the one number nobody scans for, so it goes to the far end
            and stays the quietest thing on the strip. */}
        <span className="ml-auto shrink-0 tabular-nums text-xs text-text-subtle">
          {aiCostLabel(turn.estPaise)}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-6">
        <div className="grid min-w-0 content-start gap-1.5">
          <FieldLabel>They asked</FieldLabel>
          <p className="min-w-0 break-words text-sm text-text-muted">
            {turn.question ? `“${turn.question}”` : '—'}
          </p>
          <AsksCell turn={turn} />
          <Lookups turn={turn} />
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <FieldLabel>It said</FieldLabel>
          <AnswerCell turn={turn} />
        </div>
      </div>

      {/* Full width, under both columns — see `RefusedProse`. */}
      <RefusedProse turn={turn} />

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        <span className="mr-1 text-xs text-text-subtle">Was this any good?</span>
        <VerdictButtons turn={turn} busy={busy} onReview={onReview} />
      </div>
    </article>
  );
}

/** Is this `$group` key one of the two languages this build has words for? */
function isLang(value: string): value is AiFirstLineLang {
  return value === 'hi' || value === 'en';
}

/**
 * How the last day went, in the two numbers this version is measured by, plus a
 * way into the guard lens.
 *
 * THE PROSE RATE IS THE HEADLINE and its threshold is stated rather than left to
 * the reader: below about 70% NOTHING HAS CHANGED — dealers are still reading
 * v1's fixed sentences and we are paying for a writer whose output is being
 * thrown away. The per-language line is COUNTS and not a second percentage, on
 * purpose: a screen carrying two rates over two different denominators is a
 * screen where somebody quotes the wrong one.
 */
function DayBand({
  counts,
  guardThreads,
}: {
  counts:
    | {
        writerIn24h: Record<string, number>;
        writerByLangIn24h: Record<string, Record<string, number>>;
        answeredIn24h: number;
        quickFollowUpIn24h: number;
      }
    | undefined;
  guardThreads: number | undefined;
}) {
  if (!counts) return null;
  const rate = aiProseRate(counts.writerIn24h, counts.answeredIn24h);
  const split = aiWriterSplit(counts.writerIn24h);
  const langs = Object.keys(counts.writerByLangIn24h ?? {}).sort();
  if (!rate && split.total === 0 && !guardThreads) return null;
  return (
    <Card>
      <CardContent className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-text-subtle">
            The last 24 hours
          </span>
          {rate ? (
            <Badge intent={rate.tone}>{`${rate.percent}% written`}</Badge>
          ) : (
            <Badge intent="neutral">Nothing answered yet</Badge>
          )}
        </div>
        {rate ? (
          <p className="min-w-0 break-words text-sm text-text-muted">
            {rate.sentence}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
          <span>
            <span className="tabular-nums font-medium text-text">{split.prose}</span>{' '}
            written
          </span>
          <span>
            <span className="tabular-nums font-medium text-text">
              {split.fallback}
            </span>{' '}
            refused
          </span>
          <span>
            <span className="tabular-nums font-medium text-text">
              {split.skipped + split.off}
            </span>{' '}
            template only
          </span>
          <span
            title="Answers the dealer wrote back to within minutes. It changes nothing about the machine's behaviour — it is the cheapest quality signal there is, and under v1 it was unmeasurable, because the old dispute rule handed off instead of recording."
          >
            <span className="tabular-nums font-medium text-text">
              {counts.quickFollowUpIn24h}
            </span>{' '}
            got a reply within minutes
          </span>
        </div>
        {langs.length > 0 ? (
          <p className="text-xs text-text-subtle">
            {/*
             * Split by language and not only in aggregate. A systematically high
             * rejection rate on Hindi would quietly mean Hindi dealers get
             * templates while English dealers get prose, and the aggregate would
             * look fine.
             */}
            {langs
              .map((lang) => {
                const s = aiWriterSplit(counts.writerByLangIn24h[lang]);
                // The key comes off a Mongo `$group`, so it is a string and not
                // necessarily one of the two languages this build knows about.
                const name = isLang(lang) ? AI_LANG_LABEL[lang] : lang;
                return `${name}: ${s.prose} written · ${s.fallback} refused`;
              })
              .join('   ·   ')}
          </p>
        ) : null}
        {guardThreads ? (
          <p className="text-sm">
            {/*
             * The way in to the flagging the owner asked for. It is a LENS on the
             * inbox and not a list on this page, because acting on a guard hit
             * means opening the thread and talking to the dealer — and the row
             * has to keep its place in every other tab while that happens.
             */}
            <Link
              to="/inbox?lens=ai-guard"
              className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
            >
              <ShieldAlert width={14} height={14} strokeWidth={1.75} />
              {guardThreads === 1
                ? '1 thread is marked in the AI guard lens'
                : `${guardThreads} threads are marked in the AI guard lens`}
              <ExternalLink width={12} height={12} strokeWidth={1.75} />
            </Link>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function AiAnswersPage() {
  const toast = useToast();
  const isSuperAdmin = useIsSuperAdmin();
  const [searchParams, setSearchParams] = useSearchParams();

  // The facet rides in the URL so a link to "everything this dealer was told"
  // can be pasted into a ticket. Everything else is page state.
  const facet = resolveReviewFacet(searchParams.get('view'));
  const [page, setPage] = React.useState(1);
  const [dealerId, setDealerId] = React.useState('');
  const [reason, setReason] = React.useState<AiHandoffReason | ''>('');
  const [outcome, setOutcome] = React.useState<AiTurnOutcome | ''>('');
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  // Ticks once a minute so the ages advance on their own, the same way the
  // inbox's SLA colours do, without waiting for new data to arrive.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  function setFacet(next: AiReviewFacet) {
    const params = new URLSearchParams(searchParams);
    params.set('view', next);
    setSearchParams(params, { replace: true });
    setPage(1);
  }

  /**
   * The facet's own clauses come LAST, so a facet always wins over the explicit
   * pickers. "Called wrong" plus an outcome of `SUPPRESSED` is a contradiction —
   * a suppressed turn posted nothing to be wrong about — and the honest
   * resolution is the one the operator chose most recently, which is the facet
   * they are standing in.
   */
  const query: AiTurnListQuery = {
    page,
    pageSize: PAGE_SIZE,
    ...(dealerId ? { dealerId } : {}),
    ...(outcome ? { outcome } : {}),
    ...(reason ? { reason } : {}),
    ...facetQuery(facet),
  };

  const turnsQ = useAiTurnsQuery(query);
  const countsQ = useAiTurnCountsQuery();
  // The guard lens's own count, off the inbox's existing counts round-trip. It
  // is a THREAD count and not a turn count, which is why it does not come from
  // `/ai-turns/counts` — the thing an admin acts on is the conversation.
  const inboxCountsQ = useConversationCounts();
  const review = useReviewAiTurn();
  // The roster for the dealer picker. One page of 200 covers the whole estate
  // several times over; this is a filter, not a directory.
  const dealersQ = useDealersQuery({ page: 1, pageSize: 200, sort: 'code' });

  const turns = turnsQ.data?.items ?? [];
  const total = turnsQ.data?.total ?? 0;
  const counts = countsQ.data;

  function applyVerdict(turn: AiTurn, verdict: AiTurnVerdict) {
    setPendingId(turn.id);
    review.mutate(
      { id: turn.id, input: { verdict } },
      {
        onSuccess: () => {
          toast.success(`Marked ${AI_VERDICT_LABEL[verdict].toLowerCase()}`);
          setPendingId(null);
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Could not save the verdict');
          setPendingId(null);
        },
      },
    );
  }

  function clearFilters() {
    setDealerId('');
    setOutcome('');
    setReason('');
    setPage(1);
  }

  const filters = (
    <>
      <div className="grid gap-1">
        <Label htmlFor="ai-dealer">Dealer</Label>
        <Select
          id="ai-dealer"
          value={dealerId}
          onChange={(e) => {
            setDealerId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Every dealer</option>
          {(dealersQ.data?.items ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {dealerCodeLabel(d.code)}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="ai-outcome">Outcome</Label>
        <Select
          id="ai-outcome"
          value={outcome}
          onChange={(e) => {
            setOutcome(e.target.value as AiTurnOutcome | '');
            setPage(1);
          }}
        >
          <option value="">Any outcome</option>
          {OUTCOME_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {AI_OUTCOME_LABEL[o]}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="ai-reason">Why it stopped</Label>
        <Select
          id="ai-reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value as AiHandoffReason | '');
            setPage(1);
          }}
        >
          <option value="">Any reason</option>
          {REASON_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {AI_HANDOFF_REASON_LABEL[r]}
            </option>
          ))}
        </Select>
      </div>
    </>
  );

  return (
    <div>
      <PageHeader
        title="AI answers"
        subtitle="Every reply the first line has given a dealer, newest first. Judging one takes a second and is the only thing that makes the feature safe to leave on."
      />

      {/* The breaker's position, stated before the list. "Two of three" is
          something a person can act on; discovering the feature has switched
          itself off is not. */}
      {counts && counts.wrongIn24h > 0 ? (
        // `Callout` has two intents, warning and info, and neither is red — so
        // the tripped case is carried by a badge and by the sentence rather than
        // by a colour this primitive does not have. Which is the right way round
        // anyway: "the first line has switched itself off" is the message, and a
        // red box that says the same thing in fewer words is not clearer.
        <Callout intent="warning">
          {counts.wrongIn24h >= counts.breakerAt ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <Badge intent="danger">Stopped</Badge>
              {`${counts.wrongIn24h} answers have been called wrong in the last 24 hours, so the first line has switched itself off.`}
            </span>
          ) : (
            `${counts.wrongIn24h} of ${counts.breakerAt} answers called wrong in the last 24 hours. At ${counts.breakerAt} the first line switches itself off.`
          )}
        </Callout>
      ) : null}

      <div className="mt-3 grid gap-3">
        <DayBand counts={counts} guardThreads={inboxCountsQ.data?.aiGuard} />

        {/*
         * `Tabs` and not `SegmentedControl`, and the swap is not cosmetic. The
         * primitive says two to four modes, its segments truncate under
         * pressure, and there are seven facets — at 360px each would be ~50px
         * of ellipsis. `Tabs` scrolls its strip horizontally inside itself and
         * keeps the selected one in view, which is exactly what a seven-item
         * chooser on a phone needs. It is also the honest description: these
         * swap the rows below them, which is a tab, not a mode toggle.
         */}
        <Tabs
          items={REVIEW_FACETS.map((f) => ({
            id: f.value,
            label:
              f.value === 'unreviewed' && counts
                ? `${f.label} · ${counts.unreviewed}`
                : f.value === 'refused' && counts
                  ? `${f.label} · ${aiWriterSplit(counts.writerIn24h).fallback}`
                  : f.label,
          }))}
          value={facet}
          onChange={(id) => setFacet(resolveReviewFacet(id))}
        />

        <FilterBar
          activeCount={activeFilterCount({ dealerId, outcome, reason })}
          onClear={clearFilters}
          columnsAtMd={3}
        >
          {filters}
        </FilterBar>

        <Card>
          <CardContent padding="none">
            {turnsQ.isLoading ? (
              <div className="grid gap-2 p-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : turns.length === 0 ? (
              <EmptyState
                icon={<MessageSquare width={28} height={28} strokeWidth={1.5} />}
                title={
                  facet === 'unreviewed'
                    ? 'Nothing left to review'
                    : facet === 'refused'
                      ? 'Nothing has been refused'
                      : 'No turns match'
                }
                description={
                  facet === 'unreviewed'
                    ? 'Every answer the machine has given has been looked at.'
                    : facet === 'refused'
                      ? 'Every sentence the writer composed passed its checks and went out as written.'
                      : 'Try a wider filter, or the Everything view.'
                }
              />
            ) : (
              <>
                {/*
                  * The verdicts explained ONCE, here, instead of inside every
                  * button on every row. The two that are easy to confuse are the
                  * two that matter — only `WRONG` trips the breaker — and a
                  * reviewer who reaches for it because the Hindi was stiff has
                  * spent one of three lives on a sentence that was entirely true.
                  */}
                <p className="border-b border-border bg-surface-2 px-3 py-2 text-xs text-text-muted md:px-4">
                  <span className="font-medium text-text">Wrong</span> means it
                  stated something untrue — only that one counts towards the
                  breaker.{' '}
                  <span className="font-medium text-text">Badly written</span>{' '}
                  means the facts were right and the sentence was not.
                </p>
                <div>
                  {turns.map((turn) => (
                    <TurnCard
                      key={turn.id}
                      turn={turn}
                      now={now}
                      busy={review.isPending && pendingId === turn.id}
                      onReview={(v) => applyVerdict(turn, v)}
                    />
                  ))}
                </div>
                <div className="border-t border-border">
                  <Pagination
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={total}
                    onPageChange={setPage}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {isSuperAdmin ? (
          <AiFirstLineSwitches />
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-text-subtle">
            <CircleSlash2 width={13} height={13} strokeWidth={1.75} />
            Turning the first line on or off is a super-admin control.
          </p>
        )}
      </div>
    </div>
  );
}
