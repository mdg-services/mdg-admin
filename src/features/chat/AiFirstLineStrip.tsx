import {
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
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
    <div className="grid gap-0.5 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-text-subtle">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm text-text">{children}</dd>
    </div>
  );
}

/** How the reply was made, for the collapsed line and the panel both. */
function ProductionBadge({ turn }: { turn: AiTurn }) {
  const view = aiProduction(turn);
  if (!view) return null;
  return (
    <Badge intent={view.tone} title={view.hint}>
      {view.label}
    </Badge>
  );
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
      <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
        It wrote this and we refused it
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
    <div className="grid gap-2 border-t border-border px-3 py-2.5">
      <dl className="grid gap-2">
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
          <span className="inline-flex flex-wrap items-center gap-1">
            <ProductionBadge turn={turn} />
            {turn.partial ? (
              <Badge intent="warning" title="Part of what they asked was refused or dropped; the reply says so in a hand-written line.">
                Answered part of it
              </Badge>
            ) : null}
            {turn.quickFollowUp ? (
              <Badge intent="neutral" title="The dealer wrote again within minutes. It changes nothing about the machine's behaviour — it is a review signal.">
                Wrote straight back
              </Badge>
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
          <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
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
              Put in composer
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

export function AiFirstLineStrip({
  conversationId,
  onUseAnswer,
  now,
}: {
  conversationId: string;
  /** Push the withheld sentence into the composer's draft. */
  onUseAnswer: (text: string) => void;
  /** The page's one-minute tick, so the ages here advance with the inbox's. */
  now: number;
}) {
  const [open, setOpen] = React.useState(false);
  const turnsQ = useConversationAiTurnsQuery(conversationId);
  const turns = turnsQ.data?.items ?? [];

  // A thread the machine never looked at gets NO strip at all — not an empty
  // one. Most threads are that, and a permanent "the AI did nothing" row would
  // be a line of chrome every admin learns to read past.
  if (turns.length === 0) return null;

  const latest = turns[0]!;
  const earlier = turns.slice(1);
  const chipIntent = AI_OUTCOME_TONE[latest.outcome];
  // The mark goes on the COLLAPSED line, not only inside the panel. "Did a model
  // write this, or did a person write it months ago?" is the first thing an
  // admin now needs to know about a reply sitting in the thread above, and an
  // admin who never opens the panel would otherwise never learn it.
  const production = aiProduction(latest);

  return (
    <div className="border-t border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Zap
          width={14}
          height={14}
          strokeWidth={2}
          className="shrink-0 text-text-muted"
        />
        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-text-subtle">
          First line
        </span>
        <Badge intent={chipIntent}>{AI_OUTCOME_LABEL[latest.outcome]}</Badge>
        {/* The production mark from md up. Below it the row already carries a
            glyph, a label, an outcome badge, an age and a chevron, and `Badge`
            refuses to shrink — a fourth pill would push the chevron off a 360px
            row. The panel carries it at every width. */}
        {production ? (
          <span className="hidden md:contents">
            <Badge intent={production.tone} title={production.hint}>
              {production.label}
            </Badge>
          </span>
        ) : null}
        {/* The reason in full on a wide screen; the badge carries it below md,
            where a fifteen-word sentence would push the chevron off the row. */}
        <span className="hidden min-w-0 flex-1 truncate text-sm text-text-muted md:block">
          {latest.reason ? AI_HANDOFF_REASON_LABEL[latest.reason] : ''}
        </span>
        <span className="flex-1 md:hidden" />
        <span className="shrink-0 text-xs text-text-subtle">
          {aiTurnAge(latest.createdAt, now)}
        </span>
        {open ? (
          <ChevronDown width={16} height={16} strokeWidth={1.75} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronRight width={16} height={16} strokeWidth={1.75} className="shrink-0 text-text-muted" />
        )}
      </button>

      {open ? (
        <div
          // Its own scroller, capped. A thread with five turns on it would
          // otherwise push the composer off a 740px phone screen, and the
          // composer is the thing the admin came here to use.
          className="max-h-64 overflow-y-auto overscroll-contain md:max-h-80"
        >
          <TurnDetail turn={latest} now={now} onUseAnswer={onUseAnswer} />
          {earlier.length > 0 ? (
            <div className="border-t border-border px-3 py-2">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-subtle">
                Earlier turns on this thread
              </p>
              <ul className="grid gap-1">
                {earlier.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center gap-1.5 text-sm text-text-muted"
                  >
                    <Badge intent={AI_OUTCOME_TONE[t.outcome]}>
                      {AI_OUTCOME_LABEL[t.outcome]}
                    </Badge>
                    <ProductionBadge turn={t} />
                    <span className="min-w-0 break-words">
                      {t.reason
                        ? AI_HANDOFF_REASON_LABEL[t.reason]
                        : t.intent
                          ? AI_INTENT_LABEL[t.intent]
                          : ''}
                    </span>
                    <span className="text-xs text-text-subtle">
                      {aiTurnAge(t.createdAt, now)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
