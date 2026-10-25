import * as React from 'react';

import {
  Button,
  Dialog,
  FieldError,
  Input,
  Label,
  SegmentedControl,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { useLogLeadContact } from '@/hooks/api/useLeads';
import {
  CLOSING_OUTCOMES,
  NOTE_MAX,
  OPEN_OUTCOMES,
  OUTCOME_HINTS,
  closesLead,
  contactBody,
  contactProblem,
  outcomeLabel,
  parseWhen,
  reminderLine,
  suggestNextAt,
  unansweredAfter,
  whenInput,
  type ContactPrefill,
  type WhenInput,
} from '@/lib/leads';
import {
  LEAD_CONTACT_CHANNEL_LABELS,
  LEAD_CONTACT_CHANNELS,
  type LeadContactChannel,
  type LeadContactOutcome,
  type LeadRow,
} from '@dk/shared';

import { LeadBox, errorText } from './shared';

/**
 * "Log contact": somebody at MDG called, messaged or met this person, and says
 * what came of it.
 *
 * What it changes is the clock. The server works out when to chase them next
 * from the outcome, so the form shows that time before anything is saved
 * ("Next follow-up") and lets the person change it when they agreed another
 * one on the phone. Left alone, nothing is sent for it and the server picks the
 * time itself, which is what lets the reminder say why ("no answer last time")
 * rather than "a time the team chose".
 *
 * An outcome that ends the chase hides the follow-up: there is nothing to chase.
 * "Asked us to stop" also puts them on the WhatsApp stop list, and says so
 * before it is chosen. The first admin to log a contact on a lead nobody owns
 * becomes its owner, on the server.
 *
 * "Log this call" on a call recording's summary opens it already holding what
 * the summary says (a call, the outcome it suggests, the gist as the note). It
 * is only a head start: the person reads it and presses Save, and the follow-up
 * is worked out from the outcome exactly as if they had picked it.
 *
 * Nothing here messages the lead. `lead` null is closed; the form mounts only
 * while one is open, keyed on who it is for, so the list refreshing underneath
 * never resets what the person is typing.
 */
export function LogContactDialog({
  lead,
  prefill,
  onClose,
}: {
  lead: LeadRow | null;
  prefill?: ContactPrefill;
  onClose: () => void;
}) {
  return lead ? (
    <LogContactForm key={lead.id} lead={lead} prefill={prefill} onClose={onClose} />
  ) : null;
}

function LogContactForm({
  lead,
  prefill,
  onClose,
}: {
  lead: LeadRow;
  prefill?: ContactPrefill;
  onClose: () => void;
}) {
  const toast = useToast();
  const log = useLogLeadContact();
  const outcomeId = React.useId();
  const noteId = React.useId();
  // The moment the form opened: the suggestion is worked out from it, so it does
  // not creep forward while somebody types a note.
  const [openedAt] = React.useState(() => Date.now());
  const [channel, setChannel] = React.useState<LeadContactChannel>(prefill?.channel ?? 'call');
  const [outcome, setOutcome] = React.useState(prefill?.outcome ?? '');
  const [note, setNote] = React.useState(prefill?.note ?? '');
  const [next, setNext] = React.useState<WhenInput | null>(null);
  const [touched, setTouched] = React.useState(false);

  const closing = closesLead(outcome);
  const picked = outcome ? (outcome as LeadContactOutcome) : null;
  const suggested = picked
    ? suggestNextAt(picked, unansweredAfter(lead, picked, openedAt), openedAt)
    : null;
  // The boxes show the suggestion until the person types over one of them.
  const shown: WhenInput = next ?? (suggested !== null ? whenInput(suggested) : { date: '', time: '' });
  const shownAt = parseWhen(shown);

  const form = { channel, outcome, note, next };
  const problem = contactProblem(form, Date.now());

  async function submit() {
    if (log.isPending) return;
    setTouched(true);
    if (contactProblem(form, Date.now())) return;
    try {
      await log.mutateAsync({ id: lead.id, body: contactBody(form) });
      toast.success(closing ? 'Contact logged. The lead is closed.' : 'Contact logged.');
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Log contact"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={log.isPending}>
            Save contact
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
        <LeadBox lead={lead} />

        {prefill ? (
          <p className="text-xs text-text-muted">
            Filled in from the call summary. Check it, then save.
          </p>
        ) : null}

        <div>
          <p className="mb-1 text-sm font-medium text-text">
            How you were in touch
          </p>
          <SegmentedControl<LeadContactChannel>
            aria-label="How you were in touch"
            value={channel}
            onChange={setChannel}
            options={LEAD_CONTACT_CHANNELS.map((c) => ({
              value: c,
              label: LEAD_CONTACT_CHANNEL_LABELS[c],
            }))}
          />
        </div>

        <div>
          <Label htmlFor={outcomeId} required>
            What came of it
          </Label>
          <Select
            id={outcomeId}
            value={outcome}
            onChange={(e) => {
              setOutcome(e.target.value);
              // A new outcome means a new suggestion: drop a time typed for the old one.
              setNext(null);
            }}
            invalid={touched && !picked}
          >
            <option value="">Choose…</option>
            <optgroup label="The chase goes on">
              {OPEN_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {outcomeLabel(o)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Closes the lead">
              {CLOSING_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {outcomeLabel(o)}
                </option>
              ))}
            </optgroup>
          </Select>
          {picked ? <p className="mt-1 text-xs text-text-muted">{OUTCOME_HINTS[picked]}</p> : null}
        </div>

        {picked && !closing ? (
          <div>
            <p className="mb-1 text-sm font-medium text-text">Next follow-up</p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                aria-label="Follow-up day"
                value={shown.date}
                min={whenInput(openedAt).date}
                onChange={(e) => setNext({ ...shown, date: e.target.value })}
              />
              <Input
                type="time"
                aria-label="Follow-up time"
                value={shown.time}
                onChange={(e) => setNext({ ...shown, time: e.target.value })}
              />
            </div>
            <p className="mt-1 text-xs text-text-muted">
              India time. {shownAt !== null ? reminderLine(shownAt, Date.now()) : ''}
            </p>
            {next ? (
              <Button
                variant="ghost"
                size="sm"
                tone="brand"
                padding="none"
                align="start"
                onClick={() => setNext(null)}
              >
                Use the suggested time
              </Button>
            ) : (
              <p className="text-xs text-text-muted">
                The system picked this time. Change it if you agreed another one.
              </p>
            )}
          </div>
        ) : null}

        <div>
          <Label htmlFor={noteId} hint="Optional">
            Note
          </Label>
          <Textarea
            id={noteId}
            rows={2}
            value={note}
            maxLength={NOTE_MAX + 50}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For example: wants the price list, call his son after 6."
          />
        </div>

        <FieldError message={touched ? (problem ?? undefined) : undefined} />
        <p className="text-xs text-text-muted">
          This does not message them. It records what you did, for the next person who gets in touch.
        </p>
      </form>
    </Dialog>
  );
}
