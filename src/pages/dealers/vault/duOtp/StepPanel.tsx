import { CloudDownload, FileCheck2, FileX2, Play } from 'lucide-react';
import * as React from 'react';

import { Badge, Button, Checkbox, FieldError, Label, Textarea, useToast } from '@/components/ui';
import { useAnswerDuOtp } from '@/hooks/api/useDuOtp';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatYmd } from '@/lib/format';
import {
  DU_OTP_REASONS,
  type DuOtpAdminView,
  type DuOtpGroupView,
  type DuOtpReason,
} from '@dk/shared';
import { DU_OTP_REMARKS_MAX, duOtpAnswerSchema, type DuOtpAnswerInput } from '@dk/shared/schemas';

import { CERTIFICATE_SOURCE_LABEL, FETCH_VIEW, REASON_LABEL, stepLine } from './format';
import { UploadPaperButton } from './UploadPaperButton';

/**
 * Send an answer for a group and say what it did. Every answer comes back as the
 * outlet's whole view, which the hook writes into the cache, so there is nothing
 * to do here on success but say so.
 */
export function useSendAnswer(dealerId: string) {
  const toast = useToast();
  const { mutate, isPending } = useAnswerDuOtp(dealerId);
  const send = React.useCallback(
    (input: DuOtpAnswerInput, done: string) => {
      mutate(input, {
        onSuccess: () => toast.success(done),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Could not save that. Please try again.'),
      });
    },
    [mutate, toast],
  );
  return { send, pending: isPending };
}

export type SendAnswer = (input: DuOtpAnswerInput, done: string) => void;

interface StepProps {
  dealerId: string;
  group: DuOtpGroupView;
  view: DuOtpAdminView;
  send: SendAnswer;
  /** An answer is on its way. */
  pending: boolean;
  /** The portal row is being filled right now; nothing can change under the robot. */
  locked: boolean;
}

/**
 * The control for the step the group is on — the same ask the owner's box makes,
 * so an admin can answer it for them. It shows ONE step at a time, because the
 * server decides what comes next (each answer returns the view with the new
 * step) and a pane that guessed the order would drift from the box.
 */
export function StepPanel(props: StepProps) {
  const { group } = props;
  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium text-text">{stepLine(group.step)}</p>
      <StepBody {...props} />
    </div>
  );
}

function StepBody({ dealerId, group, view, send, pending, locked }: StepProps) {
  const off = pending || locked;
  switch (group.step) {
    case null:
      return (
        <div className="grid gap-2">
          <p className="text-sm text-text-muted">
            Start it for the owner and the questions open here. This moves every waiting event at the
            outlet, not only this unit.
          </p>
          <div>
            <Button
              size="sm"
              disabled={off}
              loading={pending}
              leftIcon={<Play width={14} height={14} strokeWidth={1.75} />}
              onClick={() => send({ step: 'start' }, 'Started. The waiting events are now being filled in.')}
            >
              Start for the owner
            </Button>
          </div>
        </div>
      );
    case 'reasons':
      return (
        <ReasonsForm
          key={group.inputs.reasons.join('|')}
          group={group}
          send={send}
          disabled={off}
          pending={pending}
        />
      );
    case 'certificate':
      return (
        <CertificateStep dealerId={dealerId} group={group} view={view} send={send} disabled={off} />
      );
    case 'serviceReport':
      return (
        <div className="grid gap-2">
          <p className="text-sm text-text-muted">
            The engineer’s service report for this unit, as a PDF or a clear photo. One report covers
            every nozzle he opened.
          </p>
          <div>
            <UploadPaperButton
              dealerId={dealerId}
              group={group.key}
              slot="serviceReport"
              label="Upload the service report"
              disabled={off}
            />
          </div>
        </div>
      );
    case 'other':
      return (
        <div className="grid gap-2">
          <p className="text-sm text-text-muted">
            Any other paper the portal takes — optional. Say there is none to move on.
          </p>
          <div className="flex flex-wrap gap-2">
            <UploadPaperButton
              dealerId={dealerId}
              group={group.key}
              slot="other"
              label="Upload another document"
              disabled={off}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={off}
              leftIcon={<FileX2 width={14} height={14} strokeWidth={1.75} />}
              onClick={() =>
                send({ step: 'other_skip', group: group.key }, 'Noted: there is no other document.')
              }
            >
              There is no other document
            </Button>
          </div>
        </div>
      );
    case 'remarks':
      return (
        <RemarksForm
          key={`${group.inputs.remarks ?? ''}|${group.suggestedRemarks}`}
          group={group}
          send={send}
          disabled={off}
          pending={pending}
        />
      );
    case 'review':
      return (
        <p className="text-sm text-text-muted">
          Nothing more to ask. Check what is gathered above, then test the fill or file it below.
        </p>
      );
    default:
      // A step newer than this build: say so rather than draw nothing.
      return (
        <p className="text-sm text-text-muted">
          This unit is on a step this screen does not know yet. The owner’s box can still finish it.
        </p>
      );
  }
}

/** Which of the portal's four reasons apply. At least one. */
function ReasonsForm({
  group,
  send,
  disabled,
  pending,
}: {
  group: DuOtpGroupView;
  send: SendAnswer;
  disabled: boolean;
  pending: boolean;
}) {
  const toast = useToast();
  const [picked, setPicked] = React.useState<DuOtpReason[]>(group.inputs.reasons);

  function toggle(reason: DuOtpReason) {
    setPicked((cur) => {
      const next = cur.includes(reason) ? cur.filter((r) => r !== reason) : [...cur, reason];
      // Kept in the portal's own order, whatever order they were ticked in.
      return DU_OTP_REASONS.filter((r) => next.includes(r));
    });
  }

  function save() {
    const parsed = duOtpAnswerSchema.safeParse({ step: 'reasons', group: group.key, reasons: picked });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Tick at least one reason');
      return;
    }
    send(parsed.data, 'Reasons saved.');
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm text-text-muted">Why was this unit opened? Tick every reason that applies.</p>
      <div className="grid gap-0.5">
        {DU_OTP_REASONS.map((reason) => (
          <Checkbox
            key={reason}
            label={REASON_LABEL[reason]}
            checked={picked.includes(reason)}
            disabled={disabled}
            onChange={() => toggle(reason)}
          />
        ))}
      </div>
      <div>
        <Button size="sm" disabled={disabled || picked.length === 0} loading={pending} onClick={save}>
          Save reasons
        </Button>
      </div>
    </div>
  );
}

/**
 * The calibration certificate: upload one, use the one MDG already holds, or have
 * it fetched from eMaaptaul. The fetch fills every group still waiting for one,
 * and runs in the background, so the line under the buttons follows its state.
 */
function CertificateStep({
  dealerId,
  group,
  view,
  send,
  disabled,
}: {
  dealerId: string;
  group: DuOtpGroupView;
  view: DuOtpAdminView;
  send: SendAnswer;
  disabled: boolean;
}) {
  const onFile = view.certificateOnFile;
  const fetching = view.fetch.state === 'working';
  const fetchView = FETCH_VIEW[view.fetch.state];
  return (
    <div className="grid gap-2">
      <p className="text-sm text-text-muted">
        The calibration certificate for this unit, as a PDF or a clear photo.
      </p>
      <div className="flex flex-wrap gap-2">
        <UploadPaperButton
          dealerId={dealerId}
          group={group.key}
          slot="certificate"
          label="Upload the certificate"
          disabled={disabled}
        />
        {onFile ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled}
            leftIcon={<FileCheck2 width={14} height={14} strokeWidth={1.75} />}
            onClick={() =>
              send(
                { step: 'certificate_on_file', group: group.key },
                'The certificate on file is attached.',
              )
            }
          >
            Use the one on file
          </Button>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || fetching}
          loading={fetching}
          leftIcon={<CloudDownload width={14} height={14} strokeWidth={1.75} />}
          onClick={() =>
            send(
              { step: 'certificate_fetch', group: group.key },
              'Fetching from eMaaptaul. This section updates when it is done.',
            )
          }
        >
          Fetch from eMaaptaul
        </Button>
      </div>
      {onFile ? (
        <p className="break-words text-xs text-text-muted">
          On file: {onFile.vcNumber ? `VC no. ${onFile.vcNumber} · ` : ''}
          {onFile.calibrationDate ? `calibrated ${formatYmd(onFile.calibrationDate)} · ` : ''}
          {CERTIFICATE_SOURCE_LABEL[onFile.source]}
        </p>
      ) : (
        <p className="text-xs text-text-muted">MDG holds no certificate for this outlet yet.</p>
      )}
      {view.fetch.state !== 'idle' ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <Badge intent={fetchView.intent}>{fetchView.label}</Badge>
          {view.fetch.message ? <span className="min-w-0 break-words">{view.fetch.message}</span> : null}
          {view.fetch.at ? <span>{formatDateTime(view.fetch.at)}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

/** The remark the portal's one-line box is given. Starts from the server's suggestion. */
function RemarksForm({
  group,
  send,
  disabled,
  pending,
}: {
  group: DuOtpGroupView;
  send: SendAnswer;
  disabled: boolean;
  pending: boolean;
}) {
  const id = React.useId();
  const [text, setText] = React.useState(group.inputs.remarks ?? group.suggestedRemarks);
  const [error, setError] = React.useState<string | undefined>();

  function save() {
    const parsed = duOtpAnswerSchema.safeParse({ step: 'remarks', group: group.key, remarks: text });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Write a short remark');
      return;
    }
    setError(undefined);
    send(parsed.data, 'Remark saved.');
  }

  return (
    <div className="grid gap-2">
      <div>
        <Label htmlFor={id}>Remark for IndianOil</Label>
        <Textarea
          id={id}
          rows={3}
          maxLength={DU_OTP_REMARKS_MAX}
          value={text}
          disabled={disabled}
          invalid={!!error}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(undefined);
          }}
        />
        <FieldError message={error} />
        <p className="mt-1 text-xs text-text-subtle">
          {text.length} of {DU_OTP_REMARKS_MAX} characters. It goes into the portal’s remark box as written.
        </p>
      </div>
      <div>
        <Button size="sm" disabled={disabled} loading={pending} onClick={save}>
          Save remark
        </Button>
      </div>
    </div>
  );
}
