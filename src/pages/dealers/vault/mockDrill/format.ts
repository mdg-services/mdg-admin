/**
 * The Mock Drill pane's wording and small decisions, kept out of the components
 * so they read as plain rules. This app has no test runner, so the less logic a
 * `.tsx` carries, the less of it can go wrong unseen.
 */
import type { Intent } from '@/lib/statusIntent';
import type {
  MockDrillAdminView,
  MockDrillPortalState,
  MockDrillRunSummary,
  MockDrillState,
  MockDrillStep,
  MockDrillSubmissionView,
} from '@dk/shared';

/** Where one submission stands, as a short label. */
export const STATE_VIEW: Record<MockDrillState, { label: string; intent: Intent }> = {
  collecting: { label: 'Owner is giving details', intent: 'info' },
  review: { label: 'Waiting for you to check', intent: 'warning' },
  ready: { label: 'Approved', intent: 'info' },
  submitting: { label: 'Being filed', intent: 'info' },
  submitted: { label: 'Submitted', intent: 'success' },
  failed: { label: 'Failed', intent: 'danger' },
  cancelled: { label: 'Cancelled', intent: 'neutral' },
};

export function stateView(state: MockDrillState): { label: string; intent: Intent } {
  // A state newer than this build falls back to its own word, never a crash.
  return STATE_VIEW[state] ?? { label: String(state), intent: 'neutral' };
}

const STEP_WORDS: Record<MockDrillStep, string> = {
  choose: 'choosing between the same setup and a new kind of drill',
  scenario: 'picking the emergency',
  photos: 'adding the two photos',
  when: 'saying which day it was done',
  review: 'about to send it',
};

/** What the owner's box is on, in a phrase that follows "The owner is ...". */
export function stepWords(step: MockDrillStep | null): string {
  return step ? STEP_WORDS[step] : 'starting';
}

/** Where IndianOil's own page says the outlet's mock drill stands. */
export const PORTAL_VIEW: Record<
  MockDrillPortalState,
  { label: string; intent: Intent; line: string }
> = {
  unknown: {
    label: 'Not read yet',
    intent: 'neutral',
    line: 'The portal has not been read for this outlet yet. Press Check now.',
  },
  none: {
    label: 'Nothing saved',
    intent: 'neutral',
    line: 'The portal holds no mock drill report for this outlet.',
  },
  draft: {
    label: 'Draft saved',
    intent: 'neutral',
    line: 'The portal holds a saved draft. Filing writes over it.',
  },
  pending_approval: {
    label: 'Waiting for the Field Officer',
    intent: 'warning',
    line: 'A report is already waiting for the Field Officer. The portal will not take another until it is approved or returned.',
  },
  returned: {
    label: 'Returned by the Field Officer',
    intent: 'danger',
    line: 'The Field Officer sent the last report back. Read the remark below before filing again.',
  },
};

export interface StatusLine {
  label: string;
  intent: Intent;
  /** One or two plain sentences under the label. */
  detail: string;
}

/**
 * The one sentence at the top of the pane: what is happening with this outlet's
 * mock drill right now, and whether it needs the admin.
 */
export function statusLine(view: MockDrillAdminView): StatusLine {
  const open = view.open;
  if (open) {
    switch (open.state) {
      case 'collecting':
        return {
          label: 'Owner is giving details',
          intent: 'info',
          detail: `The owner is ${stepWords(open.step)}. Nothing needs you yet.`,
        };
      case 'review':
        return {
          label: 'Waiting for you to check',
          intent: 'warning',
          detail:
            'The owner has sent the photos and the emergency. Check them against the report before it goes to IndianOil.',
        };
      case 'ready':
        return {
          label: 'Approved, not filed yet',
          intent: 'info',
          detail: view.autoSubmit
            ? 'It is approved and will be filed on the portal by itself.'
            : 'It is approved. Automatic filing is off, so press File now when you are ready.',
        };
      case 'submitting':
        return {
          label: 'Being filed',
          intent: 'info',
          detail:
            'A run is filling in IndianOil’s page now. This updates when the portal has answered.',
        };
      case 'failed':
        return {
          label: 'Filing failed',
          intent: 'danger',
          detail: open.failure ?? 'The report was not filed. See the runs below, then press Retry.',
        };
      case 'submitted':
        return {
          label: 'Submitted',
          intent: 'success',
          detail:
            'The report is on IndianOil’s portal. The Field Officer approves it next, on the portal.',
        };
      case 'cancelled':
        break;
    }
  }
  if (view.portal.state === 'pending_approval') {
    return {
      label: 'IndianOil already has one waiting',
      intent: 'warning',
      detail:
        'A report is waiting for the Field Officer. Another cannot be filed until it is approved or returned.',
    };
  }
  if (view.portal.state === 'returned') {
    return {
      label: 'Returned by the Field Officer',
      intent: 'danger',
      detail: 'Nothing is open at MDG. Ask the owner to do a drill again, or file a new one.',
    };
  }
  return {
    label: 'Nothing open',
    intent: 'neutral',
    detail: view.setup
      ? 'No drill is in progress. Press Ask owner when the outlet has done one.'
      : 'No drill is in progress and the outlet has no approved setup yet. Press Ask owner when it has done one.',
  };
}

/** A run of this service is being worked on now (or queued to be). */
export function isRunLive(run: Pick<MockDrillRunSummary, 'status'>): boolean {
  return run.status === 'RUNNING' || run.status === 'PENDING';
}

const RUN_STATUS_VIEW: Record<MockDrillRunSummary['status'], { label: string; intent: Intent }> = {
  PENDING: { label: 'Queued', intent: 'neutral' },
  RUNNING: { label: 'Running', intent: 'info' },
  SUCCESS: { label: 'Done', intent: 'success' },
  FAILED: { label: 'Failed', intent: 'danger' },
  CANCELLED: { label: 'Cancelled', intent: 'neutral' },
};

export function runStatusView(status: MockDrillRunSummary['status']): {
  label: string;
  intent: Intent;
} {
  return RUN_STATUS_VIEW[status] ?? { label: String(status).toLowerCase(), intent: 'neutral' };
}

/** What a run was for. A dry run files nothing and says so. */
export function runActionLabel(run: Pick<MockDrillRunSummary, 'action' | 'dryRun'>): string {
  if (run.action === 'check') return 'Read the portal’s state';
  if (run.action === 'submit') return run.dryRun ? 'Test fill (nothing filed)' : 'File the report';
  return String(run.action);
}

/** "manual" / "scheduled" as a sentence-case word. */
export function triggerLabel(trigger: string): string {
  const words = trigger.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '-';
}

/** Which of the pane's buttons make sense for this view. */
export function availableActions(view: MockDrillAdminView): {
  fileNow: boolean;
  retry: boolean;
  cancel: boolean;
} {
  const state = view.open?.state;
  return {
    fileNow: state === 'ready',
    retry: state === 'failed',
    cancel: state === 'collecting' || state === 'review' || state === 'ready' || state === 'failed',
  };
}

/** "50 KB" / "2.4 MB" for a photo chip. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "Same as last time" or "New kind of drill". */
export function modeLabel(s: Pick<MockDrillSubmissionView, 'mode'>): string {
  return s.mode === 'same' ? 'Same setup as last time' : 'New kind of drill';
}

/** Seconds as "45 s" or "2 min 10 s", for the response table. */
export function seconds(n: number): string {
  if (n < 60) return `${n} s`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}
