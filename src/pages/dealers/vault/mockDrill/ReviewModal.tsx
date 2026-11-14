import { CheckCircle2, Undo2 } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Callout,
  ConfirmDialog,
  Dialog,
  Input,
  Label,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { useMockDrillReview } from '@/hooks/api/useMockDrill';
import { ApiError } from '@/lib/api';
import { formatYmd } from '@/lib/format';
import {
  MOCK_DRILL_LIMITS,
  type MockDrillAdminView,
  type MockDrillDependentView,
  type MockDrillSubmissionView,
} from '@dk/shared';
import {
  mockDrillDependentEditSchema,
  mockDrillGeneratedEditSchema,
  type MockDrillDependentEdit,
} from '@dk/shared/schemas';

import {
  GeneratedEditor,
  generatedEditsFrom,
  startingGeneratedForm,
  validateGenerated,
  type GeneratedForm,
} from './GeneratedFields';
import { PhotoStrip } from './Photos';

const OBSERVER_SLOTS = 3;

/** The IST date now (YYYY-MM-DD): the latest day a drill may be put on. */
function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
const REASON_MIN = 3;
const REASON_MAX = 300;

interface FormState {
  scenarioId: string;
  personsPresent: string;
  headCountShort: string;
  observers: Array<{ name: string; area: string }>;
  observations: string;
  recommendations: string;
}

function startingForm(d: MockDrillDependentView): FormState {
  const observers = d.observers
    .slice(0, OBSERVER_SLOTS)
    .map((o) => ({ name: o.name, area: o.area }));
  while (observers.length < OBSERVER_SLOTS) observers.push({ name: '', area: '' });
  return {
    scenarioId: d.scenarioId,
    personsPresent: String(d.personsPresent),
    headCountShort: String(d.headCountShort),
    observers,
    observations: d.observations,
    recommendations: d.recommendations,
  };
}

/** Observers the portal will get: a row with neither box filled is no observer. */
function filledObservers(rows: FormState['observers']): Array<{ name: string; area: string }> {
  return rows
    .map((o) => ({ name: o.name.trim(), area: o.area.trim() }))
    .filter((o) => o.name !== '' || o.area !== '');
}

function wholeNumber(text: string): number | null {
  const t = text.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

type Errors = Partial<
  Record<
    'personsPresent' | 'headCountShort' | 'observers' | 'observations' | 'recommendations',
    string
  >
>;

/** Plain-words problems with the form, in the portal's own limits. */
function validate(form: FormState): Errors {
  const errors: Errors = {};
  const present = wholeNumber(form.personsPresent);
  if (present === null || present < 1 || present > 60) {
    errors.personsPresent = 'Enter a whole number from 1 to 60.';
  }
  const short = wholeNumber(form.headCountShort);
  if (short === null || short > 10) {
    errors.headCountShort = 'Enter a whole number from 0 to 10.';
  } else if (present !== null && short > present) {
    errors.headCountShort = 'The shortfall cannot be more than the persons present.';
  }
  if (form.observers.some((o) => (o.name.trim() === '') !== (o.area.trim() === ''))) {
    errors.observers = 'Give each observer both a name and an area, or leave both empty.';
  }
  const obs = form.observations.trim();
  if (obs.length < 3) errors.observations = 'Write at least 3 characters.';
  else if (obs.length > MOCK_DRILL_LIMITS.observations) {
    errors.observations = `At most ${MOCK_DRILL_LIMITS.observations} characters.`;
  }
  const rec = form.recommendations.trim();
  if (rec.length < 3) errors.recommendations = 'Write at least 3 characters.';
  else if (rec.length > MOCK_DRILL_LIMITS.recommendations) {
    errors.recommendations = `At most ${MOCK_DRILL_LIMITS.recommendations} characters.`;
  }
  return errors;
}

/** Only what the admin changed, so the server records exactly their corrections. */
function editsFrom(original: MockDrillDependentView, form: FormState): MockDrillDependentEdit {
  const edits: MockDrillDependentEdit = {};
  if (form.scenarioId !== original.scenarioId) edits.scenarioId = form.scenarioId;
  const present = wholeNumber(form.personsPresent);
  if (present !== null && present !== original.personsPresent) edits.personsPresent = present;
  const short = wholeNumber(form.headCountShort);
  if (short !== null && short !== original.headCountShort) edits.headCountShort = short;
  const before = original.observers.map((o) => ({ name: o.name.trim(), area: o.area.trim() }));
  const after = filledObservers(form.observers);
  if (JSON.stringify(before) !== JSON.stringify(after)) edits.observers = after;
  if (form.observations.trim() !== original.observations.trim())
    edits.observations = form.observations.trim();
  if (form.recommendations.trim() !== original.recommendations.trim()) {
    edits.recommendations = form.recommendations.trim();
  }
  return edits;
}

function Counter({ value, max }: { value: string; max: number }) {
  const over = value.length > max;
  return (
    <span className={over ? 'text-danger' : 'text-text-subtle'}>
      {value.length}/{max}
    </span>
  );
}

function FieldHead({
  htmlFor,
  label,
  counter,
}: {
  htmlFor: string;
  label: string;
  counter?: React.ReactNode;
}) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <Label htmlFor={htmlFor} className="mb-0">
        {label}
      </Label>
      {counter ? <span className="text-xs tabular-nums">{counter}</span> : null}
    </div>
  );
}

function ErrorLine({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-danger">
      {message}
    </p>
  );
}

/**
 * THE REVIEW: an admin checks the owner's photos against the fields the report
 * depends on, edits what is wrong, and either approves (the report is then filed
 * on IndianOil's site) or sends it back to the owner with a reason.
 *
 * Photos sit beside the form at md and above them on a phone, so the admin looks
 * at the picture and types in the same view. Under both, read-only, is the part
 * the system wrote, so the admin sees the whole report and not only the boxes
 * they can change.
 */
export function ReviewModal({
  open,
  onClose,
  dealerId,
  view,
  submission,
}: {
  open: boolean;
  onClose: () => void;
  dealerId: string;
  view: MockDrillAdminView;
  submission: MockDrillSubmissionView;
}) {
  const toast = useToast();
  const review = useMockDrillReview(dealerId);
  const dependent = submission.dependent;

  const [form, setForm] = React.useState<FormState | null>(
    dependent ? startingForm(dependent) : null,
  );
  const generated = submission.generated;
  const [genForm, setGenForm] = React.useState<GeneratedForm | null>(
    generated ? startingGeneratedForm(generated) : null,
  );
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [confirmingApprove, setConfirmingApprove] = React.useState(false);
  const [sendingBack, setSendingBack] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [tried, setTried] = React.useState(false);

  // A different drill, or the owner changing it while this is open, starts from
  // what the server now holds. Keyed on the id and on the fields themselves, so
  // an admin's own typing is never wiped by a re-read that changed nothing.
  const serverKey = dependent
    ? JSON.stringify([
        submission.id,
        startingForm(dependent),
        generated ? startingGeneratedForm(generated) : null,
      ])
    : submission.id;
  const lastKey = React.useRef(serverKey);
  React.useEffect(() => {
    if (lastKey.current === serverKey) return;
    lastKey.current = serverKey;
    setForm(dependent ? startingForm(dependent) : null);
    setGenForm(generated ? startingGeneratedForm(generated) : null);
    setServerError(null);
    setTried(false);
  }, [serverKey, dependent, generated]);

  const saving = review.isPending;
  const errors = form ? validate(form) : {};
  const genErrors = genForm ? validateGenerated(genForm, todayIst()) : {};
  const hasErrors = Object.keys(errors).length > 0 || Object.keys(genErrors).length > 0;
  const shown = tried ? errors : {};
  const genShown = tried ? genErrors : {};

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function setObserver(i: number, key: 'name' | 'area', value: string) {
    setForm((f) =>
      f
        ? { ...f, observers: f.observers.map((o, j) => (j === i ? { ...o, [key]: value } : o)) }
        : f,
    );
  }

  function askApprove() {
    setTried(true);
    if (!form || !dependent || hasErrors) return;
    const edits = editsFrom(dependent, form);
    // The same rules the server applies; a mismatch here is our bug, not the admin's.
    const genEdits = generated && genForm ? generatedEditsFrom(generated, genForm) : {};
    if (
      !mockDrillDependentEditSchema.safeParse(edits).success ||
      !mockDrillGeneratedEditSchema.safeParse(genEdits).success
    ) {
      setServerError('Something in the form is not allowed. Check each box and try again.');
      return;
    }
    setServerError(null);
    setConfirmingApprove(true);
  }

  // `mutateAsync`, not `mutate(..., { onSuccess })`: the answer replaces the
  // cached view, the drill leaves the "to check" list and this modal unmounts
  // before a per-call callback would run, which would swallow the toast.
  async function approve() {
    if (!form || !dependent) return;
    const edits = editsFrom(dependent, form);
    const genEdits = generated && genForm ? generatedEditsFrom(generated, genForm) : {};
    try {
      await review.mutateAsync({
        submissionId: submission.id,
        body: {
          decision: 'approve',
          ...(Object.keys(edits).length > 0 ? { edits } : {}),
          ...(Object.keys(genEdits).length > 0 ? { generated: genEdits } : {}),
        },
      });
      setConfirmingApprove(false);
      toast.success(
        view.autoSubmit
          ? 'Approved. The report is being filed on IndianOil’s site.'
          : 'Approved. Press File now in the pane when you are ready to file it.',
      );
      onClose();
    } catch (err) {
      setConfirmingApprove(false);
      setServerError(
        err instanceof ApiError
          ? err.message
          : 'Could not approve it. Check the connection and try again.',
      );
    }
  }

  const reasonTrimmed = reason.trim();
  const reasonOk = reasonTrimmed.length >= REASON_MIN && reasonTrimmed.length <= REASON_MAX;

  async function sendBack() {
    if (!reasonOk) return;
    try {
      await review.mutateAsync({
        submissionId: submission.id,
        body: { decision: 'send_back', reason: reasonTrimmed },
      });
      setSendingBack(false);
      setReason('');
      toast.success('Sent back. The owner has been told why and the box is open again.');
      onClose();
    } catch (err) {
      setSendingBack(false);
      setServerError(
        err instanceof ApiError
          ? err.message
          : 'Could not send it back. Check the connection and try again.',
      );
    }
  }

  const confirmedDay = submission.confirmedDay
    ? formatYmd(submission.confirmedDay, { weekday: true })
    : null;

  return (
    <>
      <Dialog
        open={open}
        onClose={saving ? () => {} : onClose}
        size="xl"
        title="Check the mock drill report"
        description="Compare the photos with the details, correct anything that is wrong, then approve or send it back."
        footerBelow="wrap"
        dismissOnBackdrop={false}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={saving || !dependent}
              leftIcon={<Undo2 width={14} height={14} strokeWidth={1.75} />}
              onClick={() => {
                setServerError(null);
                setSendingBack(true);
              }}
            >
              Send back to owner
            </Button>
            <Button
              disabled={saving || !dependent}
              loading={saving && confirmingApprove}
              leftIcon={<CheckCircle2 width={14} height={14} strokeWidth={1.75} />}
              onClick={askApprove}
            >
              Approve and file
            </Button>
          </>
        }
      >
        {!dependent || !form ? (
          <Callout>
            This drill has no details to check yet. Close this and try again in a moment.
          </Callout>
        ) : (
          <div className="grid gap-4">
            <Callout intent="info">
              This is what will be filed on IndianOil’s site, under the outlet’s name.{' '}
              {confirmedDay
                ? `The owner confirmed the drill was done on ${confirmedDay}.`
                : 'The owner has not named a day.'}
            </Callout>

            {serverError ? (
              <div
                role="alert"
                className="rounded-md border border-danger/40 bg-danger-soft/40 px-3 py-2 text-sm text-text"
              >
                {serverError}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-start">
              <section aria-label="Photos" className="grid gap-2">
                <h3 className="text-sm font-semibold text-text">Photos from the owner</h3>
                <PhotoStrip photos={dependent.photos} size="large" stacked />
                <p className="text-xs text-text-subtle">Tap a photo to see it full size.</p>
              </section>

              <section aria-label="Details to check" className="grid gap-3">
                <h3 className="text-sm font-semibold text-text">Details to check</h3>

                <div>
                  <FieldHead htmlFor="md-scenario" label="Emergency practised" />
                  <Select
                    id="md-scenario"
                    value={form.scenarioId}
                    disabled={saving}
                    onChange={(e) => set('scenarioId', e.target.value)}
                  >
                    {view.scenarios.some((s) => s.id === form.scenarioId) ? null : (
                      <option value={form.scenarioId}>{dependent.scenarioLabel}</option>
                    )}
                    {view.scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldHead htmlFor="md-present" label="Persons present" />
                    <Input
                      id="md-present"
                      inputMode="numeric"
                      value={form.personsPresent}
                      disabled={saving}
                      invalid={!!shown.personsPresent}
                      aria-describedby="md-present-err"
                      onChange={(e) => set('personsPresent', e.target.value)}
                    />
                    <ErrorLine id="md-present-err" message={shown.personsPresent} />
                  </div>
                  <div>
                    <FieldHead htmlFor="md-short" label="Head-count shortfall" />
                    <Input
                      id="md-short"
                      inputMode="numeric"
                      value={form.headCountShort}
                      disabled={saving}
                      invalid={!!shown.headCountShort}
                      aria-describedby="md-short-err"
                      onChange={(e) => set('headCountShort', e.target.value)}
                    />
                    <ErrorLine id="md-short-err" message={shown.headCountShort} />
                  </div>
                </div>

                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-sm font-medium text-text">
                    Observers{' '}
                    <span className="text-xs font-normal text-text-subtle">up to three</span>
                  </legend>
                  {form.observers.map((o, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Input
                          aria-label={`Observer ${i + 1} name`}
                          placeholder="Name"
                          value={o.name}
                          maxLength={MOCK_DRILL_LIMITS.observerName}
                          disabled={saving}
                          onChange={(e) => setObserver(i, 'name', e.target.value)}
                        />
                      </div>
                      <div>
                        <Input
                          aria-label={`Observer ${i + 1} area`}
                          placeholder="Area observed"
                          value={o.area}
                          maxLength={MOCK_DRILL_LIMITS.observerArea}
                          disabled={saving}
                          onChange={(e) => setObserver(i, 'area', e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                  <ErrorLine id="md-observers-err" message={shown.observers} />
                </fieldset>

                <div>
                  <FieldHead
                    htmlFor="md-observations"
                    label="Observations"
                    counter={
                      <Counter value={form.observations} max={MOCK_DRILL_LIMITS.observations} />
                    }
                  />
                  <Textarea
                    id="md-observations"
                    rows={4}
                    value={form.observations}
                    maxLength={MOCK_DRILL_LIMITS.observations}
                    disabled={saving}
                    invalid={!!shown.observations}
                    aria-describedby="md-observations-err"
                    onChange={(e) => set('observations', e.target.value)}
                  />
                  <ErrorLine id="md-observations-err" message={shown.observations} />
                </div>

                <div>
                  <FieldHead
                    htmlFor="md-recommendations"
                    label="Recommendations"
                    counter={
                      <Counter
                        value={form.recommendations}
                        max={MOCK_DRILL_LIMITS.recommendations}
                      />
                    }
                  />
                  <Textarea
                    id="md-recommendations"
                    rows={4}
                    value={form.recommendations}
                    maxLength={MOCK_DRILL_LIMITS.recommendations}
                    disabled={saving}
                    invalid={!!shown.recommendations}
                    aria-describedby="md-recommendations-err"
                    onChange={(e) => set('recommendations', e.target.value)}
                  />
                  <ErrorLine id="md-recommendations-err" message={shown.recommendations} />
                </div>
              </section>
            </div>

            {generated && genForm ? (
              <section
                aria-label="The rest of the report"
                className="grid gap-2 border-t border-border pt-4"
              >
                <div>
                  <h3 className="text-sm font-semibold text-text">The rest of the report</h3>
                  <p className="text-xs text-text-muted">
                    Written by the system for this drill. Correct anything that is wrong; it goes to
                    IndianOil as shown here.
                  </p>
                </div>
                <GeneratedEditor
                  form={genForm}
                  onChange={setGenForm}
                  disabled={saving}
                  errors={genShown}
                  today={todayIst()}
                  personsPresent={wholeNumber(form.personsPresent)}
                  headCountShort={wholeNumber(form.headCountShort)}
                />
              </section>
            ) : null}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmingApprove}
        title="Approve this report?"
        size="md"
        description={
          <>
            <p>
              This report will be filed on IndianOil’s site under the outlet’s name
              {confirmedDay ? `, as a drill done on ${confirmedDay}` : ''}. The Field Officer there
              approves it next.
            </p>
            <p className="mt-2">
              {view.autoSubmit
                ? 'Filing starts as soon as you approve.'
                : 'Automatic filing is off, so it waits for you to press File now.'}{' '}
              These details also become the outlet’s saved setup for later drills.
            </p>
          </>
        }
        confirmLabel="Approve and file"
        loading={saving}
        onCancel={() => setConfirmingApprove(false)}
        onConfirm={() => void approve()}
      />

      <Dialog
        open={sendingBack}
        onClose={saving ? () => {} : () => setSendingBack(false)}
        size="md"
        title="Send back to the owner"
        description="The owner is told your reason in the chat and the box opens again at the photos."
        footerBelow="wrap"
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setSendingBack(false)}>
              Keep checking
            </Button>
            <Button
              loading={saving && sendingBack}
              disabled={!reasonOk}
              onClick={() => void sendBack()}
            >
              Send back
            </Button>
          </>
        }
      >
        <FieldHead
          htmlFor="md-reason"
          label="Reason"
          counter={<Counter value={reason} max={REASON_MAX} />}
        />
        <Textarea
          id="md-reason"
          rows={4}
          value={reason}
          maxLength={REASON_MAX}
          disabled={saving}
          placeholder="For example: the second photo is blurred. Please send a clearer one."
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="mt-1 text-xs text-text-subtle">
          Between {REASON_MIN} and {REASON_MAX} characters.
        </p>
      </Dialog>
    </>
  );
}
