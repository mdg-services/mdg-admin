/**
 * The DU OTP pane's wording and small decisions, kept out of the components so
 * they read as plain rules. This app has no test runner, so the less logic a
 * `.tsx` carries, the less of it can go wrong unseen.
 */
import type { Intent } from '@/lib/statusIntent';
import type {
  DuOtpAction,
  DuOtpCertificateOnFile,
  DuOtpFetchState,
  DuOtpFileSource,
  DuOtpGroupView,
  DuOtpInputs,
  DuOtpReason,
  DuOtpRunSummary,
  DuOtpState,
  DuOtpStep,
} from '@dk/shared';

/** Where one event stands, in the words an admin reads it. */
export const STATE_VIEW: Record<DuOtpState, { label: string; intent: Intent }> = {
  pending: { label: 'Waiting for the owner', intent: 'warning' },
  collecting: { label: 'Being filled in', intent: 'info' },
  ready: { label: 'Ready to file', intent: 'info' },
  submitting: { label: 'Filing now', intent: 'info' },
  submitted: { label: 'Filed', intent: 'success' },
  failed: { label: 'Failed', intent: 'danger' },
  gone: { label: 'Done at the outlet', intent: 'neutral' },
};

/**
 * The four reasons, as the portal's checkboxes name them. The stored value is
 * the portal's own spelling; this is only what the admin reads beside the tick.
 */
export const REASON_LABEL: Record<DuOtpReason, string> = {
  e_calibration: 'E-calibration',
  'Pulsar Repair': 'Pulsar repair',
  Replacement: 'Replacement',
  Others: 'Others',
};

/** The three papers, in the order the box asks for them. */
export const PAPER_LABEL = {
  certificate: 'Calibration certificate',
  serviceReport: 'DU service report',
  other: 'Other document',
} as const;

/** The steps that ask something, in order. `review` is the end, not a question. */
const QUESTION_STEPS = ['reasons', 'certificate', 'serviceReport', 'other', 'remarks'] as const;

const STEP_LABEL: Record<DuOtpStep, string> = {
  reasons: 'Reasons',
  certificate: PAPER_LABEL.certificate,
  serviceReport: PAPER_LABEL.serviceReport,
  other: PAPER_LABEL.other,
  remarks: 'Remark',
  review: 'Ready to file',
};

/** "Step 2 of 5: Calibration certificate" — where the group's box is now. */
export function stepLine(step: DuOtpStep | null): string {
  if (step === null) return 'The owner has not said "do it for me" yet.';
  if (step === 'review') return 'Every input is in.';
  const at = QUESTION_STEPS.indexOf(step) + 1;
  return `Step ${at} of ${QUESTION_STEPS.length}: ${STEP_LABEL[step]}`;
}

/** Where a paper came from. */
export const FILE_SOURCE_LABEL: Record<DuOtpFileSource, string> = {
  dealer: 'Owner',
  admin: 'Admin',
  emaaptaul: 'eMaaptaul',
  on_file: 'Already on file',
};

/** Where the certificate MDG holds came from. */
export const CERTIFICATE_SOURCE_LABEL: Record<DuOtpCertificateOnFile['source'], string> = {
  dealer: 'Uploaded by the owner',
  admin: 'Uploaded by an admin',
  emaaptaul: 'Fetched from eMaaptaul',
  claim: 'From a calibration claim',
};

/** Fetching the certificate from eMaaptaul. */
export const FETCH_VIEW: Record<DuOtpFetchState, { label: string; intent: Intent }> = {
  idle: { label: 'Not fetched', intent: 'neutral' },
  working: { label: 'Fetching', intent: 'info' },
  needs_login: { label: 'Sign-in needed', intent: 'warning' },
  failed: { label: 'Fetch failed', intent: 'danger' },
  done: { label: 'Fetched', intent: 'success' },
};

const RUN_STATUS_VIEW: Record<DuOtpRunSummary['status'], { label: string; intent: Intent }> = {
  PENDING: { label: 'Queued', intent: 'neutral' },
  RUNNING: { label: 'Running', intent: 'info' },
  SUCCESS: { label: 'Done', intent: 'success' },
  FAILED: { label: 'Failed', intent: 'danger' },
  CANCELLED: { label: 'Cancelled', intent: 'neutral' },
};

export function runStatusView(status: DuOtpRunSummary['status']): { label: string; intent: Intent } {
  // A status newer than this build falls back to its own word, never a crash.
  return RUN_STATUS_VIEW[status] ?? { label: String(status).toLowerCase(), intent: 'neutral' };
}

/** What a run was for. A test fill carries its own "Dry run" badge beside this, so it is never read as a filing. */
export function runActionLabel(run: Pick<DuOtpRunSummary, 'action'>): string {
  const labels: Record<DuOtpAction, string> = {
    check: 'Read the portal list',
    submit: 'Fill the portal row',
    fetch_certificate: 'Fetch the certificate',
  };
  return labels[run.action] ?? run.action;
}

/** "manual" / "backfill" / "scheduled" as a sentence-case word. */
export function triggerLabel(trigger: string): string {
  const words = trigger.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '-';
}

/** Everything the portal's row needs is in. The same rule the server applies before it files. */
export function inputsComplete(inputs: DuOtpInputs): boolean {
  return (
    inputs.reasons.length > 0 &&
    !!inputs.certificate &&
    !!inputs.serviceReport &&
    (!!inputs.other || inputs.otherSkipped) &&
    !!inputs.remarks?.trim()
  );
}

/** A run of this service is being worked on now (or queued to be). */
export function isRunLive(run: Pick<DuOtpRunSummary, 'status'>): boolean {
  return run.status === 'RUNNING' || run.status === 'PENDING';
}

/** "DU 4 · Gilbarco Encore" — the unit, by whatever the portal gave. */
export function groupTitle(group: Pick<DuOtpGroupView, 'duSerial' | 'duMake' | 'duModel'>): string {
  const unit = [group.duMake, group.duModel].filter(Boolean).join(' ');
  return group.duSerial ? `DU ${group.duSerial}` : unit || 'Dispensing unit';
}

/** "128 KB" / "2.4 MB" for a file chip. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The file picker's `accept`: a PDF, or a JPEG, PNG or WebP photo (the server makes a photo a PDF). */
export const PAPER_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';
