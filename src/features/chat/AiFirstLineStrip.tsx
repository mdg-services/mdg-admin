import { CornerDownLeft, ShieldAlert, Zap } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { HowThisWorks } from '@/components/ui/HowThisWorks';
import { InfoBadge } from '@/components/ui/InfoBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useConversationAiTurnsQuery } from '@/hooks/api/useAiTurns';
import {
  AI_HANDOFF_REASON_LABEL,
  AI_INTENT_LABEL,
  AI_OUTCOME_LABEL,
  AI_OUTCOME_TONE,
  aiCostLabel,
  aiPlanAsks,
  aiProduction,
  aiRefusal,
  aiRuleHint,
  aiRuleLabel,
  aiToolLabel,
  aiTurnAge,
  aiWithheldAnswer,
} from '@dk/shared';
import type { AiTurn } from '@dk/shared';

import { PanelSection } from './PanelSection';

/**
 * "What the first line did" — ADMIN CHROME, never a message in the thread.
 *
 * It sits between the message list and the composer, collapsed to one line, and
 * it exists to stop an admin repeating work the machine already did. Opening a
 * handed-off ticket without it, the admin sees the dealer's question and a warm
 * line saying somebody is coming, and has no way to know the machine had already
 * resolved the date, run the lookups, and — in a shadow week — written the whole
 * answer.
 *
 * WHY IT IS NOT A MESSAGE. A bubble in the thread is visible to the DEALER, and
 * "the density lookup returned nothing for 2026-08-30" is our workings, not their
 * business. It also cannot be, structurally: the only two senders in a thread are
 * the dealer and Support, there is deliberately no third role, and inventing one
 * would render on the dealer's side of `MessageBubble`.
 *
 * COLLAPSED BY DEFAULT, and that is the load-bearing default. Most threads the
 * machine touches need nothing from this panel; an admin who opens sixty tickets
 * a morning should pay one line of vertical space for it, not a panel they close
 * sixty times.
 *
 * WHAT v2 PUT IN IT. The machine now writes its own sentences, so the panel has
 * to answer three questions it never had to before: was this reply WRITTEN or a
 * fixed sentence; if we refused what it wrote, WHAT WAS IT and which rule
 * stopped it; and which of the up-to-five lookups actually ran. The first is a
 * mark on the collapsed line, because an admin who never opens the panel still
 * needs it. The other two are inside.
 */

/** One label/value line in the expanded panel. Values wrap; nothing is clipped. */
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
      <dt className="pt-px text-xs font-medium leading-5 text-text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-text">{children}</dd>
    </div>
  );
}

/**
 * How the reply was made, inside the panel.
 *
 * `InfoBadge`, because what each mark MEANS lives in its hint and a `title`
 * never fires on touch: below md the badge opens a sheet with the hint, at md it
 * is today's badge with its tooltip. Only ever rendered in the panel, which is
 * not itself a button — the collapsed line IS one, so its copy of this mark
 * stays a plain `Badge` (and is md-only anyway).
 */
function ProductionBadge({ turn }: { turn: AiTurn }) {
  const view = aiProduction(turn);
  if (!view) return null;
  return <InfoBadge intent={view.tone} label={view.label} detail={view.hint} />;
}

/**
 * The sentence the machine composed and we refused, with the rules that refused
 * it.
 *
 * Shown HERE and not only on the review page, because this is the screen the
 * admin is standing on when they answer the dealer themselves. Knowing that the
 * machine drafted "the density register for the 28th is still with you" and that
 * we stopped it for a date it could not account for is the difference between
 * writing the reply from scratch and correcting one sentence.
 */
function RefusedProse({ turn }: { turn: AiTurn }) {
  const refusal = aiRefusal(turn);
  if (!refusal) return null;
  return (
    <div className="grid gap-1.5 rounded-md border border-border bg-surface-2 p-2.5">
      <p className="text-xs font-semibold text-text-muted">
        It wrote this and we refused it
      </p>
      {refusal.prose ? (
        <p className="min-w-0 whitespace-pre-wrap break-words text-sm text-text">
          {refusal.prose}
        </p>
      ) : null}
      <p className="text-xs text-text-muted">{refusal.headline}</p>
      {refusal.rules.length > 0 ? (
        // The rule's long form is the explanation of the refusal, so it is an
        // `InfoBadge`: tappable below md. The 12px gaps below md keep each
        // badge's -12px tap halo off its neighbours' painted pills.
        <div className="flex flex-wrap gap-3 md:gap-1">
          {refusal.rules.map((rule, i) => (
            <InfoBadge
              key={`${rule}-${i}`}
              intent="warning"
              label={aiRuleLabel(rule)}
              detail={aiRuleHint(rule) ?? rule}
            />
          ))}
        </div>
      ) : null}
      {/*
       * NO "Put in composer" BUTTON HERE, and the omission is deliberate. The
       * withheld-answer button below offers a body that PASSED verification and
       * nobody read; this text FAILED its own checks. Offering it for one tap
       * would turn a refusal into a suggestion, and the first sentence anybody
       * pasted would be the one carrying a figure no lookup returned. It can be
       * read, and copied by hand if it is genuinely right — which is exactly the
       * amount of friction the difference deserves.
       */}
      {refusal.attack ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-text">
          <ShieldAlert
            width={13}
            height={13}
            strokeWidth={2}
            className="mt-0.5 shrink-0"
          />
          <span>
            Evidence of an attempt rather than a clumsy sentence — this thread is
            marked in the AI guard lens.
          </span>
        </p>
      ) : null}
    </div>
  );
}

function TurnDetail({
  turn,
  now,
  onUseAnswer,
}: {
  turn: AiTurn;
  now: number;
  onUseAnswer: (text: string) => void;
}) {
  const withheld = aiWithheldAnswer(turn);
  /**
   * One line per thing the dealer asked about, with the scalars that belong to
   * THAT ask.
   *
   * A turn used to carry one label and one flat set of scalars. It now carries
   * up to three asks, and flattening them here would undo the reason they are
   * per-ask: "22 tarikh ka DSR bhejo aur aaj ki density batao" holds two
   * different days, and one "Day" line for the turn would show a reviewer a date
   * the density lookup never read.
   */
  const asks = aiPlanAsks(turn.plan);
  return (
    <div className="grid gap-3">
      <dl className="grid gap-2.5">
        {turn.question ? (
          <Fact label="They asked">
            <span className="text-text-muted">“{turn.question}”</span>
          </Fact>
        ) : null}
        <Fact label="Read as">
          {asks.length > 0 ? (
            <div className="grid gap-0.5">
              {asks.map((ask, i) => (
                <div key={`${ask.intent}-${i}`}>
                  <span className={ask.primary ? 'font-medium' : undefined}>
                    {ask.label}
                  </span>
                  {ask.scalars.map((s) => (
                    <span key={s.label} className="text-text-muted">
                      {` · ${s.label} ${s.value}`}
                    </span>
                  ))}
                  {/* The first ask is the one the reply leads with, so it is the
                      one to judge the answer against. */}
                  {ask.primary && asks.length > 1 ? (
                    <span className="text-xs text-text-subtle"> — led with this</span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : turn.intent ? (
            AI_INTENT_LABEL[turn.intent]
          ) : (
            'It never got that far'
          )}
        </Fact>
        {/*
         * NAMES, not payloads. The turn log stores which lookups ran and
         * deliberately not what they returned — "a turn log is not a data
         * export" — so what a lookup found is shown through the answer it fed,
         * below, and not as a dump of a dealer's figures on a support screen.
         *
         * Up to five of them now run in one batch, and the SET is the finding:
         * `Papers open, both ways` alone on a "what do I need to do now" turn
         * means the DSR half refused, which is a different turn from one where
         * both ran and reads identically if only a count is printed.
         */}
        <Fact label="Lookups run">
          {turn.toolIds && turn.toolIds.length > 0 ? (
            <span>{turn.toolIds.map((id) => aiToolLabel(id)).join(' · ')}</span>
          ) : (
            <span className="text-text-subtle">None — it stood down first</span>
          )}
        </Fact>
        <Fact label="How it replied">
          {/* Every mark here explains itself only in its hint, so all three
              are `InfoBadge`s; the gaps widen below md for their tap halos. */}
          <span className="inline-flex flex-wrap items-center gap-3 md:gap-1">
            <ProductionBadge turn={turn} />
            {turn.partial ? (
              <InfoBadge
                intent="warning"
                label="Answered part of it"
                detail="Part of what they asked was refused or dropped; the reply says so in a hand-written line."
              />
            ) : null}
            {turn.quickFollowUp ? (
              <InfoBadge
                intent="neutral"
                label="Wrote straight back"
                detail="The dealer wrote again within minutes. It changes nothing about the machine's behaviour — it is a review signal."
              />
            ) : null}
          </span>
        </Fact>
        <Fact label="Why it stopped">
          {turn.reason ? (
            AI_HANDOFF_REASON_LABEL[turn.reason]
          ) : turn.outcome === 'ANSWERED' ? (
            'It did not — it answered.'
          ) : turn.outcome === 'SHADOW' ? (
            'Nothing was posted: this dealer is in rehearsal (SHADOW) mode.'
          ) : (
            // The three reason-less suppressions are the switches themselves:
            // the env flag, the kill switch, and a dealer whose own mode is OFF.
            // Nothing happened because nothing was ever switched on.
            'The first line was not switched on for this dealer.'
          )}
        </Fact>
        {turn.guard ? (
          <Fact label="Guard">
            {/*
             * RULE NAMES ONLY, never the dealer's text — the same doctrine the
             * turn row states. Their words are already on the row in `question`.
             */}
            <span className="inline-flex flex-wrap items-center gap-1">
              <Badge intent={turn.guard.action === 'advisory' ? 'neutral' : 'warning'}>
                {turn.guard.stage === 'input'
                  ? 'In their message'
                  : 'In what the writer produced'}
              </Badge>
              <span className="text-text-muted">
                {turn.guard.rules.map((r) => aiRuleLabel(r)).join(', ')}
              </span>
            </span>
          </Fact>
        ) : null}
        {turn.templateId ? (
          <Fact label="Template">
            <span className="font-mono text-xs">{turn.templateId}</span>
          </Fact>
        ) : null}
        <Fact label="Cost">
          <span className="tabular-nums">{aiCostLabel(turn.estPaise)}</span>
          {typeof turn.latencyMs === 'number' ? (
            <span className="text-text-subtle">
              {' · '}
              {(turn.latencyMs / 1000).toFixed(1)}s
            </span>
          ) : null}
          <span className="text-text-subtle">{` · ${aiTurnAge(turn.createdAt, now)}`}</span>
        </Fact>
      </dl>

      <RefusedProse turn={turn} />

      {withheld ? (
        <div className="grid gap-2 rounded-md border border-border bg-surface-2 p-2.5">
          <p className="text-xs font-semibold text-text-muted">
            It wrote this and did not send it
          </p>
          <p className="min-w-0 whitespace-pre-wrap break-words text-sm text-text">
            {withheld}
          </p>
          <div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onUseAnswer(withheld)}
              leftIcon={<CornerDownLeft width={14} height={14} strokeWidth={1.75} />}
            >
              Put in reply box
            </Button>
          </div>
          {/*
           * It goes into the BOX, never out on the wire. The button appends to
           * the draft and nothing else — the admin still reads it, still edits
           * it, and still presses Send. A one-tap "send this" would quietly turn
           * a rehearsal into a live answer nobody approved.
           */}
          <p className="text-xs text-text-subtle">
            Nothing is sent until you press Send.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * What the AI first line did on this thread — the side panel's "AI log" tab.
 *
 * The newest turn in full (what they asked, how it read it, what it looked up,
 * how it replied, why it stopped, what it cost), then the earlier turns one
 * line each. It used to be a strip above the composer that opened downward
 * into the reply area; at a laptop's height an opened strip left the messages
 * no room, and its 9rem label column printed the answers one word per line.
 * In the panel it has its own scroll and a full column to itself.
 *
 * ADMIN CHROME, NEVER A MESSAGE. Nothing here is something the dealer sees;
 * "Put in reply box" hands a withheld answer to the reply box and stops.
 */
export function AiFirstLineLog({
  conversationId,
  onUseAnswer,
  now,
}: {
  conversationId: string;
  /** Push the withheld sentence into the reply box's draft. */
  onUseAnswer: (text: string) => void;
  /** The page's one-minute tick, so the ages here advance with the inbox's. */
  now: number;
}) {
  const turnsQ = useConversationAiTurnsQuery(conversationId);
  const turns = turnsQ.data?.items ?? [];

  if (turnsQ.isLoading) {
    return (
      <div className="grid gap-2 px-4 py-4" aria-busy>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (turnsQ.isError && !turnsQ.data) {
    return (
      <div className="px-4 py-4">
        <Callout intent="warning" onRetry={() => void turnsQ.refetch()}>
          What the AI did here could not be loaded.
        </Callout>
      </div>
    );
  }
  if (turns.length === 0) {
    return (
      <div className="grid gap-1 px-4 py-6 text-center">
        <Zap width={20} height={20} strokeWidth={1.75} className="mx-auto text-text-subtle" aria-hidden />
        <p className="text-sm font-medium text-text">Nothing from the AI on this chat</p>
        <p className="text-sm text-text-muted">
          When the first line answers or stands down here, each turn shows up in this tab.
        </p>
      </div>
    );
  }

  const latest = turns[0]!;
  const earlier = turns.slice(1);

  return (
    <>
      <PanelSection
        title="Latest turn"
        action={
          <HowThisWorks
            surface="admin-inbox-ai-first-line-strip"
            label="What the first line did"
            variant="icon"
          />
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Badge intent={AI_OUTCOME_TONE[latest.outcome]}>{AI_OUTCOME_LABEL[latest.outcome]}</Badge>
          <ProductionBadge turn={latest} />
          <span className="text-xs tabular-nums text-text-muted">{aiTurnAge(latest.createdAt, now)}</span>
        </div>
        <TurnDetail turn={latest} now={now} onUseAnswer={onUseAnswer} />
      </PanelSection>
      {earlier.length > 0 ? (
        <PanelSection title={`Earlier turns · ${earlier.length}`}>
          {/* `gap-3` below md: each row can carry a tappable production badge,
              and at 4px apart one row's tap halo covered the badge above it. */}
          <ul className="grid gap-3 md:gap-2">
            {earlier.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-1.5 text-sm text-text-muted">
                <Badge intent={AI_OUTCOME_TONE[t.outcome]}>{AI_OUTCOME_LABEL[t.outcome]}</Badge>
                <ProductionBadge turn={t} />
                <span className="min-w-0 break-words">
                  {t.reason
                    ? AI_HANDOFF_REASON_LABEL[t.reason]
                    : t.intent
                      ? AI_INTENT_LABEL[t.intent]
                      : ''}
                </span>
                <span className="ml-auto text-xs tabular-nums text-text-muted">
                  {aiTurnAge(t.createdAt, now)}
                </span>
              </li>
            ))}
          </ul>
        </PanelSection>
      ) : null}
    </>
  );
}
