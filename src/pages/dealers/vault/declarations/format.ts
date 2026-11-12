/**
 * The Declarations pane's wording and small decisions, kept out of the
 * components so they read as plain rules. This app has no test runner, so the
 * less logic a `.tsx` carries, the less of it can go wrong unseen.
 *
 * Everything an admin reads here is in plain words: no codes, no portal
 * jargon. The portal's own sentences (its reply to Submit) are shown as the
 * portal wrote them and labelled as such.
 */
import type { Intent } from '@/lib/statusIntent';
import type {
  DeclarationFiledKind,
  DeclarationKind,
  DeclarationOutcome,
  DeclarationPortalState,
  DeclarationRunSummary,
  DeclarationStatusView,
  DeclarationsAdminView,
  WashroomPhotoView,
  WashroomState,
} from '@dk/shared';
import type { DeclarationsAdminAction, DeclarationsConfigBody } from '@dk/shared/schemas';

// By path, not from '@dk/shared': the check script (`tsx --test`) resolves the package to its
// compiled `dist/`, which these tables are newer than (`calibrationClaim/format.ts` does the same).
// Nothing else here may import through the `@/` alias for a value: `tsx` does not know it.
import {
  DECLARATION_INFO,
  WASHROOM_EVERY_DAYS_MAX,
  WASHROOM_EVERY_DAYS_MIN,
  WASHROOM_PHOTO_COUNT,
  declarationOutcomeIsDone,
} from '../../../../../shared/src/types/declarations';
import { formatDateTime, formatTime, formatYmd } from '../../../../lib/format';

/** A run that started longer ago than this and still says RUNNING is a dead record, not work in flight. */
export const RUN_LIVE_WINDOW_MS = 30 * 60 * 1000;

/**
 * The plain instruction for Branded Fuels while it is not filled. MDG never fills this page.
 * Shown under the server's own task line only when that line does not already say it
 * ({@link brandedTaskLines}).
 */
export const BRANDED_HOW_WORDS =
  'Fill it on IndianOil’s portal yourself, then press I filled it, or press Check again.';

/** Why every robot button is off when the service is not on for the outlet. */
const NOT_ATTACHED = 'Declarations are not switched on for this outlet.';

/** The kind's name as an admin reads it ("Safety declaration"). */
export function kindTitle(kind: DeclarationKind): string {
  return DECLARATION_INFO[kind].titleEn;
}

/** "Safety declaration and Washroom cleanliness" for a short list. */
function joinWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** One or two sentences on how often it comes round and who files it. */
export function ruleWords(status: DeclarationStatusView, washroomEveryDays: number): string {
  switch (status.kind) {
    case 'safety':
      return status.auto
        ? 'Due every day. MDG ticks every box and files it.'
        : 'Due every day. Automatic filing is off, so it is filed only when you press File now.';
    case 'washroom': {
      const days = washroomEveryDays === 1 ? 'every day' : `every ${washroomEveryDays} days`;
      return status.auto
        ? `Due ${days}, with two photos from the owner. MDG files it once both photos are in.`
        : `Due ${days}, with two photos from the owner. Automatic filing is off, so press File now once both photos are in.`;
    }
    case 'standard':
      return status.auto
        ? 'Needed once in 7 to 8 years. MDG fills it if it is empty on the portal.'
        : 'Needed once in 7 to 8 years. Automatic filing is off, so press File now if it is empty.';
    case 'branded':
      return 'Needed once per outlet. MDG never fills this one: an admin fills it on IndianOil’s portal.';
  }
}

/** Where IndianOil's own page says a declaration stands. `unknown` is never read as done. */
export const PORTAL_STATE_VIEW: Record<
  DeclarationPortalState,
  { label: string; intent: Intent; line: string }
> = {
  open: {
    label: 'Not filled yet',
    intent: 'neutral',
    line: 'IndianOil’s page shows an empty form.',
  },
  filled: {
    label: 'Filled',
    intent: 'success',
    line: 'IndianOil’s page shows it is done.',
  },
  unknown: {
    label: 'Could not tell',
    intent: 'warning',
    line: 'The page could not be read with certainty, so it is not counted as done.',
  },
};

const NOT_READ = {
  label: 'Not read yet',
  intent: 'neutral' as Intent,
  line: 'This page has not been read for this outlet yet. Press Check now.',
};

export function portalStateView(state: DeclarationPortalState | null): {
  label: string;
  intent: Intent;
  line: string;
} {
  if (!state) return NOT_READ;
  // A state newer than this build falls back to "could not tell", never a crash.
  return PORTAL_STATE_VIEW[state] ?? PORTAL_STATE_VIEW.unknown;
}

/** How one attempt to file ended, as a short label and a plain sentence. */
export const OUTCOME_VIEW: Record<
  DeclarationOutcome,
  { label: string; intent: Intent; sentence: string }
> = {
  submitted: {
    label: 'Filed',
    intent: 'success',
    sentence: 'Filed. IndianOil’s portal confirmed it.',
  },
  filled: {
    label: 'Test fill',
    intent: 'info',
    sentence: 'Test fill only. Every box was filled and read back right. Nothing was submitted.',
  },
  already_done: {
    label: 'Already done',
    intent: 'success',
    sentence: 'The portal already had it, so nothing was sent.',
  },
  refused: {
    label: 'Refused',
    intent: 'danger',
    sentence: 'IndianOil’s portal refused it. Its own words are shown.',
  },
  no_reply: {
    label: 'No answer',
    intent: 'warning',
    sentence:
      'Submit was pressed but the portal did not answer. The next read of the page will settle it.',
  },
  fill_mismatch: {
    label: 'Not sent',
    intent: 'danger',
    sentence: 'A box did not read back right after filling, so Submit was not pressed.',
  },
  not_open: {
    label: 'Not a form',
    intent: 'warning',
    sentence: 'The page was not a form MDG could fill, so nothing was sent.',
  },
  photos_missing: {
    label: 'Photos missing',
    intent: 'warning',
    sentence: 'The washroom photos were not there, so nothing was sent.',
  },
  skipped: {
    label: 'Skipped',
    intent: 'neutral',
    sentence: 'Not tried: the switch was off or it was not due.',
  },
};

export function outcomeView(outcome: DeclarationOutcome): {
  label: string;
  intent: Intent;
  sentence: string;
} {
  return OUTCOME_VIEW[outcome] ?? { label: String(outcome), intent: 'neutral', sentence: '' };
}

/** Where this week's washroom declaration stands at MDG, as a short label. */
export const WASHROOM_STATE_VIEW: Record<WashroomState, { label: string; intent: Intent }> = {
  idle: { label: 'Nothing in progress', intent: 'neutral' },
  collecting: { label: 'Waiting for the owner’s photos', intent: 'info' },
  ready: { label: 'Photos in, ready to file', intent: 'info' },
  filing: { label: 'Being filed', intent: 'info' },
  failed: { label: 'Filing failed', intent: 'danger' },
};

export function washroomStateView(state: WashroomState): { label: string; intent: Intent } {
  return WASHROOM_STATE_VIEW[state] ?? { label: String(state), intent: 'neutral' };
}

/**
 * The small label for photos the owner put back with "use the same photos as last time", or
 * null when every photo is a new one. Drawn under this week's photos and on a past filing, so
 * an admin can see a washroom that was not photographed again this week.
 */
export function reusedPhotosLabel(
  photos: ReadonlyArray<Pick<WashroomPhotoView, 'slot' | 'reused'>>,
): string | null {
  const reused = photos.filter((p) => p.reused === true);
  if (reused.length === 0) return null;
  if (reused.length === photos.length) {
    return photos.length === 1 ? 'Same photo as last time' : 'Same photos as last time';
  }
  return `The ${reused[0]!.slot} photo is the same as last time`;
}

/** The washroom cycle in one or two sentences. */
export function washroomLine(view: DeclarationsAdminView, now: number = Date.now()): string {
  const w = view.washroom;
  switch (w.state) {
    case 'idle': {
      const last = view.lastWashroomFiledDay
        ? `Last filed ${formatYmd(view.lastWashroomFiledDay, { weekday: true })}`
        : 'Never filed by MDG yet';
      const next = view.nextWashroomDueDay
        ? `next due ${formatYmd(view.nextWashroomDueDay, { weekday: true })}`
        : 'no due date yet';
      return `Nothing is waiting. ${last}; ${next}.`;
    }
    case 'collecting': {
      const asked = w.askedAt
        ? `The owner was asked ${formatDateTime(w.askedAt)}`
        : 'The owner was asked';
      const again =
        w.remindersSent > 0
          ? ` and reminded ${w.remindersSent} ${w.remindersSent === 1 ? 'time' : 'times'}`
          : '';
      return `${asked}${again}. ${w.photos.length} of ${WASHROOM_PHOTO_COUNT} photos are in.`;
    }
    case 'ready': {
      const sent = w.sentAt ? ` The owner sent them ${formatDateTime(w.sentAt)}.` : '';
      // `confirmedDay` is the day the owner pressed Send. For photos taken this week that is
      // the day they say they were taken. For photos put back from last time it is only the
      // day they were put back, and what the owner said is that the washroom still looks like
      // them: the card must not say "taken on" about a photo from an earlier week. The same
      // helper decides this and the "Same photos as last time" label under the thumbnails.
      const putBack = reusedPhotosLabel(w.photos) !== null;
      const confirmed = w.confirmedDay ? formatYmd(w.confirmedDay, { weekday: true }) : null;
      const day = confirmed
        ? putBack
          ? ` They say the washroom still looks like these photos (put back on ${confirmed}).`
          : ` They say the photos were taken on ${confirmed}.`
        : '';
      return `Both photos are in.${sent}${day} They are filed in the next round, or press File now.`;
    }
    case 'filing': {
      // "Being filed" says a run is at work only while a run is listed as working. A cycle
      // left on "filing" with no live run is a Submit nobody heard back about, or a run that died.
      if (awaitingAnswer(statusOf(view, 'washroom'))) {
        return 'Submit was pressed and IndianOil’s portal did not answer, and no run is working on it now. Press Check now to read the page, or look at the page yourself and say how it went.';
      }
      if (hasLiveRun(view.runs, now)) {
        return 'A run is filling in IndianOil’s page now. This updates when the portal has answered.';
      }
      return 'Filing was started and has not finished. This updates by itself. If it stays like this, press Check now.';
    }
    case 'failed':
      return `${w.failure ?? 'The filing did not go through.'} Press Retry, or drop the photos and ask the owner again.`;
  }
}

/** The "due" line on a card, or null when there is nothing worth saying. */
export function dueLine(s: DeclarationStatusView): string | null {
  if (s.kind === 'branded') return null;
  if (s.due) return 'Due now.';
  if (s.nextDueDay) return `Next due ${formatYmd(s.nextDueDay, { weekday: true })}.`;
  if (s.kind === 'standard') {
    return s.portalState === 'filled' ? 'Done. It is not due again for years.' : 'No due date yet.';
  }
  return 'Nothing due.';
}

/** "Last filed" for a card, in words (for Branded Fuels: who marked it filled, and when). */
export function lastFiledLine(s: DeclarationStatusView): string {
  if (s.kind === 'branded') {
    if (s.markedDoneAt) {
      return `${s.markedDoneBy ? `By ${s.markedDoneBy}, ` : ''}${formatDateTime(s.markedDoneAt)}.`;
    }
    return 'Nobody has marked it.';
  }
  if (!s.lastFiledDay) return 'Never filed by MDG.';
  return `${formatYmd(s.lastFiledDay, { weekday: true })}${s.lastFiledAt ? `, at ${formatTime(s.lastFiledAt)}` : ''}.`;
}

/** The latest attempt, when it was not simply the last filing. */
export function lastTryLine(s: DeclarationStatusView): string | null {
  if (s.kind === 'branded' || !s.lastOutcome) return null;
  const v = outcomeView(s.lastOutcome);
  const when = s.lastAttemptAt ? formatDateTime(s.lastAttemptAt) : 'earlier';
  const why = s.lastFailure ? ` ${s.lastFailure}` : '';
  return `${when}: ${v.sentence}${why}`;
}

/** Why the last read of this page failed (the page would not open), or null when it did not. */
export function readFailureLine(s: DeclarationStatusView): string | null {
  if (!s.checkFailure) return null;
  const when = s.checkFailedAt ? formatDateTime(s.checkFailedAt) : 'Last time';
  return `${when}: ${s.checkFailure}`;
}

/**
 * Branded Fuels' task, in lines: the server's own words first (they carry what was found
 * on the page when it could not be read), then the fixed instruction only when those words
 * do not already tell the admin to press I filled it. Empty when there is no task.
 */
export function brandedTaskLines(s: DeclarationStatusView): string[] {
  if (s.kind !== 'branded' || !s.todo) return [];
  return /I filled it/i.test(s.todo) ? [s.todo] : [s.todo, BRANDED_HOW_WORDS];
}

/** Submit was pressed and no answer came: only a read of the page or an admin's look can settle it. */
export function awaitingAnswer(status: DeclarationStatusView | undefined): boolean {
  return !!status && (status.maybeFiled === true || !!status.pressedAt);
}

/** The status card for one kind, or undefined. */
export function statusOf(
  view: Pick<DeclarationsAdminView, 'statuses'>,
  kind: DeclarationKind,
): DeclarationStatusView | undefined {
  return view.statuses.find((s) => s.kind === kind);
}

/** The kinds the robot may file. Branded Fuels is not one of them: there is no file button for it, ever. */
export function filedKindOf(kind: DeclarationKind): DeclarationFiledKind | null {
  return kind === 'branded' ? null : kind;
}

/** The only place a File now / Test fill action is built. Null for Branded Fuels. */
export function fileAction(
  kind: DeclarationKind,
  dryRun: boolean,
): Extract<DeclarationsAdminAction, { action: 'file' }> | null {
  const filed = filedKindOf(kind);
  return filed ? { action: 'file', kind: filed, dryRun } : null;
}

/** The only place an "I checked: it went through / did not" action is built. Null for Branded Fuels. */
export function settleAction(
  kind: DeclarationKind,
  filed: boolean,
): Extract<DeclarationsAdminAction, { action: 'settle_filed' | 'settle_not_filed' }> | null {
  const k = filedKindOf(kind);
  if (!k) return null;
  return filed ? { action: 'settle_filed', kind: k } : { action: 'settle_not_filed', kind: k };
}

/** The two "I checked" buttons are drawn only for a Submit nobody heard back about, long enough ago. */
export function showSettle(status: DeclarationStatusView): boolean {
  return status.kind !== 'branded' && status.maybeFiled === true;
}

/** The badge in a card's header. */
export function kindBadge(s: DeclarationStatusView): { label: string; intent: Intent } {
  if (s.todo) return { label: 'Needs you', intent: s.kind === 'branded' ? 'danger' : 'warning' };
  const v = portalStateView(s.portalState);
  return { label: v.label, intent: v.intent };
}

/**
 * Branded Fuels with a task goes first, in the alert colour: it is the one
 * declaration that is nobody's job but an admin's. Everything else keeps the
 * order the server sends (safety, washroom, standard, branded).
 */
export function orderedStatuses(
  statuses: readonly DeclarationStatusView[],
): DeclarationStatusView[] {
  const pending = statuses.filter((s) => s.kind === 'branded' && !!s.todo);
  const rest = statuses.filter((s) => !(s.kind === 'branded' && !!s.todo));
  return [...pending, ...rest];
}

export interface SummaryLine {
  label: string;
  intent: Intent;
  /** One or two plain sentences under the label. */
  detail: string;
}

/** The one sentence at the top of the pane: does anything need a person, and what. */
export function summaryLine(view: DeclarationsAdminView): SummaryLine {
  const todos = view.statuses.filter((s) => !!s.todo);
  if (todos.length > 0) {
    const names = joinWords(todos.map((s) => kindTitle(s.kind)));
    return {
      label: todos.length === 1 ? '1 task for you' : `${todos.length} tasks for you`,
      intent: todos.some((s) => s.kind === 'branded') ? 'danger' : 'warning',
      detail: `Waiting: ${names}. Each card below says what to do.`,
    };
  }
  if (!view.active) {
    return {
      label: 'Switched off',
      intent: 'neutral',
      detail: 'Nothing is read or filed by itself for this outlet.',
    };
  }
  return {
    label: 'Nothing needs you',
    intent: 'success',
    detail: 'No declaration is waiting for a person. The daily round files what is due.',
  };
}

/** When any of the four pages was last read, or null. */
export function lastReadAt(view: DeclarationsAdminView): string | null {
  let best: string | null = null;
  for (const s of view.statuses) {
    if (s.checkedAt && (!best || s.checkedAt > best)) best = s.checkedAt;
  }
  return best;
}

/** The service has never read or filed anything for this outlet. */
export function neverUsed(view: DeclarationsAdminView): boolean {
  return (
    !view.active &&
    view.history.length === 0 &&
    view.runs.length === 0 &&
    view.statuses.every((s) => !s.checkedAt && !s.lastAttemptAt && !s.markedDoneAt)
  );
}

/** A whole number of days inside the limits, or null with the reason an admin can act on. */
export function parseEveryDays(text: string): { value: number | null; error: string | null } {
  const trimmed = text.trim();
  const message = `Enter a whole number of days from ${WASHROOM_EVERY_DAYS_MIN} to ${WASHROOM_EVERY_DAYS_MAX}.`;
  if (!/^\d{1,3}$/.test(trimmed)) return { value: null, error: message };
  const n = Number(trimmed);
  if (n < WASHROOM_EVERY_DAYS_MIN || n > WASHROOM_EVERY_DAYS_MAX) {
    return { value: null, error: message };
  }
  return { value: n, error: null };
}

/* ─────────────────────────── which buttons can be pressed ─────────────────────────── */

/** What every card's buttons are handed by the pane. */
export interface PaneControls {
  /** A robot run is starting or working: no other run may start, so a double tap cannot queue two logins. */
  runBusy: boolean;
  /** A request is in flight: the buttons that send nothing to the portal wait for it. */
  requestBusy: boolean;
  /** `actionKey` of the button that was pressed and has not been answered, or null. */
  pendingKey: string | null;
  /** A read of the four pages is under way (from this pane or from a run already listed). */
  checking: boolean;
  /** Today in IST, `YYYY-MM-DD`. */
  today: string;
  /** The time the pane was drawn at, milliseconds: what "a run is live" is measured against. */
  now: number;
  /** Press a button. The pane asks first where the button sends something outward. */
  onAct: (a: DeclarationsAdminAction) => void;
}

/** Whether a button can be pressed, and, when it cannot, why in one plain sentence. */
export interface Gate {
  ok: boolean;
  reason: string | null;
  /** True when the reason is already said at the top of the pane; the button's own note stays quiet. */
  quiet?: boolean;
}

const OK: Gate = { ok: true, reason: null };
const no = (reason: string): Gate => ({ ok: false, reason });
const notAttached: Gate = { ok: false, reason: NOT_ATTACHED, quiet: true };

/**
 * What the buttons that start a robot run wait for: the press that is on its way, or a run
 * listed as working that started recently enough to be real. NOT the washroom cycle's own
 * "filing" word: a cycle can sit on "filing" with no run alive (the box was restarted after
 * Submit), and then every button would be off with nothing to wait for.
 */
export function paneRunBusy(
  requestPending: boolean,
  runs: readonly DeclarationRunSummary[],
  now: number,
): boolean {
  return requestPending || hasLiveRun(runs, now);
}

/** What File now says while a Submit is waiting to be settled. */
const PRESSED_NO_ANSWER =
  'Submit was pressed and IndianOil did not answer. Press Check now, or look at the page yourself and say how it went.';

/**
 * File now (`dry` false) or Test fill (`dry` true) for safety, washroom or standard.
 * Mirrors the server's own refusals (`fileGate` in the backend), so a button that would be
 * turned away is off and says why instead of opening a confirm that ends in an error.
 */
export function fileGate(
  kind: DeclarationFiledKind,
  view: DeclarationsAdminView,
  dry: boolean,
  today: string,
): Gate {
  if (!view.active) return notAttached;
  const status = statusOf(view, kind);
  if (kind === 'washroom') {
    const w = view.washroom;
    if (w.photos.length < WASHROOM_PHOTO_COUNT) {
      return no('Both photos are needed first. Press Ask owner for photos.');
    }
    if (w.state === 'filing') {
      // A test fill is not blocked by an unanswered Submit, only by a filing under way.
      return dry || !awaitingAnswer(status) ? no('It is being filed now.') : no(PRESSED_NO_ANSWER);
    }
    if (!dry) {
      if (w.state === 'collecting') return no('The owner has not pressed Send yet.');
      if (w.state === 'failed') return no('A failed filing is tried again with Retry.');
      if (w.state === 'idle')
        return no('There are no washroom photos to file. Press Ask owner for photos.');
    }
    return OK;
  }
  if (dry) return OK;
  // A Submit nobody heard back about: the server refuses a second one until a read of the
  // page or an admin's look says how the first went. (Not "last outcome no_reply": a read of
  // an empty page clears the wait but leaves that outcome as the last one.)
  if (awaitingAnswer(status)) return no(PRESSED_NO_ANSWER);
  if (kind === 'standard' && status?.portalState === 'filled') {
    return no('It is already filled on IndianOil’s portal.');
  }
  if (
    kind === 'safety' &&
    status?.lastFiledDay === today &&
    declarationOutcomeIsDone(status.lastOutcome)
  ) {
    return no('It was already filed today.');
  }
  return OK;
}

export interface WashroomGates {
  ask: Gate;
  retry: Gate;
  drop: Gate;
}

/** Ask owner for photos, Retry and Drop photos on the washroom card. */
export function washroomGates(
  view: DeclarationsAdminView,
  now: number = Date.now(),
): WashroomGates {
  const w = view.washroom;
  const awaiting = awaitingAnswer(statusOf(view, 'washroom'));
  const ask: Gate = !view.active
    ? notAttached
    : w.state === 'ready'
      ? no('Both photos are already in.')
      : w.state === 'filing'
        ? no('It is being filed now.')
        : w.state === 'failed'
          ? no('Retry the filing, or drop the photos to start over.')
          : OK;
  const retry: Gate = !view.active
    ? notAttached
    : w.state === 'failed'
      ? OK
      : no('Only after a filing has failed.');
  // The server turns Drop away when nothing is held (idle), when Submit was pressed and not
  // yet settled, and while a run is working on it. A cycle stuck on "filing" with no run
  // alive can be dropped (the server frees a claim that old).
  const drop: Gate =
    w.state === 'idle'
      ? no('There are no photos to drop.')
      : w.state === 'filing' && awaiting
        ? no(
            'Submit was already pressed. Press Check now, or say how it went, before dropping the photos.',
          )
        : w.state === 'filing' && hasLiveRun(view.runs, now)
          ? no('It is being filed now.')
          : OK;
  return { ask, retry, drop };
}

/** Branded Fuels: which of its buttons make sense. */
export function brandedButtons(s: DeclarationStatusView): { filled: boolean; undo: boolean } {
  const portalSaysFilled = s.portalState === 'filled';
  return {
    filled: !s.markedDoneAt && !portalSaysFilled,
    undo: !!s.markedDoneAt && !portalSaysFilled,
  };
}

/* ───────────────────────────── what each button says ───────────────────────────── */

export interface ConfirmWords {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
}

export interface ActionWords {
  /** Null when the button acts at once (it reads or undoes, and sends nothing outward). */
  confirm: ConfirmWords | null;
  /** The toast once the server has taken it. */
  done: string;
}

/** Test fill and File now words for one kind, said in the sentence the admin reads. */
function fileWords(kind: DeclarationFiledKind, dry: boolean): ActionWords {
  const title = kindTitle(kind).toLowerCase();
  if (dry) {
    return {
      confirm: {
        title: `Run a test fill of the ${title}?`,
        body: 'This signs in to IndianOil’s site, fills the form and reads every box back to check it. It does NOT press Submit. It takes about a minute.',
        confirm: 'Run test fill',
      },
      done: 'Test fill started. It fills the form and stops before Submit.',
    };
  }
  const body: Record<DeclarationFiledKind, string> = {
    safety:
      'This signs in to IndianOil’s site, ticks every box, fills the feedback and place boxes and submits it as the outlet’s own declaration. It cannot be taken back from here.',
    washroom:
      'This signs in to IndianOil’s site and submits the washroom declaration with the two photos the owner sent, under the outlet’s name. It cannot be taken back from here.',
    standard:
      'This signs in to IndianOil’s site, answers Yes on both cards, ticks both boxes and submits. It is needed only once in 7 to 8 years. It cannot be taken back from here.',
  };
  return {
    confirm: { title: `File the ${title} now?`, body: body[kind], confirm: 'File now' },
    done: 'Filing started. This section updates when IndianOil has answered.',
  };
}

/** What pressing this button asks first (if anything) and says afterwards. */
export function actionWords(a: DeclarationsAdminAction): ActionWords {
  switch (a.action) {
    case 'check':
      return {
        confirm: null,
        done: 'Reading the portal. It takes about a minute and this section will refresh.',
      };
    case 'sweep':
      return {
        confirm: {
          title: 'Run today’s round now?',
          body: 'This signs in to IndianOil’s site and reads the pages. It files what is due and allowed: the safety declaration, the washroom one if both photos are in, and the standard form if it is empty. It may also post the photo request in the owner’s chat. Branded Fuels is never touched. It takes a few minutes.',
          confirm: 'Run the round',
        },
        done: 'The round started. This section updates as it runs.',
      };
    case 'ask_washroom':
      return {
        confirm: {
          title: 'Ask the owner for washroom photos?',
          body: 'This puts the photo box in the owners’ chat (and the manager’s). They see it as a new message and send two photos: one of the toilet from outside, one from inside.',
          confirm: 'Ask owner',
        },
        done: 'The photo box was posted to the owner’s chat.',
      };
    case 'file':
      return fileWords(a.kind, a.dryRun === true);
    case 'retry_washroom':
      return {
        confirm: {
          title: 'Try filing the washroom declaration again?',
          body: 'This signs in to IndianOil’s site again and submits it with the photos that are still held. It cannot be taken back from here.',
          confirm: 'Retry',
        },
        done: 'Trying again. This section updates when IndianOil has answered.',
      };
    case 'drop_washroom':
      return {
        confirm: {
          title: 'Drop this week’s washroom photos?',
          body: 'The photos held for this week are thrown away and the washroom cycle starts over. Nothing is sent to IndianOil. Press Ask owner for photos to get new ones.',
          confirm: 'Drop photos',
          danger: true,
        },
        done: 'This week’s photos were dropped.',
      };
    case 'settle_filed': {
      const title = kindTitle(a.kind).toLowerCase();
      return {
        confirm: {
          title: `Record that the ${title} went through?`,
          body: 'Press this only after you have opened IndianOil’s page yourself and seen that it shows as filed. MDG then records it as filed and does not press Submit again for it. Nothing is sent to IndianOil.',
          confirm: 'Yes, it went through',
        },
        done: 'Recorded as filed. MDG will not press Submit again for it.',
      };
    }
    case 'settle_not_filed': {
      const title = kindTitle(a.kind).toLowerCase();
      return {
        confirm: {
          title: `Record that the ${title} did not go through?`,
          body: 'Press this only after you have opened IndianOil’s page yourself and seen that it is not filed. MDG then treats it as not filed, so it can be filed again by File now or the next round. If it was in fact filed, it would be sent twice. Nothing is sent to IndianOil by this button.',
          confirm: 'Yes, it did not go through',
        },
        done: 'Recorded as not filed. It can be filed again.',
      };
    }
    case 'mark_branded_done':
      return a.done
        ? {
            confirm: {
              title: 'Did you fill Branded Fuels on IndianOil’s portal?',
              body: 'This clears the task and records your name and the time. Press it only once the form really is filled on the portal. Check again reads the page instead.',
              confirm: 'Yes, I filled it',
            },
            done: 'Marked as filled. The task is cleared.',
          }
        : { confirm: null, done: 'Put back as not filled. The task is open again.' };
  }
}

/** A short key that tells one button from another, for the spinner on the one that was pressed. */
export function actionKey(a: DeclarationsAdminAction): string {
  switch (a.action) {
    case 'file':
      return `file:${a.kind}:${a.dryRun === true ? 'dry' : 'real'}`;
    case 'settle_filed':
    case 'settle_not_filed':
      return `${a.action}:${a.kind}`;
    case 'mark_branded_done':
      return `mark_branded_done:${a.done ? 'yes' : 'no'}`;
    default:
      return a.action;
  }
}

/* ───────────────────── turning on filing by itself ───────────────────── */

/** The three switches that let MDG file in the outlet's name without anyone pressing a button. */
export const AUTO_SWITCH_KEYS = ['safetyDaily', 'washroomAuto', 'standardAuto'] as const;
export type AutoSwitchKey = (typeof AUTO_SWITCH_KEYS)[number];

/**
 * The switch a settings change turns ON, or null. Turning one on is a standing permission
 * to file with IndianOil in the outlet's name, so it asks first; turning one off, or any
 * other setting, is one tap.
 */
export function switchTurnedOn(patch: DeclarationsConfigBody): AutoSwitchKey | null {
  return AUTO_SWITCH_KEYS.find((key) => patch[key] === true) ?? null;
}

/** What turning each switch on says first, in the sentences the admin reads. */
export function switchOnWords(key: AutoSwitchKey): ConfirmWords {
  switch (key) {
    case 'safetyDaily':
      return {
        title: 'File the safety declaration every day?',
        body: 'The safety declaration is the dealer’s own signed statement. Every day MDG will tick every box on IndianOil’s page and submit it in the outlet’s name, without checking any fact. Turn this on only if this dealer has agreed to that. You can turn it off again with one tap.',
        confirm: 'Yes, the dealer agreed',
      };
    case 'washroomAuto':
      return {
        title: 'Let MDG file the washroom declaration by itself?',
        body: 'MDG will ask the owner for two washroom photos every 7 days. Once the owner has sent both (new ones, or last time’s put back) and ticked that they are right, MDG will sign in to IndianOil’s site and submit the washroom declaration in the outlet’s name, without asking again. Turn this on only if this dealer has agreed to that. You can turn it off again with one tap.',
        confirm: 'Yes, the dealer agreed',
      };
    case 'standardAuto':
      return {
        title: 'Let MDG fill the MDG and Customer Service Standard by itself?',
        body: 'If this form is empty on IndianOil’s portal, MDG will answer Yes on both cards, tick both boxes and submit it in the outlet’s name. It is needed only once in 7 to 8 years and cannot be taken back from here. Turn this on only if this dealer has agreed to that. You can turn it off again with one tap.',
        confirm: 'Yes, the dealer agreed',
      };
  }
}

/* ───────────────────────────────── runs ───────────────────────────────── */

/** A run of this service is being worked on now (or queued to be). */
export function isRunLive(run: Pick<DeclarationRunSummary, 'status'>): boolean {
  return run.status === 'RUNNING' || run.status === 'PENDING';
}

/** The newest run in flight that started recently enough to be real work, or null. */
export function liveRunOf(
  runs: readonly DeclarationRunSummary[],
  now: number,
): DeclarationRunSummary | null {
  let best: DeclarationRunSummary | null = null;
  for (const r of runs) {
    if (!isRunLive(r) || now - new Date(r.startedAt).getTime() >= RUN_LIVE_WINDOW_MS) continue;
    if (!best || r.startedAt > best.startedAt) best = r;
  }
  return best;
}

/** Is a run in flight that started recently enough to be real work. */
export function hasLiveRun(runs: readonly DeclarationRunSummary[], now: number): boolean {
  return liveRunOf(runs, now) !== null;
}

const RUN_STATUS_VIEW: Record<DeclarationRunSummary['status'], { label: string; intent: Intent }> =
  {
    PENDING: { label: 'Queued', intent: 'neutral' },
    RUNNING: { label: 'Running', intent: 'info' },
    SUCCESS: { label: 'Done', intent: 'success' },
    FAILED: { label: 'Failed', intent: 'danger' },
    CANCELLED: { label: 'Cancelled', intent: 'neutral' },
  };

export function runStatusView(status: DeclarationRunSummary['status']): {
  label: string;
  intent: Intent;
} {
  return RUN_STATUS_VIEW[status] ?? { label: String(status).toLowerCase(), intent: 'neutral' };
}

/** What a run was for. A dry run files nothing and says so. */
export function runActionLabel(
  run: Pick<DeclarationRunSummary, 'action' | 'kind' | 'dryRun'>,
): string {
  if (run.action === 'sweep') return 'Today’s round';
  if (run.action === 'check') return 'Read the four pages';
  if (run.action === 'file') {
    const what = run.kind ? kindTitle(run.kind) : 'declaration';
    return run.dryRun ? `Test fill: ${what} (nothing filed)` : `File: ${what}`;
  }
  return String(run.action);
}

/** "manual" / "scheduled" as a sentence-case word. */
export function triggerLabel(trigger: string): string {
  const words = trigger.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '-';
}

/** "50 KB" / "2.4 MB" for a photo chip. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
