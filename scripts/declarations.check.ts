/**
 * Checks for the Declarations pane's rules
 * (`src/pages/dealers/vault/declarations/format.ts`, ADR 0037): Branded Fuels first,
 * no file button for Branded Fuels ever, a confirm sentence before every outward action
 * (including the two "I checked" buttons and "I filled it"), which buttons are off and
 * why (mirroring the server's own refusals), when "a run is working" is true, and the
 * confirm that stands in front of turning automatic filing on.
 *
 *   cd mdg-admin && npm run check:declarations
 *
 * which is `npx tsx --test scripts/declarations.check.ts`. The shared tables and the
 * schema are imported from source by relative path, as `calibrationClaim.check.ts` does,
 * because `@dk/shared` resolves to its compiled `dist/` outside Vite.
 *
 * Every outlet, date and sentence below is invented. None is from a real outlet.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  declarationsAdminActionSchema,
  declarationsConfigBodySchema,
} from '../shared/src/schemas/declarations';
import {
  DECLARATION_FILED_KINDS,
  DECLARATION_KINDS,
  type DeclarationFiledKind,
  type DeclarationKind,
  type DeclarationRunSummary,
  type DeclarationStatusView,
  type DeclarationsAdminView,
  type WashroomCycleView,
  type WashroomPhotoView,
} from '../shared/src/types/declarations';
import {
  AUTO_SWITCH_KEYS,
  RUN_LIVE_WINDOW_MS,
  actionKey,
  actionWords,
  awaitingAnswer,
  brandedButtons,
  brandedTaskLines,
  fileAction,
  fileGate,
  filedKindOf,
  hasLiveRun,
  liveRunOf,
  orderedStatuses,
  paneRunBusy,
  readFailureLine,
  settleAction,
  showSettle,
  switchOnWords,
  switchTurnedOn,
  washroomGates,
  washroomLine,
} from '../src/pages/dealers/vault/declarations/format';

const NOW = Date.parse('2026-11-12T10:00:00.000Z');
const TODAY = '2026-11-12';
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

const status = (
  kind: DeclarationKind,
  over: Partial<DeclarationStatusView> = {},
): DeclarationStatusView => ({
  kind,
  rule:
    kind === 'safety'
      ? 'daily'
      : kind === 'washroom'
        ? 'weekly'
        : kind === 'standard'
          ? 'once'
          : 'admin',
  portalState: 'open',
  checkedAt: iso(NOW - 5 * MIN),
  lastFiledAt: null,
  lastFiledDay: null,
  lastAttemptAt: null,
  lastOutcome: null,
  lastReply: null,
  lastFailure: null,
  nextDueDay: null,
  due: false,
  auto: false,
  todo: null,
  markedDoneBy: null,
  markedDoneAt: null,
  checkFailure: null,
  checkFailedAt: null,
  pressedAt: null,
  maybeFiled: false,
  ...over,
});

const photo = (slot: 'outside' | 'inside'): WashroomPhotoView => ({
  slot,
  key: `declarations/d1/files/${slot}`,
  filename: `washroom-${slot}.jpg`,
  size: 300_000,
  mime: 'image/jpeg',
  at: iso(NOW - MIN),
  url: null,
});

const cycle = (over: Partial<WashroomCycleView> = {}): WashroomCycleView => ({
  state: 'idle',
  askedAt: null,
  remindersSent: 0,
  photos: [],
  confirmedDay: null,
  sentAt: null,
  failure: null,
  ...over,
});

const run = (over: Partial<DeclarationRunSummary> = {}): DeclarationRunSummary => ({
  id: 'r1',
  action: 'sweep',
  kind: null,
  trigger: 'manual',
  status: 'RUNNING',
  startedAt: iso(NOW - 2 * MIN),
  finishedAt: null,
  summary: null,
  dryRun: false,
  ...over,
});

const view = (over: Partial<DeclarationsAdminView> = {}): DeclarationsAdminView => ({
  dealerId: 'd1',
  active: true,
  screen: 'idle',
  washroom: cycle(),
  lastWashroomFiledDay: null,
  nextWashroomDueDay: null,
  maxPhotoBytes: 500_000,
  statuses: DECLARATION_KINDS.map((k) => status(k)),
  history: [],
  runs: [],
  config: {
    safetyDaily: false,
    washroomEveryDays: 7,
    washroomAuto: false,
    standardAuto: false,
    feedbackText: 'NA',
    placeOfDeclaration: null,
  },
  ...over,
});

/** A view where one kind's status is replaced. */
const withStatus = (
  kind: DeclarationKind,
  over: Partial<DeclarationStatusView>,
  rest: Partial<DeclarationsAdminView> = {},
): DeclarationsAdminView =>
  view({
    ...rest,
    statuses: DECLARATION_KINDS.map((k) => status(k, k === kind ? over : {})),
  });

const BOTH = [photo('outside'), photo('inside')];

describe('the order of the cards', () => {
  it('draws a Branded Fuels task first, and keeps the server order otherwise', () => {
    const statuses = DECLARATION_KINDS.map((k) =>
      status(k, k === 'branded' ? { todo: 'Not filled.' } : {}),
    );
    assert.deepEqual(
      orderedStatuses(statuses).map((s) => s.kind),
      ['branded', 'safety', 'washroom', 'standard'],
    );
  });

  it('leaves Branded Fuels where the server put it when it has no task', () => {
    const statuses = DECLARATION_KINDS.map((k) => status(k));
    assert.deepEqual(
      orderedStatuses(statuses).map((s) => s.kind),
      [...DECLARATION_KINDS],
    );
  });

  it('does not move another kind to the front for having a task', () => {
    const statuses = DECLARATION_KINDS.map((k) =>
      status(k, k === 'standard' ? { todo: 'Look.' } : {}),
    );
    assert.equal(orderedStatuses(statuses)[0]?.kind, 'safety');
  });
});

describe('Branded Fuels never gets a file button', () => {
  it('has no filed kind, so no File now, Test fill or "I checked" action can be built for it', () => {
    assert.equal(filedKindOf('branded'), null);
    assert.equal(fileAction('branded', false), null);
    assert.equal(fileAction('branded', true), null);
    assert.equal(settleAction('branded', true), null);
    assert.equal(settleAction('branded', false), null);
    assert.equal(showSettle(status('branded', { maybeFiled: true })), false);
  });

  it('builds file and settle actions for exactly the kinds the shared list says the robot may file', () => {
    const filed = DECLARATION_KINDS.filter((k) => filedKindOf(k) !== null);
    assert.deepEqual(filed, [...DECLARATION_FILED_KINDS]);
    for (const kind of DECLARATION_FILED_KINDS) {
      for (const dry of [true, false]) {
        const a = fileAction(kind, dry);
        assert.deepEqual(a, { action: 'file', kind, dryRun: dry });
        assert.equal(declarationsAdminActionSchema.safeParse(a).success, true);
      }
      for (const filedYes of [true, false]) {
        const a = settleAction(kind, filedYes);
        assert.equal(a?.action, filedYes ? 'settle_filed' : 'settle_not_filed');
        assert.equal(declarationsAdminActionSchema.safeParse(a).success, true);
      }
    }
  });

  it('is refused by the schema the server uses, if a file action for it were ever sent', () => {
    assert.equal(
      declarationsAdminActionSchema.safeParse({ action: 'file', kind: 'branded' }).success,
      false,
    );
    assert.equal(
      declarationsAdminActionSchema.safeParse({ action: 'settle_filed', kind: 'branded' }).success,
      false,
    );
  });

  it('offers "I filled it" until it is marked or the page says filled, and "Not filled after all" after', () => {
    assert.deepEqual(brandedButtons(status('branded')), { filled: true, undo: false });
    assert.deepEqual(
      brandedButtons(status('branded', { markedDoneAt: iso(NOW), markedDoneBy: 'Asha' })),
      { filled: false, undo: true },
    );
    assert.deepEqual(brandedButtons(status('branded', { portalState: 'filled' })), {
      filled: false,
      undo: false,
    });
  });
});

describe('a confirm before every outward action', () => {
  const outward = [
    { action: 'sweep' },
    { action: 'ask_washroom' },
    { action: 'file', kind: 'safety', dryRun: false },
    { action: 'file', kind: 'washroom', dryRun: false },
    { action: 'file', kind: 'standard', dryRun: false },
    { action: 'file', kind: 'safety', dryRun: true },
    { action: 'file', kind: 'washroom', dryRun: true },
    { action: 'file', kind: 'standard', dryRun: true },
    { action: 'retry_washroom' },
    { action: 'drop_washroom' },
    { action: 'settle_filed', kind: 'safety' },
    { action: 'settle_filed', kind: 'washroom' },
    { action: 'settle_filed', kind: 'standard' },
    { action: 'settle_not_filed', kind: 'safety' },
    { action: 'settle_not_filed', kind: 'washroom' },
    { action: 'settle_not_filed', kind: 'standard' },
    { action: 'mark_branded_done', done: true },
  ] as const;

  it('every one of them is a body the server accepts', () => {
    for (const a of outward) {
      assert.equal(declarationsAdminActionSchema.safeParse(a).success, true, JSON.stringify(a));
    }
  });

  it('asks first, in a sentence with a title and a confirm button, for each', () => {
    for (const a of outward) {
      const words = actionWords(a);
      assert.ok(words.confirm, `no confirm for ${JSON.stringify(a)}`);
      assert.ok(words.confirm.title.trim().length > 10, `title for ${JSON.stringify(a)}`);
      assert.ok(words.confirm.body.trim().length > 40, `body for ${JSON.stringify(a)}`);
      assert.ok(words.confirm.confirm.trim().length > 0);
      assert.ok(words.done.trim().length > 0);
    }
  });

  it('acts at once only where nothing goes outward: reading the pages and undoing a mark', () => {
    assert.equal(actionWords({ action: 'check' }).confirm, null);
    assert.equal(actionWords({ action: 'mark_branded_done', done: false }).confirm, null);
  });

  it('says what the two "I checked" buttons record, and that they send nothing to IndianOil', () => {
    for (const kind of DECLARATION_FILED_KINDS) {
      const yes = actionWords({ action: 'settle_filed', kind }).confirm!;
      const no = actionWords({ action: 'settle_not_filed', kind }).confirm!;
      assert.match(yes.body, /opened IndianOil’s page yourself/);
      assert.match(yes.body, /records it as filed/);
      assert.match(yes.body, /Nothing is sent to IndianOil/);
      assert.match(no.body, /opened IndianOil’s page yourself/);
      assert.match(no.body, /not filed/);
      assert.match(no.body, /sent twice/);
    }
    assert.match(
      actionWords({ action: 'settle_filed', kind: 'washroom' }).confirm!.title,
      /washroom cleanliness/i,
    );
  });

  it('says plainly what "I filled it" records', () => {
    const words = actionWords({ action: 'mark_branded_done', done: true }).confirm!;
    assert.match(words.title, /Branded Fuels/);
    assert.match(words.body, /records your name and the time/);
  });

  it('keeps the same spinner key for two buttons on one card, and a different one per kind', () => {
    const keys = new Set(
      DECLARATION_FILED_KINDS.flatMap((kind) => [
        actionKey({ action: 'settle_filed', kind }),
        actionKey({ action: 'settle_not_filed', kind }),
        actionKey({ action: 'file', kind, dryRun: true }),
        actionKey({ action: 'file', kind, dryRun: false }),
      ]),
    );
    assert.equal(keys.size, 12);
  });
});

describe('when a run is working', () => {
  it('counts a run listed as working that started recently, and nothing else', () => {
    assert.equal(hasLiveRun([run()], NOW), true);
    assert.equal(hasLiveRun([run({ status: 'PENDING' })], NOW), true);
    assert.equal(hasLiveRun([run({ status: 'SUCCESS' })], NOW), false);
    assert.equal(hasLiveRun([run({ status: 'FAILED' })], NOW), false);
    assert.equal(hasLiveRun([], NOW), false);
  });

  it('forgets a run that has said RUNNING for 30 minutes: a dead record, not work', () => {
    assert.equal(hasLiveRun([run({ startedAt: iso(NOW - RUN_LIVE_WINDOW_MS + MIN) })], NOW), true);
    assert.equal(hasLiveRun([run({ startedAt: iso(NOW - RUN_LIVE_WINDOW_MS - MIN) })], NOW), false);
  });

  it('names the newest live run, so a check under way is told from a round', () => {
    const older = run({ id: 'a', action: 'sweep', startedAt: iso(NOW - 10 * MIN) });
    const newer = run({ id: 'b', action: 'check', startedAt: iso(NOW - MIN) });
    assert.equal(liveRunOf([older, newer], NOW)?.id, 'b');
    assert.equal(liveRunOf([newer, older], NOW)?.action, 'check');
  });

  it('keeps the buttons that start a run off for a press on its way or a live run, and on otherwise', () => {
    assert.equal(paneRunBusy(true, [], NOW), true);
    assert.equal(paneRunBusy(false, [run()], NOW), true);
    assert.equal(paneRunBusy(false, [], NOW), false);
  });

  it('does NOT treat a washroom cycle left on "filing" as a run at work', () => {
    // The box was restarted after Submit: the cycle says "filing", the run row is old.
    const stale = view({
      washroom: cycle({ state: 'filing', photos: BOTH }),
      runs: [run({ startedAt: iso(NOW - 3 * 60 * MIN) })],
    });
    assert.equal(paneRunBusy(false, stale.runs, NOW), false);
  });
});

describe('Submit pressed and never answered', () => {
  const pressed = (kind: DeclarationKind, over: Partial<DeclarationStatusView> = {}) =>
    status(kind, {
      pressedAt: iso(NOW - 40 * MIN),
      maybeFiled: true,
      lastOutcome: 'no_reply',
      ...over,
    });

  it('turns File now off for safety and standard, and says to press Check now', () => {
    for (const kind of ['safety', 'standard'] as const) {
      const v = withStatus(kind, pressed(kind));
      const gate = fileGate(kind, v, false, TODAY);
      assert.equal(gate.ok, false, kind);
      assert.match(gate.reason ?? '', /Press Check now/);
      assert.match(gate.reason ?? '', /say how it went/);
    }
  });

  it('keeps a test fill available: it never presses Submit', () => {
    assert.equal(fileGate('safety', withStatus('safety', pressed('safety')), true, TODAY).ok, true);
  });

  it('lets File now back once a read of an empty page has cleared the wait, though the last outcome stays "no answer"', () => {
    const v = withStatus('safety', status('safety', { lastOutcome: 'no_reply', pressedAt: null }));
    assert.equal(fileGate('safety', v, false, TODAY).ok, true);
  });

  it('is still waiting (not yet "maybe filed") while a run could be waiting: pressedAt alone holds File now', () => {
    const v = withStatus(
      'safety',
      status('safety', { pressedAt: iso(NOW - MIN), maybeFiled: false }),
    );
    assert.equal(awaitingAnswer(v.statuses[0]), true);
    assert.equal(fileGate('safety', v, false, TODAY).ok, false);
    assert.equal(showSettle(v.statuses[0]!), false);
  });

  it('shows the two "I checked" buttons only when it is maybe filed, and never for a settled kind', () => {
    assert.equal(showSettle(pressed('safety')), true);
    assert.equal(showSettle(pressed('washroom')), true);
    assert.equal(showSettle(pressed('standard')), true);
    assert.equal(showSettle(status('safety')), false);
  });

  it('keeps Check now and the washroom buttons usable: no run is working, so nothing waits', () => {
    const v = view({
      washroom: cycle({ state: 'filing', photos: BOTH }),
      statuses: DECLARATION_KINDS.map((k) => (k === 'washroom' ? pressed('washroom') : status(k))),
      runs: [run({ status: 'FAILED', startedAt: iso(NOW - 3 * 60 * MIN) })],
    });
    assert.equal(paneRunBusy(false, v.runs, NOW), false);
    // The washroom card says no run is working and what to do.
    assert.match(washroomLine(v, NOW), /no run is working on it now/);
    assert.match(washroomLine(v, NOW), /Press Check now/);
    // File now is off with the unanswered-Submit sentence, not "being filed now".
    const gate = fileGate('washroom', v, false, TODAY);
    assert.equal(gate.ok, false);
    assert.match(gate.reason ?? '', /did not answer/);
  });

  it('does not let Drop photos throw away a Submit that may have gone through', () => {
    const v = view({
      washroom: cycle({ state: 'filing', photos: BOTH }),
      statuses: DECLARATION_KINDS.map((k) => (k === 'washroom' ? pressed('washroom') : status(k))),
    });
    const drop = washroomGates(v, NOW).drop;
    assert.equal(drop.ok, false);
    assert.match(drop.reason ?? '', /Submit was already pressed/);
  });
});

describe('the gates mirror the server', () => {
  it('turns every robot button off, quietly, when the service is not switched on', () => {
    const v = view({ active: false });
    for (const kind of DECLARATION_FILED_KINDS) {
      const gate = fileGate(kind, v, false, TODAY);
      assert.equal(gate.ok, false);
      assert.equal(gate.quiet, true);
    }
    const w = washroomGates(v, NOW);
    assert.equal(w.ask.ok, false);
    assert.equal(w.retry.ok, false);
  });

  it('File now for the safety declaration: on, then off once it is filed today', () => {
    assert.equal(fileGate('safety', view(), false, TODAY).ok, true);
    const filed = withStatus('safety', {
      lastFiledDay: TODAY,
      lastOutcome: 'submitted',
      lastFiledAt: iso(NOW - MIN),
    });
    const gate = fileGate('safety', filed, false, TODAY);
    assert.equal(gate.ok, false);
    assert.match(gate.reason ?? '', /already filed today/);
    // A test fill is allowed any time.
    assert.equal(fileGate('safety', filed, true, TODAY).ok, true);
    // Yesterday's filing does not hold today's.
    assert.equal(
      fileGate(
        'safety',
        withStatus('safety', { lastFiledDay: '2026-11-11', lastOutcome: 'submitted' }),
        false,
        TODAY,
      ).ok,
      true,
    );
  });

  it('File now for the standard form: off when the portal already shows it filled', () => {
    const gate = fileGate(
      'standard',
      withStatus('standard', { portalState: 'filled' }),
      false,
      TODAY,
    );
    assert.equal(gate.ok, false);
    assert.match(gate.reason ?? '', /already filled/);
    assert.equal(fileGate('standard', view(), false, TODAY).ok, true);
  });

  it('File now for the washroom needs both photos, and the owner to have pressed Send', () => {
    const none = fileGate(
      'washroom',
      view({ washroom: cycle({ state: 'collecting' }) }),
      false,
      TODAY,
    );
    assert.equal(none.ok, false);
    assert.match(none.reason ?? '', /Both photos are needed/);
    const one = view({ washroom: cycle({ state: 'collecting', photos: [photo('outside')] }) });
    assert.equal(fileGate('washroom', one, false, TODAY).ok, false);
    const collecting = view({ washroom: cycle({ state: 'collecting', photos: BOTH }) });
    assert.match(
      fileGate('washroom', collecting, false, TODAY).reason ?? '',
      /has not pressed Send/,
    );
    // A test fill only needs the photos.
    assert.equal(fileGate('washroom', collecting, true, TODAY).ok, true);
    const ready = view({ washroom: cycle({ state: 'ready', photos: BOTH }) });
    assert.equal(fileGate('washroom', ready, false, TODAY).ok, true);
    const failed = view({ washroom: cycle({ state: 'failed', photos: BOTH, failure: 'No.' }) });
    assert.match(fileGate('washroom', failed, false, TODAY).reason ?? '', /Retry/);
  });

  it('File now for the washroom is off while it is being filed, with the plain "being filed" words', () => {
    const filing = view({ washroom: cycle({ state: 'filing', photos: BOTH }) });
    const gate = fileGate('washroom', filing, false, TODAY);
    assert.equal(gate.ok, false);
    assert.equal(gate.reason, 'It is being filed now.');
  });

  it('Retry is for a failed filing only; Ask owner is off when the photos are in, being filed or failed', () => {
    assert.equal(
      washroomGates(view({ washroom: cycle({ state: 'failed', photos: BOTH }) }), NOW).retry.ok,
      true,
    );
    assert.equal(washroomGates(view(), NOW).retry.ok, false);
    assert.equal(washroomGates(view(), NOW).ask.ok, true);
    for (const state of ['ready', 'filing', 'failed'] as const) {
      assert.equal(
        washroomGates(view({ washroom: cycle({ state, photos: BOTH }) }), NOW).ask.ok,
        false,
        state,
      );
    }
    assert.equal(
      washroomGates(view({ washroom: cycle({ state: 'collecting' }) }), NOW).ask.ok,
      true,
    );
  });

  it('Drop photos: off when idle (even with photos listed), on while collecting, ready or failed', () => {
    assert.equal(washroomGates(view(), NOW).drop.ok, false);
    assert.match(washroomGates(view(), NOW).drop.reason ?? '', /no photos to drop/);
    assert.equal(
      washroomGates(view({ washroom: cycle({ state: 'idle', photos: BOTH }) }), NOW).drop.ok,
      false,
    );
    for (const state of ['collecting', 'ready', 'failed'] as const) {
      assert.equal(
        washroomGates(view({ washroom: cycle({ state, photos: BOTH }) }), NOW).drop.ok,
        true,
        state,
      );
    }
  });

  it('Drop photos while it is filing: off while a run is working, on when no run is alive (the server frees an old claim)', () => {
    const live = view({
      washroom: cycle({ state: 'filing', photos: BOTH }),
      runs: [run({ action: 'file', kind: 'washroom' })],
    });
    assert.equal(washroomGates(live, NOW).drop.ok, false);
    assert.equal(washroomGates(live, NOW).drop.reason, 'It is being filed now.');
    const dead = view({
      washroom: cycle({ state: 'filing', photos: BOTH }),
      runs: [run({ status: 'FAILED', startedAt: iso(NOW - 3 * 60 * MIN) })],
    });
    assert.equal(washroomGates(dead, NOW).drop.ok, true);
  });
});

describe('the washroom card says only what is true about a run', () => {
  const filing = (runs: DeclarationRunSummary[], over: Partial<DeclarationStatusView> = {}) =>
    view({
      washroom: cycle({ state: 'filing', photos: BOTH }),
      statuses: DECLARATION_KINDS.map((k) => status(k, k === 'washroom' ? over : {})),
      runs,
    });

  it('says a run is filling in the page only while one is listed as working', () => {
    assert.match(washroomLine(filing([run()]), NOW), /A run is filling in IndianOil’s page now/);
    assert.doesNotMatch(
      washroomLine(filing([run({ startedAt: iso(NOW - 2 * 60 * MIN) })]), NOW),
      /A run is filling in/,
    );
  });

  it('says the filing has not finished, and what to do, when no run is listed and nothing was pressed', () => {
    const words = washroomLine(filing([]), NOW);
    assert.match(words, /has not finished/);
    assert.match(words, /press Check now/);
  });
});

describe('what a card says about a page that could not be read', () => {
  it('shows why and when, or nothing', () => {
    assert.equal(readFailureLine(status('branded')), null);
    const line = readFailureLine(
      status('branded', {
        checkFailure: 'The page did not open.',
        checkFailedAt: '2026-11-12T09:00:00.000Z',
      }),
    );
    assert.match(line ?? '', /The page did not open\./);
  });

  it('prints Branded Fuels’ own task words, and adds the fixed instruction only if they lack it', () => {
    assert.deepEqual(brandedTaskLines(status('branded')), []);
    assert.deepEqual(brandedTaskLines(status('safety', { todo: 'Do it.' })), []);

    // The server's words already say to press I filled it: nothing is added.
    const own =
      'MDG could not read the Branded Fuels page (the page did not open), so it is treated as not filled. Look at IndianOil’s page, fill it if it is empty, then press I filled it.';
    assert.deepEqual(brandedTaskLines(status('branded', { todo: own })), [own]);

    // Words that do not: the fixed instruction follows them.
    const lines = brandedTaskLines(status('branded', { todo: 'Not read yet.' }));
    assert.equal(lines.length, 2);
    assert.equal(lines[0], 'Not read yet.');
    assert.match(lines[1] ?? '', /press I filled it/);
  });
});

describe('turning automatic filing on asks first', () => {
  it('asks for the three switches that let MDG file in the outlet’s name, when turned on', () => {
    for (const key of AUTO_SWITCH_KEYS) {
      assert.equal(switchTurnedOn({ [key]: true }), key);
      assert.equal(switchTurnedOn({ [key]: false }), null, `${key} off is one tap`);
    }
  });

  it('does not ask for any other setting', () => {
    assert.equal(switchTurnedOn({ washroomEveryDays: 7 }), null);
    assert.equal(switchTurnedOn({ feedbackText: 'NA' }), null);
    assert.equal(switchTurnedOn({ placeOfDeclaration: null }), null);
    assert.equal(switchTurnedOn({}), null);
  });

  it('uses bodies the server accepts', () => {
    for (const key of AUTO_SWITCH_KEYS) {
      assert.equal(declarationsConfigBodySchema.safeParse({ [key]: true }).success, true);
    }
  });

  it('says for the safety declaration that it is the dealer’s own statement, ticked every day without checking, and that the dealer must have agreed', () => {
    const w = switchOnWords('safetyDaily');
    assert.match(w.body, /dealer’s own signed statement/);
    assert.match(w.body, /Every day/);
    assert.match(w.body, /every box/);
    assert.match(w.body, /without checking any fact/);
    assert.match(w.body, /only if this dealer has agreed/);
    assert.match(w.body, /turn it off again with one tap/);
  });

  it('says the same about who agreed for the washroom and the standard form, and what each does', () => {
    for (const key of ['washroomAuto', 'standardAuto'] as const) {
      const w = switchOnWords(key);
      assert.match(w.body, /in the outlet’s name/);
      assert.match(w.body, /only if this dealer has agreed/);
      assert.ok(w.title.endsWith('?'));
      assert.ok(w.confirm.length > 0);
    }
    assert.match(switchOnWords('standardAuto').body, /cannot be taken back/);
    assert.match(switchOnWords('washroomAuto').body, /both photos/);
  });
});

describe('the words never carry internal terms', () => {
  it('has no codes or jargon in what the new buttons say', () => {
    const texts: string[] = [];
    for (const kind of DECLARATION_FILED_KINDS as readonly DeclarationFiledKind[]) {
      for (const a of [
        { action: 'settle_filed', kind },
        { action: 'settle_not_filed', kind },
      ] as const) {
        const w = actionWords(a);
        texts.push(w.done, w.confirm?.title ?? '', w.confirm?.body ?? '', w.confirm?.confirm ?? '');
      }
    }
    for (const key of AUTO_SWITCH_KEYS) {
      const w = switchOnWords(key);
      texts.push(w.title, w.body, w.confirm);
    }
    for (const text of texts) {
      assert.doesNotMatch(text, /settle_|maybeFiled|pressedAt|no_reply|_/, text);
    }
  });
});
