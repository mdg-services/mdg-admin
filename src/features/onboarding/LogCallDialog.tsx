import * as React from 'react';

import {
  Button,
  Dialog,
  FieldError,
  Input,
  Label,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { useLogOutletCall, useLogRegistrationCall } from '@/hooks/api/useOnboarding';
import { istTodayYmd } from '@/lib/format';
import {
  CALL_NOTE_MAX,
  CALL_OUTCOMES,
  callBody,
  callProblem,
  offersClose,
} from '@/lib/onboardingCalls';
import { dealerCodeLabel, type SetupCallOutcome } from '@dk/shared';

/** Who the call was to: an outlet on its way, or a registration waiting for a yes. */
export type CallTarget =
  | { kind: 'outlet'; dealerId: string; code: string; ownerName: string | null }
  | { kind: 'registration'; registrationId: string; name: string; sapCode: string };

const targetKey = (t: CallTarget) =>
  t.kind === 'outlet' ? `o:${t.dealerId}` : `r:${t.registrationId}`;

const errorText = (err: unknown) =>
  err instanceof Error && err.message ? err.message : 'That did not go through.';

/**
 * "Log call…": the team rang a dealer, and says what came of it.
 *
 * A call changes the clock, not the stage. "Answered" and "No answer" clear the
 * "call them" alert (it returns in two days if the dealer is still silent), "Call
 * later" keeps the reminders and alerts quiet until the day picked, and "Not
 * interested" stops the chasing. That last one offers to close the onboarding
 * next, through `onNotInterested`: the parent decides whether it applies (an outlet
 * whose services have started is a client, not a lead) and opens its own Close form.
 *
 * Nothing here messages the dealer. `target` null is closed; the form mounts
 * only while one is open, keyed on who it is for, so the board refreshing
 * underneath never resets what the person is typing.
 */
export function LogCallDialog({
  target,
  onClose,
  onNotInterested,
}: {
  target: CallTarget | null;
  onClose: () => void;
  /** Called after a "not interested" call has been saved, so the parent can offer Close. */
  onNotInterested?: (target: CallTarget) => void;
}) {
  return target ? (
    <LogCallForm
      key={targetKey(target)}
      target={target}
      onClose={onClose}
      {...(onNotInterested ? { onNotInterested } : {})}
    />
  ) : null;
}

function LogCallForm({
  target,
  onClose,
  onNotInterested,
}: {
  target: CallTarget;
  onClose: () => void;
  onNotInterested?: (target: CallTarget) => void;
}) {
  const toast = useToast();
  const logOutlet = useLogOutletCall();
  const logRegistration = useLogRegistrationCall();
  const pending = logOutlet.isPending || logRegistration.isPending;
  const outcomeId = React.useId();
  const noteId = React.useId();
  const dayId = React.useId();
  const [outcome, setOutcome] = React.useState<SetupCallOutcome | ''>('');
  const [note, setNote] = React.useState('');
  const [nextCallOn, setNextCallOn] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const today = istTodayYmd();

  const form = { outcome, note, nextCallOn };
  const problem = callProblem(form, today);
  const chosen = CALL_OUTCOMES.find((o) => o.value === outcome);

  async function submit() {
    if (pending) return;
    setTouched(true);
    if (problem || !outcome) return;
    const body = callBody(form);
    try {
      if (target.kind === 'outlet') {
        await logOutlet.mutateAsync({ dealerId: target.dealerId, body });
      } else {
        await logRegistration.mutateAsync({ id: target.registrationId, body });
      }
      toast.success('Call logged.');
      onClose();
      if (offersClose(outcome)) onNotInterested?.(target);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Log call"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={pending}>
            Log call
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 text-sm [overflow-wrap:anywhere]">
          {target.kind === 'outlet' ? (
            <>
              <span className="font-medium text-text">{dealerCodeLabel(target.code)}</span>
              {target.ownerName ? (
                <span className="text-text-muted"> · {target.ownerName}</span>
              ) : null}
            </>
          ) : (
            <>
              <span className="font-medium text-text">{target.name}</span>
              <span className="text-text-muted"> · SAP code {target.sapCode}</span>
            </>
          )}
        </div>

        <div>
          <Label htmlFor={outcomeId} required>
            What came of it
          </Label>
          <Select
            id={outcomeId}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as SetupCallOutcome | '')}
            invalid={touched && !outcome}
          >
            <option value="">Choose…</option>
            {CALL_OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {chosen ? <p className="mt-1 text-xs text-text-muted">{chosen.hint}</p> : null}
        </div>

        {outcome === 'call_later' ? (
          <div>
            <Label htmlFor={dayId} required>
              Call again on
            </Label>
            <Input
              id={dayId}
              type="date"
              value={nextCallOn}
              min={today}
              onChange={(e) => setNextCallOn(e.target.value)}
              invalid={touched && callProblem(form, today) !== null}
            />
          </div>
        ) : null}

        <div>
          <Label htmlFor={noteId} hint="Optional, one line">
            Note
          </Label>
          <Textarea
            id={noteId}
            rows={2}
            value={note}
            maxLength={CALL_NOTE_MAX + 50}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For example: will pay on Monday, asked us to call his son."
          />
        </div>

        <FieldError message={touched ? (problem ?? undefined) : undefined} />
        <p className="text-xs text-text-muted">
          This does not message the dealer. The note stays with the record for the next person who
          calls.
        </p>
      </form>
    </Dialog>
  );
}
