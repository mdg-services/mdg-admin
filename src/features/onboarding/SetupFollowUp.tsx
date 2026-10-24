import * as React from 'react';

import { Button, Callout, ConfirmDialog, useToast } from '@/components/ui';
import { useClearNotMe } from '@/hooks/api/useOnboarding';
import { callLine, lastCallLine, notMeLine, reminderLine } from '@/lib/onboardingCalls';
import { dealerCodeLabel, type OutletSetupAdmin, type SetupCall } from '@dk/shared';

/** Calls shown before "Show older". */
const SHOWN = 4;

/**
 * What the Setup card says about chasing a dealer: somebody who disowned the
 * registration, the reminder line, and the call history.
 *
 * Reminders and calls are what keep a quiet outlet from going cold, so the card
 * shows the same facts the team's alerts are made of: how many reminders went,
 * when the next is due, and who rang when and what came of it. The calls are
 * newest first. A note is a person's own words, so it is shown here and nowhere
 * that reaches a phone's lock screen.
 */
export function SetupFollowUp({ setup }: { setup: OutletSetupAdmin }) {
  const reminders = reminderLine(setup.reminders, setup.waitingOn);
  return (
    <>
      {setup.notMe ? <NotMeNotice setup={setup} /> : null}
      {reminders ? <p className="text-xs text-text-muted">{reminders}</p> : null}
      {setup.calls.length > 0 ? <CallHistory calls={setup.calls} /> : null}
    </>
  );
}

/** "Somebody replied NO to the welcome" and every admin's way to clear it, once they have checked. */
function NotMeNotice({ setup }: { setup: OutletSetupAdmin }) {
  const toast = useToast();
  const clear = useClearNotMe();
  const [asking, setAsking] = React.useState(false);
  const label = dealerCodeLabel(setup.code);

  async function submit() {
    try {
      await clear.mutateAsync(setup.dealerId);
      toast.success(`${label}: cleared. The owner can sign in again.`);
      setAsking(false);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'That did not go through.');
    }
  }

  return (
    <div className="grid gap-2">
      <Callout intent="warning">{notMeLine(setup)}</Callout>
      <div>
        <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>
          Clear NO…
        </Button>
      </div>
      <ConfirmDialog
        open={asking}
        onCancel={() => setAsking(false)}
        onConfirm={() => void submit()}
        loading={clear.isPending}
        title={`Clear NO for ${label}?`}
        description="Only do this once you have checked with the person who registered that it was really them. The owner's sign-in comes back at once."
        confirmLabel="Clear NO"
      />
    </div>
  );
}

function CallHistory({ calls }: { calls: SetupCall[] }) {
  const [all, setAll] = React.useState(false);
  const shown = all ? calls : calls.slice(0, SHOWN);
  return (
    <section aria-label="Calls" className="grid gap-1.5 border-t border-border pt-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-text-subtle">Calls</h3>
      <ol className="grid gap-1.5">
        {shown.map((c) => (
          <li key={`${c.at}:${c.byName}`} className="min-w-0 text-sm [overflow-wrap:anywhere]">
            <span className="select-text text-text">{callLine(c)}</span>
            {c.note ? <p className="select-text text-xs text-text-muted">{c.note}</p> : null}
          </li>
        ))}
      </ol>
      {calls.length > SHOWN ? (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer' : `Show ${calls.length - SHOWN} older`}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The lines under an outlet's stage on the Onboarding page: when the next
 * reminder is due, the last call, and a flag if somebody replied NO.
 */
export function OutletFollowUpLines({ outlet }: { outlet: OutletSetupAdmin }) {
  const reminders = reminderLine(outlet.reminders, outlet.waitingOn);
  const last = lastCallLine(outlet.calls[0]);
  if (!reminders && !last && !outlet.notMe) return null;
  return (
    <>
      {outlet.notMe ? (
        <span className="text-xs font-medium text-danger">Replied NO to the welcome</span>
      ) : null}
      {reminders ? <span className="text-xs text-text-subtle">{reminders}</span> : null}
      {last ? <span className="text-xs text-text-subtle">{last}</span> : null}
    </>
  );
}
