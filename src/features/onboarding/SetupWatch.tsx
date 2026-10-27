import { Link } from 'react-router-dom';

import { Callout } from '@/components/ui';
import { WATCH_DECISION_TEXT, heldCountLine, watchNeedsDecision } from '@/lib/watchHold';
import type { OutletSetupAdmin } from '@dk/shared';

import { LoginChecks, SetupChecklist } from './SetupChecklist';

/**
 * The watch builder's part of an outlet's Setup card (docs/specs/onboarding-v2.md §5):
 *
 *  - the extend-or-end prompt, when the watch has run out but something was dropped
 *    during it, so the outlet does not go live by itself (the buttons are the card's
 *    own "End watch" and "Extend…");
 *  - how many messages are held for review, with the way to the queue;
 *  - the "ready to start?" checklist, and what the portal said each time a saved login
 *    was tried.
 *
 * Every part draws only when it has something to say, so an outlet that is live, or
 * has nothing held and nothing to start, shows nothing here at all.
 */
export function SetupWatch({ setup, now }: { setup: OutletSetupAdmin; now: number }) {
  const held = heldCountLine(setup.heldCount);
  const decide = watchNeedsDecision(setup, now);
  const showChecks = setup.loginChecks.length > 0 && setup.stage !== 'live' && setup.stage !== 'lost';
  if (!held && !decide && setup.checklist.length === 0 && !showChecks) return null;
  return (
    <div className="grid gap-3">
      {decide ? <Callout intent="warning">{WATCH_DECISION_TEXT}</Callout> : null}
      {held ? (
        <Callout intent="info">
          {held}.{' '}
          <Link className="font-semibold underline" to="/onboarding">
            Review them
          </Link>
        </Callout>
      ) : null}
      <SetupChecklist dealerId={setup.dealerId} items={setup.checklist} company={setup.company} />
      {showChecks ? <LoginChecks checks={setup.loginChecks} now={now} /> : null}
    </div>
  );
}
