import { CheckCircle2, XCircle } from 'lucide-react';

import { dealerCodeLabel } from '@dk/shared';

import type { BulkOutcome } from './format';

/**
 * What actually happened to each dealer in a bulk run.
 *
 * WHY THIS IS A LIST AND NOT A TOAST
 * ----------------------------------
 * Every bulk action on this screen is N independent writes, and a refusal on one
 * of them is ordinary rather than exceptional: the hour-long reminder cooldown,
 * a dealer who has already sent it, a request somebody withdrew, a dealer
 * archived between the list loading and the button being pressed. A toast saying
 * "6 of 8 reminded" tells an admin that something went wrong and nothing about
 * WHICH outlet still needs chasing — so they either redo the whole batch or drop
 * the two that failed. The reasons stay on screen, one line per dealer, with the
 * server's own sentence beside it, because that sentence is what says whether to
 * wait an hour or to pick up the phone.
 *
 * The successes are listed too, not just counted. An admin who runs this twice
 * in a morning needs to see that the second run did nothing, and a bare count
 * cannot distinguish "nothing needed doing" from "nothing happened".
 */

export interface BulkOutcomeListProps {
  outcomes: readonly BulkOutcome[];
  /** The one-line summary — always both numbers when anything failed. */
  summary: string;
}

export function BulkOutcomeList({ outcomes, summary }: BulkOutcomeListProps) {
  const failed = outcomes.filter((o) => !o.ok).length;
  return (
    <div
      className="rounded-md border border-border bg-surface-2 p-3"
      // Announced, because the admin's eyes are on the button they just pressed
      // and the result appears above it.
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-semibold text-text">{summary}</p>
      <ul className="mt-2 grid gap-1">
        {/* Failures first. They are the only rows that need a decision, and on a
            phone the successes would otherwise push them below the fold. */}
        {[...outcomes]
          .sort((a, b) => Number(a.ok) - Number(b.ok))
          .map((outcome) => (
            <li
              key={`${outcome.dealerCode}-${outcome.ok ? 'ok' : 'no'}`}
              className="flex items-start gap-1.5 text-xs"
            >
              {outcome.ok ? (
                <CheckCircle2
                  width={13}
                  height={13}
                  strokeWidth={1.75}
                  className="mt-0.5 shrink-0 text-success"
                  aria-hidden
                />
              ) : (
                <XCircle
                  width={13}
                  height={13}
                  strokeWidth={1.75}
                  className="mt-0.5 shrink-0 text-danger"
                  aria-hidden
                />
              )}
              <span className="shrink-0 font-medium text-text">
                {dealerCodeLabel(outcome.dealerCode)}
              </span>
              {/* `break-words`: a server sentence can name a service id or a
                  period key, and an unbroken token would run past the card and
                  be clipped by `main`'s `overflow-x-hidden` — which is to say,
                  lost, with no sideways scroll that reaches it. */}
              <span className="min-w-0 break-words text-text-muted">{outcome.message}</span>
            </li>
          ))}
      </ul>
      {failed > 0 ? (
        <p className="mt-2 text-xs text-text-subtle">
          Nothing above was half-done: each dealer either got the request or did not, and the
          ones that did not are unchanged.
        </p>
      ) : null}
    </div>
  );
}
