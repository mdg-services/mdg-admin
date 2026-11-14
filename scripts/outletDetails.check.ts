/**
 * Checks for the Pump details form's rules (`src/lib/outletDetails.ts`): the words an
 * answer is shown in, the "Filled by…" line, the suggestion line, which value a save
 * sends, and what a kind this screen has never seen does. The rules work from a
 * question's KIND alone and never name a question, which is what lets the server add
 * one with no admin release; the checks pin that by using questions invented here.
 *
 *   cd mdg-admin && npm run check:outlet-details
 *
 * which is `npx tsx --test scripts/outletDetails.check.ts`. The shared schema and
 * types are imported from source by relative path, as `declarations.check.ts` does,
 * because `@dk/shared` resolves to its compiled `dist/` outside Vite.
 *
 * Every question, outlet and name below is invented. None is from a real outlet.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { saveOutletDetailsSchema } from '../shared/src/schemas/outletDetails';
import {
  OUTLET_DETAIL_KINDS,
  type OutletDetailAnswer,
  type OutletDetailValue,
  type OutletDetailsQuestionView,
  type OutletDetailsView,
} from '../shared/src/types/outletDetails';
import {
  DEFAULT_TEXT_MAX,
  answerWords,
  changedAnswers,
  completionWords,
  completionIntent,
  draftProblems,
  englishWords,
  hasValue,
  hindiUnder,
  initialDraft,
  isDrawnKind,
  optionsFor,
  parseDraft,
  saveBody,
  savedByLine,
  savedOn,
  suggestedLine,
  suggestedWords,
  unansweredCount,
  valueWords,
} from '../src/lib/outletDetails';

const NOW = new Date('2026-11-14T10:00:00.000Z');

const answer = (over: Partial<OutletDetailAnswer> = {}): OutletDetailAnswer => ({
  value: null,
  savedAt: null,
  savedVia: null,
  savedByName: null,
  suggested: null,
  ...over,
});

const answered = (
  value: OutletDetailValue,
  via: 'dealer' | 'admin' = 'dealer',
  over: Partial<OutletDetailAnswer> = {},
): OutletDetailAnswer =>
  answer({ value, savedAt: '2026-11-14T04:30:00.000Z', savedVia: via, ...over });

const STATES = [
  { value: '10', label: { hi: 'बिहार', en: 'Bihar' } },
  { value: '09', label: { hi: 'उत्तर प्रदेश', en: 'Uttar Pradesh' } },
  { value: '06', label: { hi: 'हरियाणा', en: 'Haryana' } },
];

const q = (
  over: Partial<OutletDetailsQuestionView> & Pick<OutletDetailsQuestionView, 'id' | 'kind'>,
): OutletDetailsQuestionView => ({
  label: { hi: 'सवाल', en: 'A question' },
  required: false,
  answer: answer(),
  ...over,
});

const stateQ = (a: Partial<OutletDetailAnswer> | OutletDetailAnswer = {}) =>
  q({
    id: 'where',
    kind: 'state',
    required: true,
    label: { hi: 'पंप किस राज्य में है?', en: 'Which state is the pump in?' },
    options: STATES,
    answer: { ...answer(), ...a },
  });

const view = (
  questions: OutletDetailsQuestionView[],
  over: Partial<OutletDetailsView> = {},
): OutletDetailsView => ({
  title: { hi: 'पंप की जानकारी', en: 'Pump details' },
  intro: { hi: 'थोड़ी जानकारी', en: 'A little about your pump' },
  questions,
  complete: questions.every((x) => !x.required || hasValue(x.answer.value)),
  canEdit: true,
  ...over,
});

describe('the kinds', () => {
  it('draws every kind the shared contract names and nothing else', () => {
    for (const k of OUTLET_DETAIL_KINDS) assert.equal(isDrawnKind(k), true, k);
    assert.equal(isDrawnKind('photo'), false);
    assert.equal(isDrawnKind(''), false);
  });
});

describe('words', () => {
  it('shows the English question and keeps the Hindi one for under it', () => {
    const w = { hi: 'पंप किस राज्य में है?', en: 'Which state is the pump in?' };
    assert.equal(englishWords(w), 'Which state is the pump in?');
    assert.equal(hindiUnder(w), 'पंप किस राज्य में है?');
  });

  it('falls back to the Hindi when the English is missing, and shows nothing twice', () => {
    assert.equal(englishWords({ hi: 'नाम', en: '' }), 'नाम');
    assert.equal(hindiUnder({ hi: 'नाम', en: '' }), null);
    assert.equal(hindiUnder({ hi: '', en: 'Name' }), null);
    assert.equal(hindiUnder(undefined), null);
    assert.equal(englishWords(undefined), '');
  });

  it('puts a state list in the admin alphabet and leaves a choice list in the server order', () => {
    assert.deepEqual(
      optionsFor(stateQ()).map((o) => o.label.en),
      ['Bihar', 'Haryana', 'Uttar Pradesh'],
    );
    const choice = q({ id: 'kind_of', kind: 'choice', options: STATES });
    assert.deepEqual(
      optionsFor(choice).map((o) => o.value),
      ['10', '09', '06'],
    );
    assert.deepEqual(optionsFor(q({ id: 'n', kind: 'number' })), []);
  });
});

describe('an answer in words', () => {
  it('names the state, not its code', () => {
    assert.equal(answerWords(stateQ(answered('10'))), 'Bihar');
  });

  it('keeps the raw value when the server no longer lists it', () => {
    assert.equal(answerWords(stateQ(answered('99'))), '99');
  });

  it('says Yes and No for a yes/no, and counts false as an answer', () => {
    const yn = (v: boolean) => q({ id: 'flag', kind: 'yesno', answer: answered(v) });
    assert.equal(answerWords(yn(true)), 'Yes');
    assert.equal(answerWords(yn(false)), 'No');
  });

  it('counts 0 as an answer and blank text as none', () => {
    assert.equal(answerWords(q({ id: 'n', kind: 'number', answer: answered(0) })), '0');
    assert.equal(answerWords(q({ id: 't', kind: 'text', answer: answered('   ') })), null);
    assert.equal(answerWords(q({ id: 't', kind: 'text', answer: answer() })), null);
  });

  it('writes a day as a label', () => {
    assert.equal(
      answerWords(q({ id: 'd', kind: 'date', answer: answered('2026-02-03') })),
      '3 Feb 2026',
    );
    // Not a real day: shown as it came rather than turned into another day.
    assert.equal(valueWords(q({ id: 'd', kind: 'date' }), '2026-02-31'), '2026-02-31');
  });
});

describe('the suggestion', () => {
  it('shows what MDG holds while the question is unanswered, in generic words', () => {
    const open = stateQ({ suggested: '10' });
    assert.equal(suggestedWords(open), 'Bihar');
    assert.equal(suggestedLine(open), 'Suggested from what we hold: Bihar');
  });

  it('shows nothing once the question is answered, or when nothing is held', () => {
    assert.equal(suggestedLine(stateQ(answered('06', 'dealer', { suggested: '10' }))), null);
    assert.equal(suggestedLine(stateQ({ suggested: null })), null);
    assert.equal(suggestedLine(stateQ({ suggested: '' })), null);
  });

  it('names no question: the same line fits any kind', () => {
    const t = q({ id: 'anything', kind: 'text', answer: answer({ suggested: 'Near the bypass' }) });
    assert.equal(suggestedLine(t), 'Suggested from what we hold: Near the bypass');
  });
});

describe('who filled it, and when', () => {
  it('says the dealer filled it, with the day', () => {
    assert.equal(savedByLine(answered('10'), NOW), 'Filled by the dealer, 14 Nov');
  });

  it('names the admin who filled it for the dealer', () => {
    assert.equal(
      savedByLine(answered('10', 'admin', { savedByName: 'Asha Verma' }), NOW),
      'Filled by MDG (Asha Verma), 14 Nov',
    );
  });

  it('leaves the name out when the server sent none', () => {
    assert.equal(savedByLine(answered('10', 'admin'), NOW), 'Filled by MDG, 14 Nov');
    assert.equal(
      savedByLine(answered('10', 'admin', { savedByName: '  ' }), NOW),
      'Filled by MDG, 14 Nov',
    );
  });

  it('adds the year once it is not this year', () => {
    assert.equal(
      savedByLine(answered('10', 'dealer', { savedAt: '2025-12-30T08:00:00.000Z' }), NOW),
      'Filled by the dealer, 30 Dec 2025',
    );
  });

  it('counts the day in India, not in the laptop’s clock', () => {
    // 20:00 UTC on the 13th is 01:30 on the 14th in India.
    assert.equal(savedOn('2026-11-13T20:00:00.000Z', NOW), '14 Nov');
    assert.equal(savedOn('2026-11-13T18:00:00.000Z', NOW), '13 Nov');
  });

  it('says nothing for an unanswered question, and copes with a missing or broken time', () => {
    assert.equal(savedByLine(answer(), NOW), null);
    assert.equal(savedByLine(answered('10', 'dealer', { savedAt: null }), NOW), 'Filled by the dealer');
    assert.equal(savedByLine(answered('10', 'dealer', { savedAt: 'nonsense' }), NOW), 'Filled by the dealer');
    assert.equal(savedOn(null, NOW), '');
  });

  it('does not claim a saver it was not told', () => {
    assert.equal(savedByLine(answered('10', 'dealer', { savedVia: null }), NOW), 'Saved 14 Nov');
  });
});

describe('the form card summary', () => {
  it('says Answered when the form is complete', () => {
    assert.equal(completionWords(view([stateQ(answered('10'))])), 'Answered');
  });

  it('says how many required questions are open', () => {
    const v = view([
      stateQ(),
      q({ id: 'a', kind: 'text', required: true }),
      q({ id: 'b', kind: 'text', required: false }),
    ]);
    assert.equal(unansweredCount(v), 2);
    assert.equal(completionWords(v), '2 to answer');
    assert.equal(completionWords(view([stateQ()])), '1 to answer');
  });

  it('does not lie when the server says incomplete but no required question is open', () => {
    assert.equal(completionWords(view([q({ id: 'b', kind: 'text' })], { complete: false })), 'Not complete');
  });

  it('does not chase a question we already hold an answer for (the bill-to state)', () => {
    const v = view([stateQ({ suggested: '10' })], { complete: false });
    assert.equal(unansweredCount(v), 0);
    assert.equal(completionWords(v), 'Using what we hold');
    assert.equal(completionIntent(v), 'neutral');
    assert.equal(completionIntent(view([stateQ()], { complete: false })), 'warning');
    assert.equal(completionIntent(view([stateQ(answered('10'))])), 'success');
  });
});

describe('the starting point of the form', () => {
  it('starts from the saved answers', () => {
    const v = view([
      stateQ(answered('10')),
      q({ id: 'yes', kind: 'yesno', answer: answered(false) }),
      q({ id: 'n', kind: 'number', answer: answered(12) }),
    ]);
    assert.deepEqual(initialDraft(v), { where: '10', yes: 'no', n: '12' });
  });

  it('offers the suggestion in an unanswered box, but only if it fits the question', () => {
    const v = view([
      stateQ({ suggested: '06' }),
      q({ id: 'other', kind: 'state', options: STATES, answer: answer({ suggested: '77' }) }),
      q({ id: 'plain', kind: 'text' }),
    ]);
    assert.deepEqual(initialDraft(v), { where: '06', other: '', plain: '' });
  });
});

describe('reading a box', () => {
  it('reads each kind into the value the server takes', () => {
    assert.deepEqual(parseDraft(stateQ(), '10'), { ok: true, value: '10' });
    assert.deepEqual(parseDraft(q({ id: 'f', kind: 'yesno' }), 'yes'), { ok: true, value: true });
    assert.deepEqual(parseDraft(q({ id: 'f', kind: 'yesno' }), 'no'), { ok: true, value: false });
    assert.deepEqual(parseDraft(q({ id: 'n', kind: 'number' }), ' 12.5 '), { ok: true, value: 12.5 });
    assert.deepEqual(parseDraft(q({ id: 'd', kind: 'date' }), '2026-11-14'), { ok: true, value: '2026-11-14' });
    assert.deepEqual(parseDraft(q({ id: 't', kind: 'text' }), '  Near the bypass '), {
      ok: true,
      value: 'Near the bypass',
    });
  });

  it('reads an empty box as no answer', () => {
    for (const kind of OUTLET_DETAIL_KINDS) {
      assert.deepEqual(parseDraft(q({ id: 'x', kind, options: STATES }), '  '), { ok: true, value: null }, kind);
      assert.deepEqual(parseDraft(q({ id: 'x', kind, options: STATES }), undefined), { ok: true, value: null }, kind);
    }
  });

  it('refuses a choice that is not in the list', () => {
    assert.equal(parseDraft(stateQ(), '77').ok, false);
    assert.equal(parseDraft(q({ id: 'c', kind: 'choice' }), 'x').ok, false);
  });

  it('holds a number to its limits, in words', () => {
    const n = q({ id: 'n', kind: 'number', min: 1, max: 20 });
    assert.deepEqual(parseDraft(n, '0'), { ok: false, problem: 'Enter a number from 1 to 20.' });
    assert.deepEqual(parseDraft(n, '21'), { ok: false, problem: 'Enter a number from 1 to 20.' });
    assert.deepEqual(parseDraft(n, '20'), { ok: true, value: 20 });
    assert.deepEqual(parseDraft(q({ id: 'n', kind: 'number', min: 5 }), '4'), { ok: false, problem: 'Enter 5 or more.' });
    assert.deepEqual(parseDraft(q({ id: 'n', kind: 'number', max: 5 }), '6'), { ok: false, problem: 'Enter 5 or less.' });
    assert.deepEqual(parseDraft(n, 'abc'), { ok: false, problem: 'Enter a number.' });
    assert.deepEqual(parseDraft(n, 'Infinity'), { ok: false, problem: 'Enter a number.' });
  });

  it('holds text to its limit, and a day to a real day', () => {
    const t = q({ id: 't', kind: 'text', maxLength: 5 });
    assert.equal(parseDraft(t, 'abcde').ok, true);
    assert.deepEqual(parseDraft(t, 'abcdef'), { ok: false, problem: 'Keep it to 5 characters or fewer.' });
    // With no limit named, the shared schema's own limit applies.
    assert.equal(parseDraft(q({ id: 't', kind: 'text' }), 'x'.repeat(DEFAULT_TEXT_MAX)).ok, true);
    assert.equal(parseDraft(q({ id: 't', kind: 'text' }), 'x'.repeat(DEFAULT_TEXT_MAX + 1)).ok, false);
    assert.equal(parseDraft(q({ id: 'd', kind: 'date' }), '2026-02-31').ok, false);
    assert.equal(parseDraft(q({ id: 'd', kind: 'date' }), '14/11/2026').ok, false);
  });

  it('never edits a kind this screen has never seen', () => {
    const future = q({ id: 'photo_of', kind: 'photo' as never });
    assert.equal(parseDraft(future, 'x').ok, false);
    assert.equal(parseDraft(future, '').ok, true);
  });
});

describe('which value a save sends', () => {
  it('sends only what changed, so an untouched answer is not re-stamped', () => {
    const v = view([
      stateQ(answered('10')),
      q({ id: 'n', kind: 'number', answer: answered(3) }),
      q({ id: 't', kind: 'text' }),
    ]);
    const draft = { ...initialDraft(v), n: '4' };
    assert.deepEqual(changedAnswers(v, draft), { n: 4 });
    assert.deepEqual(saveBody(v, draft), { answers: { n: 4 } });
  });

  it('sends nothing when nothing changed', () => {
    const v = view([stateQ(answered('10'))]);
    assert.equal(saveBody(v, initialDraft(v)), null);
  });

  it('sends the suggestion once it is in the box and the admin saves, as a real answer', () => {
    const v = view([stateQ({ suggested: '10' })]);
    assert.deepEqual(saveBody(v, initialDraft(v)), { answers: { where: '10' } });
  });

  it('sends a typed answer for a question nobody has answered', () => {
    const v = view([stateQ()]);
    assert.deepEqual(saveBody(v, { where: '06' }), { answers: { where: '06' } });
    assert.equal(saveBody(v, { where: '' }), null);
  });

  it('sends false for a No, which is an answer', () => {
    const v = view([q({ id: 'f', kind: 'yesno' })]);
    assert.deepEqual(saveBody(v, { f: 'no' }), { answers: { f: false } });
  });

  it('clears an optional answer with null, and refuses to clear a required one', () => {
    const optional = view([q({ id: 't', kind: 'text', answer: answered('hello') })]);
    assert.deepEqual(saveBody(optional, { t: '' }), { answers: { t: null } });
    const required = view([stateQ(answered('10'))]);
    assert.equal(saveBody(required, { where: '' }), null);
    assert.deepEqual(draftProblems(required, { where: '' }), { where: 'This cannot be left empty.' });
  });

  it('sends nothing at all while any changed box has a problem', () => {
    const v = view([
      q({ id: 'n', kind: 'number', min: 1, max: 5, answer: answered(2) }),
      q({ id: 't', kind: 'text' }),
    ]);
    const draft = { n: '9', t: 'fine' };
    assert.deepEqual(draftProblems(v, draft), { n: 'Enter a number from 1 to 5.' });
    assert.equal(saveBody(v, draft), null);
  });

  it('does not blame the admin for a saved answer the list no longer fits', () => {
    const v = view([stateQ(answered('99'))]);
    assert.deepEqual(draftProblems(v, initialDraft(v)), {});
    assert.equal(saveBody(v, initialDraft(v)), null);
  });

  it('leaves a kind it cannot draw alone', () => {
    const v = view([q({ id: 'photo_of', kind: 'photo' as never, answer: answered('x') })]);
    assert.deepEqual(changedAnswers(v, { photo_of: 'y' }), {});
    assert.deepEqual(draftProblems(v, { photo_of: 'y' }), {});
  });

  it('builds a body the shared save schema accepts', () => {
    const v = view([
      stateQ(),
      q({ id: 'n', kind: 'number' }),
      q({ id: 'f', kind: 'yesno' }),
      q({ id: 'd', kind: 'date' }),
      q({ id: 't', kind: 'text', answer: answered('old') }),
    ]);
    const body = saveBody(v, { where: '10', n: '7', f: 'yes', d: '2026-11-14', t: '' });
    assert.ok(body);
    assert.equal(saveOutletDetailsSchema.safeParse(body).success, true);
    assert.deepEqual(body, { answers: { where: '10', n: 7, f: true, d: '2026-11-14', t: null } });
  });
});
