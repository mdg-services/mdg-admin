import { AlertCircle, FlaskConical, Pencil, Send } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardSubtitle,
  CardTitle,
  ConfirmDialog,
  Spinner,
} from '@/components/ui';
import { formatYmd } from '@/lib/format';
import type {
  DuOtpAdminView,
  DuOtpFileView,
  DuOtpGroupView,
} from '@dk/shared';
import type { DuOtpEditField } from '@dk/shared/schemas';

import { GroupEntries } from './Events';
import {
  FILE_SOURCE_LABEL,
  PAPER_LABEL,
  REASON_LABEL,
  STATE_VIEW,
  fileSize,
  groupTitle,
  inputsComplete,
} from './format';
import { OpenFileButton } from './OpenFileButton';
import { StepPanel, useSendAnswer, type SendAnswer } from './StepPanel';

/**
 * One dispensing unit with an event waiting on IndianOil's portal: what the
 * portal listed, what has been gathered for it, the step it is on, and the two
 * buttons that act on the portal.
 *
 * The papers are per unit (one service report covers every nozzle the engineer
 * opened), so every event in the group is filed with the same answers.
 */
export function GroupCard({
  dealerId,
  group,
  view,
  runBusy,
  activeKind,
  onRun,
}: {
  dealerId: string;
  group: DuOtpGroupView;
  view: DuOtpAdminView;
  /** A run of this service is being started or watched; nothing else may start one. */
  runBusy: boolean;
  /** Which of this group's two buttons started the run being watched, if it was this group's. */
  activeKind: 'submit' | 'testFill' | null;
  /** Start a run: `dryRun` fills the portal row and stops before Submit. */
  onRun: (group: DuOtpGroupView, dryRun: boolean) => void;
}) {
  const { send, pending } = useSendAnswer(dealerId);
  const [confirming, setConfirming] = React.useState(false);

  const state = STATE_VIEW[group.state];
  const locked = group.state === 'submitting';
  const complete = inputsComplete(group.inputs);
  const failure = group.state === 'failed' ? group.entries.find((e) => e.failure)?.failure : null;
  const canAct = complete && !locked && !runBusy;
  const nEvents = group.entries.length;

  return (
    <Card>
      <CardHeader padding="comfortable" align="center" action={<Badge intent={state.intent}>{state.label}</Badge>}>
        <CardTitle>{groupTitle(group)}</CardTitle>
        <CardSubtitle className="break-words">
          {[group.duMake, group.duModel].filter(Boolean).join(' ') || 'Make and model not given'}
          {group.duSerial ? ` · serial ${group.duSerial}` : ''} · {nEvents} event{nEvents === 1 ? '' : 's'}
        </CardSubtitle>
      </CardHeader>

      <div className="divide-y divide-border">
        {failure ? (
          <div className="flex items-start gap-2.5 bg-danger-soft/40 p-3 md:px-4">
            <AlertCircle width={18} height={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">The last attempt to file this did not go through</p>
              <p className="break-words text-sm text-text-muted">{failure}</p>
            </div>
          </div>
        ) : null}

        {locked ? (
          <div className="flex items-center gap-2.5 p-3 text-sm text-text-muted md:px-4">
            <Spinner size={16} />
            <span>The robot is filling the portal row now. This updates by itself.</span>
          </div>
        ) : null}

        <Section title="Events on the portal" flush>
          <GroupEntries entries={group.entries} />
        </Section>

        {/* Nothing gathered yet (the owner has not started): five "Not given yet" rows
            would only push the next step off a phone screen. */}
        {anythingGathered(group) ? (
          <Section title="Gathered so far">
            <GatheredInputs group={group} send={send} disabled={pending || locked} />
          </Section>
        ) : null}

        <Section title="Next step">
          <StepPanel
            dealerId={dealerId}
            group={group}
            view={view}
            send={send}
            pending={pending}
            locked={locked}
          />
        </Section>

        <Section title="File with IndianOil">
          <div className="grid gap-2">
            <p className="text-sm text-text-muted">
              {view.autoSubmit
                ? 'Filing is automatic: it happens the moment the owner presses Submit. You can also file it from here.'
                : 'Filing is manual: nothing goes to IndianOil until someone presses Submit here.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!canAct}
                loading={activeKind === 'testFill'}
                leftIcon={<FlaskConical width={14} height={14} strokeWidth={1.75} />}
                onClick={() => onRun(group, true)}
              >
                Test fill (no submit)
              </Button>
              <Button
                size="sm"
                disabled={!canAct}
                loading={activeKind === 'submit'}
                leftIcon={<Send width={14} height={14} strokeWidth={1.75} />}
                onClick={() => setConfirming(true)}
              >
                Submit to IndianOil
              </Button>
            </div>
            <p className="text-xs text-text-subtle">
              {complete
                ? 'Test fill opens the portal, fills the row and stops before Submit. Nothing is filed. The screenshots are kept on the run, in the dealer’s Run history.'
                : 'Both buttons open once every input above is in.'}
            </p>
          </div>
        </Section>
      </div>

      <ConfirmDialog
        open={confirming}
        title="File this with IndianOil?"
        description={
          <>
            This fills the portal row for {groupTitle(group)} ({nEvents} event{nEvents === 1 ? '' : 's'}) and
            presses Submit. IndianOil keeps what is filed and it cannot be undone from here. If you only want
            to check the page, use Test fill instead.
          </>
        }
        confirmLabel="Submit to IndianOil"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onRun(group, false);
        }}
      />
    </Card>
  );
}

function anythingGathered(group: DuOtpGroupView): boolean {
  const i = group.inputs;
  return (
    i.reasons.length > 0 || !!i.certificate || !!i.serviceReport || !!i.other || i.otherSkipped || !!i.remarks
  );
}

function Section({
  title,
  flush = false,
  children,
}: {
  title: string;
  /** The body brings its own padding (a table or a card stack that runs to the edges). */
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="px-3 pb-2 pt-3 text-sm font-semibold text-text md:px-4">{title}</h4>
      <div className={flush ? 'pb-1' : 'px-3 pb-3 md:px-4'}>{children}</div>
    </section>
  );
}

/** What the portal's row will be given, with the way to change each answer. */
function GatheredInputs({
  group,
  send,
  disabled,
}: {
  group: DuOtpGroupView;
  send: SendAnswer;
  disabled: boolean;
}) {
  const { inputs } = group;
  const reopen = (field: DuOtpEditField) => (
    <Button
      variant="ghost"
      size="sm"
      tone="brand"
      padding="none"
      disabled={disabled || group.step === field}
      leftIcon={<Pencil width={13} height={13} strokeWidth={1.75} />}
      onClick={() => send({ step: 'edit', group: group.key, field }, 'Reopened. Answer it again under Next step.')}
    >
      Change
    </Button>
  );

  const none = <span className="text-text-subtle">Not given yet</span>;

  return (
    <dl className="divide-y divide-border">
      <Row label="Reasons" action={inputs.reasons.length > 0 ? reopen('reasons') : null}>
        {inputs.reasons.length > 0 ? (
          <span className="flex flex-wrap gap-1.5">
            {inputs.reasons.map((r) => (
              <Badge key={r} intent="neutral">
                {REASON_LABEL[r]}
              </Badge>
            ))}
          </span>
        ) : (
          none
        )}
      </Row>
      <Row label={PAPER_LABEL.certificate} action={inputs.certificate ? reopen('certificate') : null}>
        {inputs.certificate ? <Paper file={inputs.certificate} /> : none}
      </Row>
      <Row label={PAPER_LABEL.serviceReport} action={inputs.serviceReport ? reopen('serviceReport') : null}>
        {inputs.serviceReport ? <Paper file={inputs.serviceReport} /> : none}
      </Row>
      <Row
        label={PAPER_LABEL.other}
        action={inputs.other || inputs.otherSkipped ? reopen('other') : null}
      >
        {inputs.other ? (
          <Paper file={inputs.other} />
        ) : inputs.otherSkipped ? (
          <span className="text-text-muted">Skipped: there is no other document</span>
        ) : (
          none
        )}
      </Row>
      <Row label="Remark" action={inputs.remarks ? reopen('remarks') : null}>
        {inputs.remarks ? <span className="whitespace-pre-wrap">{inputs.remarks}</span> : none}
      </Row>
    </dl>
  );
}

function Row({
  label,
  action,
  children,
}: {
  label: string;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <dt className="text-xs font-medium text-text-muted">{label}</dt>
        {action}
      </div>
      <dd className="mt-1 min-w-0 break-words text-sm text-text">{children}</dd>
    </div>
  );
}

/** One paper: its name, size, where it came from, what it says, and a way to open it. */
function Paper({ file }: { file: DuOtpFileView }) {
  const facts = [
    fileSize(file.size),
    file.vcNumber ? `VC no. ${file.vcNumber}` : null,
    file.calibrationDate ? `calibrated ${formatYmd(file.calibrationDate)}` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="min-w-0 break-all font-medium">{file.filename}</span>
      <Badge intent="neutral">{FILE_SOURCE_LABEL[file.source]}</Badge>
      <OpenFileButton url={file.url} filename={file.filename} />
      <span className="basis-full text-xs text-text-muted">{facts.join(' · ')}</span>
    </div>
  );
}
