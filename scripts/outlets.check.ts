/**
 * Checks for the words and rules of "one person, several outlets"
 * (`src/lib/outlets.ts`): the Approve dialog's "Add as another outlet of …" and
 * the Members tab's "Also runs …" note.
 *
 * Plain `node:test` checks over the pure module, run through the `tsx` the repo
 * root already carries:
 *
 *   cd mdg-admin && npm run check:outlets
 *
 * which is `npx tsx --test scripts/outlets.check.ts`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { z } from 'zod';

import { approveRegistrationSchema } from '../shared/src/schemas/outletSetup';
import {
  LINK_CHOICE_HINT,
  alsoRunsLine,
  approveBody,
  canApprove,
  joinChoiceHint,
  joinChoiceLabel,
  joinCodes,
  joinedResultLine,
  linkChoiceLabel,
  linkedResultLine,
  type LinkOwner,
} from '../src/lib/outlets';

const owner: LinkOwner = {
  userId: 'a'.repeat(24),
  name: 'Ramesh Kumar',
  dealerId: 'b'.repeat(24),
  code: '15E',
  codes: ['15E', '16E'],
};

describe('joinCodes', () => {
  it('reads like a sentence', () => {
    assert.equal(joinCodes([]), '');
    assert.equal(joinCodes(['16E']), '16E');
    assert.equal(joinCodes(['15E', '16E']), '15E and 16E');
    assert.equal(joinCodes(['9E', '15E', '16E']), '9E, 15E and 16E');
  });
});

describe('alsoRunsLine', () => {
  it('names the other outlets of a person, and nothing for everybody else', () => {
    assert.equal(alsoRunsLine(['16E']), 'Also runs 16E');
    assert.equal(alsoRunsLine(['15E', '16E']), 'Also runs 15E and 16E');
    assert.equal(alsoRunsLine([]), null);
    assert.equal(alsoRunsLine(undefined), null);
  });
});

describe('the tick on the Approve dialog', () => {
  it('names the owner and every outlet they already run', () => {
    assert.equal(linkChoiceLabel(owner), 'Add as another outlet of Ramesh Kumar (15E and 16E)');
    assert.equal(linkChoiceLabel({ ...owner, codes: ['15E'] }), 'Add as another outlet of Ramesh Kumar (15E)');
  });

  it('says what it does to the password, in words an approver can pass on', () => {
    assert.match(LINK_CHOICE_HINT, /same password/);
    assert.match(LINK_CHOICE_HINT, /no temporary one/);
    assert.match(LINK_CHOICE_HINT, /dropped/);
  });

  it('says on the result screen that nothing needs passing on', () => {
    const line = linkedResultLine(owner, '17E');
    assert.match(line, /17E is now another outlet of Ramesh Kumar/);
    assert.match(line, /sign in as before, with the same password/);
    assert.doesNotMatch(line, /temporary/);
  });
});

describe('approveBody', () => {
  // The server takes the shared body plus `linkToUserId` (routes/v1/outletSetup.ts).
  const serverBody = approveRegistrationSchema.extend({ linkToUserId: z.string().regex(/^[a-f0-9]{24}$/i).optional() });

  it('is the code alone for an ordinary registration, and the owner too when ticked', () => {
    assert.deepEqual(approveBody({ code: '16E' }), { code: '16E' });
    assert.deepEqual(approveBody({ code: '16E', linkToUserId: owner.userId }), { code: '16E', linkToUserId: owner.userId });
    assert.deepEqual(approveBody({}), {});
    assert.deepEqual(approveBody({ code: '', linkToUserId: '' }), {});
  });

  it('carries the language of the welcome when there is one, and only then', () => {
    assert.deepEqual(approveBody({ code: '16E', messageLang: 'en' }), { code: '16E', messageLang: 'en' });
    assert.deepEqual(approveBody({ code: '16E', messageLang: 'hi' }), { code: '16E', messageLang: 'hi' });
    assert.deepEqual(approveBody({ code: '16E', messageLang: undefined }), { code: '16E' });
    assert.ok(serverBody.safeParse(approveBody({ code: '16E', messageLang: 'en' })).success);
    // the server refuses any other language, so the dialog can never send one
    assert.equal(serverBody.safeParse({ code: '16E', messageLang: 'fr' }).success, false);
  });

  it('is a body the server accepts', () => {
    assert.ok(serverBody.safeParse(approveBody({ code: '16E' })).success);
    assert.ok(serverBody.safeParse(approveBody({ code: '16E', linkToUserId: owner.userId })).success);
    assert.ok(serverBody.safeParse(approveBody({})).success);
  });
});

describe('canApprove', () => {
  const base = { alreadyClient: false, linking: false, codeValid: true, pending: false };

  it('lets an ordinary registration through on a good code', () => {
    assert.equal(canApprove(base), true);
    assert.equal(canApprove({ ...base, codeValid: false }), false);
    assert.equal(canApprove({ ...base, pending: true }), false);
  });

  it('holds an already-a-client registration unless it is being added to the owner', () => {
    assert.equal(canApprove({ ...base, alreadyClient: true }), false);
    assert.equal(canApprove({ ...base, alreadyClient: true, linking: true }), true);
    assert.equal(canApprove({ ...base, alreadyClient: true, linking: true, codeValid: false }), false);
    assert.equal(canApprove({ ...base, alreadyClient: true, linking: true, pending: true }), false);
  });

  it('lets an already-a-client registration join the outlet it matched, with no code', () => {
    assert.equal(canApprove({ ...base, alreadyClient: true, joining: true, codeValid: false }), true);
    assert.equal(canApprove({ ...base, alreadyClient: true, joining: true, pending: true }), false);
    // Joining means nothing for a registration that is not already a client: it still needs a code.
    assert.equal(canApprove({ ...base, joining: true, codeValid: false }), false);
  });
});

describe('joining an outlet we already serve', () => {
  const join = { dealerId: 'd'.repeat(24), code: '16E', owners: 0 };

  it('sends only the outlet and the language, never a code', () => {
    assert.deepEqual(approveBody({ code: '33E', joinDealerId: join.dealerId, messageLang: 'hi' }), {
      joinDealerId: join.dealerId,
      messageLang: 'hi',
    });
    assert.deepEqual(approveBody({ joinDealerId: join.dealerId }), { joinDealerId: join.dealerId });
  });

  it('is accepted by the server schema, but never together with a link', () => {
    assert.equal(approveRegistrationSchema.safeParse({ joinDealerId: join.dealerId }).success, true);
    assert.equal(
      approveRegistrationSchema.safeParse({ joinDealerId: join.dealerId, linkToUserId: 'e'.repeat(24) }).success,
      false,
    );
  });

  it('says what it opens up and asks for a call first', () => {
    assert.equal(joinChoiceLabel(join), 'Give them an owner login on 16E');
    assert.match(joinChoiceHint(join), /Nobody signs in to it yet/);
    assert.match(joinChoiceHint({ ...join, owners: 2 }), /2 owner logins already/);
    assert.match(joinChoiceHint(join), /no new outlet, no new bill/);
    assert.match(joinChoiceHint(join), /Call the outlet first/);
    assert.match(joinedResultLine('16E'), /owner login on 16E/);
  });
});
