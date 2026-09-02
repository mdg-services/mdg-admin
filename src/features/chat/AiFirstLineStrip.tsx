import { ChevronDown, ChevronRight, CornerDownLeft, Zap } from 'lucide-react';
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
 * resolved the date, run the lookup, and — in a shadow week — written the whole
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

/**
 * The plan's scalars, in the words the dealer's question was resolved into.
 *
 * Only the fields the model actually filled — an omitted date is not "no date",
 * it is a question that did not name one, and printing "Date: —" invites the
 * reader to think the machine failed to find something it never looked for.
 */
function planFacts(turn: AiTurn): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  const plan = turn.plan;
  if (!plan) return out;
  if (plan.date) out.push({ label: 'Day', value: plan.date });
  if (plan.month) out.push({ label: 'Month', value: plan.month });
  if (plan.personName) out.push({ label: 'Name looked up', value: plan.personName });
  if (plan.productHint) out.push({ label: 'Grade', value: plan.productHint });
  return out;
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
  const facts = planFacts(turn);
  return (
    <div className="grid gap-2 border-t border-border px-3 py-2.5">
      <dl className="grid gap-2">
        {turn.question ? (
          <Fact label="They asked">
            <span className="text-text-muted">“{turn.question}”</span>
          </Fact>
        ) : null}
        <Fact label="Read as">
          {turn.intent ? AI_INTENT_LABEL[turn.intent] : 'It never got that far'}
        </Fact>
        {facts.map((f) => (
          <Fact key={f.label} label={f.label}>
            {f.value}
          </Fact>
        ))}
        {/*
         * NAMES, not payloads. The turn log stores which lookups ran and
         * deliberately not what they returned — "a turn log is not a data
         * export" — so what a lookup found is shown through the answer it fed,
         * below, and not as a dump of a dealer's figures on a support screen.
         */}
        <Fact label="Lookups run">
          {turn.toolIds && turn.toolIds.length > 0 ? (
            <span className="font-mono text-xs">{turn.toolIds.join(' → ')}</span>
          ) : (
            <span className="text-text-subtle">None — it stood down first</span>
          )}
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
