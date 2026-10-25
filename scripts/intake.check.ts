/**
 * Checks for the decisions behind the Grievances and Registrations pages
 * (`src/lib/intake.ts` and the two pages' `format.ts`), and for the one place
 * the Assistant console's conversation drawer meets them: the grievances filed
 * in a conversation (`src/features/assist/assistFormat.ts`).
 *
 * This app has no test runner, so these are plain `node:test` checks over the
 * pure modules, run through the `tsx` the repo root already carries:
 *
 *   cd mdg-admin && npm run check:intake
 *
 * which is `npx tsx --test scripts/intake.check.ts`.
 *
 * They sit outside `src/` on purpose: the build type-checks `src/`, and a test
 * import there would break a standalone build that has no test types.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  markCallbackCalledSchema,
  markEnrolmentContactedSchema,
  resolveGrievanceSchema,
} from '../shared/src/schemas/websiteIntake';
import { GRIEVANCE_SOURCES, GRIEVANCE_SOURCE_LABELS } from '../shared/src/types/websiteIntake';
import {
  GRIEVANCES_ALL_HREF,
  grievanceFiledLine,
  grievancesOf,
} from '../src/features/assist/assistFormat';
import {
  agoLabel,
  cutShortNote,
  dialHref,
  istStamp,
  mailtoHref,
  phoneLabel,
} from '../src/lib/intake';
import {
  GRIEVANCE_NOTE_MAX,
  GRIEVANCE_NOTE_MIN,
  conversationHref,
  hasEmail,
  languageNote,
  madeWithAssistant,
  noteProblem as grievanceNoteProblem,
  replySubject,
  resolveWarning,
  resolvedLine as grievanceResolvedLine,
} from '../src/pages/grievances/format';
import {
  CALLBACK_NOTE_MAX,
  calledLine,
  chatHref,
  noteProblem as callbackNoteProblem,
  refLine,
  whereLine,
} from '../src/pages/callbacks/format';
import {
  ENROLMENT_NOTE_MAX,
  contactedLine,
  noteProblem as enrolmentNoteProblem,
} from '../src/pages/registrations/format';

describe('dialHref', () => {
  it('sends an Indian mobile out as +91, however it was typed', () => {
    for (const typed of [
      '9876543210',
      '98765 43210',
      '98765-43210',
      '+91 98765 43210',
      '+91-9876543210',
      '919876543210',
      '09876543210',
    ]) {
      assert.equal(dialHref(typed), 'tel:+919876543210', typed);
    }
  });

  it('keeps the plus on a number that is not Indian, and dials the rest as typed', () => {
    assert.equal(dialHref('+44 7911 123456'), 'tel:+447911123456');
    assert.equal(dialHref('1234567890'), 'tel:1234567890');
  });

  it('dials a landline typed with its trunk 0 as +91 as well', () => {
    // 0612 is Patna's STD code; +91 612 2345678 is how it is dialled from anywhere.
    assert.equal(dialHref('0612 2345678'), 'tel:+916122345678');
  });

  it('has nothing to dial when there are no digits', () => {
    // The form's pattern lets ten dashes through.
    assert.equal(dialHref('----------'), null);
  });

  it('never puts anything but digits and a plus into the link', () => {
    assert.match(dialHref('98765 43210 ;rm') ?? '', /^tel:\+?\d+$/);
  });
});

describe('phoneLabel', () => {
  it('groups an Indian mobile as +91 5 and 5', () => {
    assert.equal(phoneLabel('09876543210'), '+91 98765 43210');
    assert.equal(phoneLabel('+91-9876543210'), '+91 98765 43210');
  });

  it('shows anything else as typed, with the spaces tidied', () => {
    assert.equal(phoneLabel('  +44   7911 123456 '), '+44 7911 123456');
  });
});

describe('mailtoHref', () => {
  it('links an ordinary address, with the subject encoded', () => {
    assert.equal(mailtoHref('asha@example.com'), 'mailto:asha@example.com');
    assert.equal(
      mailtoHref('asha@example.com', 'Your grievance G-0007'),
      'mailto:asha@example.com?subject=Your%20grievance%20G-0007',
    );
  });

  it('refuses an address that could add a header, a recipient or a body', () => {
    for (const bad of [
      'a@b.com?bcc=x@y.com',
      'a@b.com&cc=x@y.com',
      'a@b.com,x@y.com',
      'a@b.com;x@y.com',
      'a b@c.com',
      'a@b.com\nBcc: x@y.com',
      'not an email',
      '',
    ]) {
      assert.equal(mailtoHref(bad), null, bad);
    }
  });
});

describe('istStamp', () => {
  const now = Date.parse('2026-10-14T06:00:00Z');

  it('prints India time, not the browser’s', () => {
    // 08:35 UTC is 14:05 in India.
    assert.match(istStamp('2026-10-12T08:35:00Z', now), /^12 Oct,? 14:05$/);
  });

  it('adds the year once it is not this year', () => {
    assert.match(istStamp('2025-03-03T08:35:00Z', now), /^3 Mar,? 2025,? 14:05$/);
  });

  it('prints the hour after midnight as 00, never 24', () => {
    // 18:35 UTC on the 13th is 00:05 on the 14th in India. The 1-24 clock that
    // `hour12: false` selects for en-IN would print "24:05" here.
    assert.match(istStamp('2026-10-13T18:35:00Z', now), /^14 Oct,? 00:05$/);
    assert.match(istStamp('2025-03-02T18:59:00Z', now), /^3 Mar,? 2025,? 00:29$/);
    // And the last minute of the day is still 23:59, not 24:00 or 0:00.
    assert.match(istStamp('2026-10-14T18:29:00Z', now), /^14 Oct,? 23:59$/);
  });

  it('is empty for a missing or unreadable time', () => {
    assert.equal(istStamp(null, now), '');
    assert.equal(istStamp('not a date', now), '');
  });

  it('uses India’s year at the turn of the year, not UTC’s', () => {
    // 20:00 UTC on 31 Dec 2026 is 01:30 on 1 Jan 2027 in India.
    const newYear = Date.parse('2026-12-31T20:00:00Z');
    assert.match(istStamp('2026-12-31T20:00:00Z', newYear), /^1 Jan,? 01:30$/);
  });
});

describe('agoLabel', () => {
  it('says "just now" under a minute, and "ago" after that', () => {
    assert.equal(agoLabel(''), 'just now');
    assert.equal(agoLabel('0m'), 'just now');
    assert.equal(agoLabel('12m'), '12m ago');
    assert.equal(agoLabel('2 days'), '2 days ago');
  });
});

describe('cutShortNote', () => {
  it('says nothing while the list is whole', () => {
    assert.equal(cutShortNote(0, 0), null);
    assert.equal(cutShortNote(57, 57), null);
    assert.equal(cutShortNote(500, 500), null);
  });

  it('names how many of how many once the server has cut the list at 500', () => {
    assert.equal(cutShortNote(500, 514), 'Showing the newest 500 of 514.');
    assert.equal(cutShortNote(500, 1234), 'Showing the newest 500 of 1,234.');
  });
});

describe('the resolving note', () => {
  it('refuses an empty or too-short note, and says why', () => {
    assert.match(grievanceNoteProblem('') ?? '', /Write what was done/);
    assert.match(grievanceNoteProblem('   ') ?? '', /Write what was done/);
    assert.match(grievanceNoteProblem('ok') ?? '', /few more words/);
  });

  it('judges the trimmed text, as the server does', () => {
    assert.equal(grievanceNoteProblem('  called  '), null);
    assert.match(grievanceNoteProblem('x'.repeat(GRIEVANCE_NOTE_MAX + 1)) ?? '', /under 2,000/);
    assert.equal(grievanceNoteProblem('x'.repeat(GRIEVANCE_NOTE_MAX) + '   '), null);
  });

  it('agrees with the schema the server uses, at both edges', () => {
    // If someone changes the limits in @dk/shared this is the check that fails.
    for (const length of [
      0,
      1,
      2,
      GRIEVANCE_NOTE_MIN,
      4,
      GRIEVANCE_NOTE_MAX,
      GRIEVANCE_NOTE_MAX + 1,
    ]) {
      const note = 'x'.repeat(length);
      assert.equal(
        grievanceNoteProblem(note) === null,
        resolveGrievanceSchema.safeParse({ note }).success,
        `length ${length}`,
      );
    }
  });

  it('lets a registration’s note be empty, and agrees with its schema', () => {
    assert.equal(enrolmentNoteProblem(''), null);
    for (const length of [0, 1, ENROLMENT_NOTE_MAX, ENROLMENT_NOTE_MAX + 1]) {
      const note = 'x'.repeat(length);
      assert.equal(
        enrolmentNoteProblem(note) === null,
        markEnrolmentContactedSchema.safeParse({ note }).success,
        `length ${length}`,
      );
    }
  });
});

describe('the row lines', () => {
  const now = Date.parse('2026-10-14T06:00:00Z');

  it('names who closed it and when, leaving out what is not known', () => {
    assert.match(
      grievanceResolvedLine({ resolvedByName: 'Asha', resolvedAt: '2026-10-12T08:35:00Z' }, now),
      /^Resolved by Asha · 12 Oct,? 14:05$/,
    );
    assert.equal(
      grievanceResolvedLine({ resolvedByName: null, resolvedAt: null }, now),
      'Resolved',
    );
    assert.match(
      contactedLine({ contactedByName: 'Ravi', contactedAt: '2026-10-12T08:35:00Z' }, now),
      /^Contacted by Ravi · 12 Oct,? 14:05$/,
    );
    assert.equal(contactedLine({ contactedByName: null, contactedAt: null }, now), 'Contacted');
  });

  it('flags only Hindi, and puts the grievance number on the reply subject', () => {
    assert.equal(languageNote({ lang: 'hi' }), 'Written in Hindi');
    assert.equal(languageNote({ lang: 'en' }), null);
    assert.equal(replySubject({ ref: 'G-0007' }), 'Your grievance G-0007');
  });
});

describe('where a grievance was made', () => {
  it('has a label for every source the shared contract lists', () => {
    // A new source added in @dk/shared without a label would print as its raw id.
    for (const source of GRIEVANCE_SOURCES) {
      assert.ok(GRIEVANCE_SOURCE_LABELS[source], source);
    }
    assert.equal(GRIEVANCE_SOURCE_LABELS['assistant-call'], 'Call with the assistant');
  });

  it('colours the two assistant sources and leaves the website form plain', () => {
    assert.equal(madeWithAssistant({ source: 'assistant-chat' }), true);
    assert.equal(madeWithAssistant({ source: 'assistant-call' }), true);
    assert.equal(madeWithAssistant({ source: 'website' }), false);
    assert.equal(madeWithAssistant({ source: undefined as never }), false);
  });

  it('links a grievance to the conversation it was made in, and only then', () => {
    assert.equal(
      conversationHref({ assistSessionId: '6710f0a1b2c3d4e5f6a7b8c9' }),
      '/assist?session=6710f0a1b2c3d4e5f6a7b8c9',
    );
    // The website form has no conversation, and neither has a row that predates the field.
    assert.equal(conversationHref({ assistSessionId: null }), null);
    assert.equal(conversationHref({ assistSessionId: undefined as never }), null);
    assert.equal(conversationHref({ assistSessionId: '' }), null);
  });

  it('never lets an id add a second query parameter', () => {
    assert.equal(
      conversationHref({ assistSessionId: 'abc&view=x' }),
      '/assist?session=abc%26view%3Dx',
    );
  });
});

describe('telling the person the outcome', () => {
  it('points at phone or email when there is an address', () => {
    assert.equal(
      resolveWarning({ name: 'Ravi', email: 'ravi@example.com' }),
      'Resolving does not email Ravi. Tell them yourself, by phone or email.',
    );
    assert.equal(hasEmail({ email: 'ravi@example.com' }), true);
  });

  it('says plainly that they left no email, and to call the mobile', () => {
    for (const email of [null, '', '   ']) {
      assert.equal(hasEmail({ email }), false, JSON.stringify(email));
      const line = resolveWarning({ name: 'Ravi', email });
      assert.match(line, /left no email/);
      assert.match(line, /call them on the mobile/);
      assert.doesNotMatch(line, /by phone or email/);
    }
  });
});

describe('grievances filed in a conversation', () => {
  it('lists them as the server sent them, and treats a missing list as none', () => {
    const filed = [
      { id: 'a1', ref: 'G-0012', filedAt: '2026-10-12T08:35:00Z' },
      { id: 'a2', ref: 'G-0013', filedAt: '2026-10-12T08:41:00Z' },
    ];
    assert.deepEqual(grievancesOf({ grievances: filed }), filed);
    assert.deepEqual(grievancesOf({ grievances: [] }), []);
    // The console left open across the deploy that added the list.
    assert.deepEqual(grievancesOf({}), []);
    assert.deepEqual(grievancesOf({ grievances: null as never }), []);
  });

  it('prints when it was filed in India time, the way the Grievances page does', () => {
    const now = Date.parse('2026-10-14T06:00:00Z');
    assert.match(
      grievanceFiledLine({ filedAt: '2026-10-12T08:35:00Z' }, now),
      /^Filed 12 Oct,? 14:05$/,
    );
    assert.equal(grievanceFiledLine({ filedAt: 'not a date' }, now), 'Filed');
    assert.equal(grievanceFiledLine({ filedAt: '' }, now), 'Filed');
  });

  it('links to Everything, so a grievance resolved a minute ago is still found', () => {
    assert.equal(GRIEVANCES_ALL_HREF, '/grievances?view=all');
  });
});

describe('the Call-backs page', () => {
  const NOW = Date.parse('2026-10-22T08:00:00Z');
  const base = { ref: null, refSend: null, refLabel: null };

  it('holds the note to the same length the server does', () => {
    assert.equal(callbackNoteProblem('x'.repeat(CALLBACK_NOTE_MAX)), null);
    assert.notEqual(callbackNoteProblem('x'.repeat(CALLBACK_NOTE_MAX + 1)), null);
    assert.equal(callbackNoteProblem(`  ${'x'.repeat(CALLBACK_NOTE_MAX)}  `), null);
    assert.equal(
      markCallbackCalledSchema.safeParse({ note: 'x'.repeat(CALLBACK_NOTE_MAX) }).success,
      true,
    );
    assert.equal(
      markCallbackCalledSchema.safeParse({ note: 'x'.repeat(CALLBACK_NOTE_MAX + 1) }).success,
      false,
    );
  });

  it('says which film page, or just the website', () => {
    assert.equal(whereLine({ source: 'film', film: 'kavach' }), 'Film page · the full film');
    assert.equal(
      whereLine({ source: 'film', film: 'kavach-short' }),
      'Film page · the 40-second film',
    );
    assert.equal(whereLine({ source: 'film', film: null }), 'Film page');
    assert.equal(whereLine({ source: 'website', film: null }), 'Website');
  });

  it('names who the film link went to, the share link, the bare code, or nothing', () => {
    assert.equal(refLine(base, NOW), null);
    const sent = {
      ref: 'Xk3pQ9vT',
      refSend: {
        name: 'Ramesh ji',
        phone: '919800000001',
        sentAt: '2026-10-20T10:00:00Z',
        sameNumber: true,
      },
      refLabel: null,
    };
    assert.match(
      refLine(sent, NOW)!,
      /^From the WhatsApp film message sent to Ramesh ji on 20 Oct/,
    );
    // A call-back is a marketing chat, so it opens in the MDG Services inbox (one inbox per number).
    assert.equal(chatHref(sent), '/whatsapp?line=marketing&chat=919800000001');
    // a forwarded link: the film went to Ramesh, a friend of his is asking
    const forwarded = { ...sent, refSend: { ...sent.refSend, sameNumber: false } };
    assert.match(refLine(forwarded, NOW)!, /^Opened from a link first sent to Ramesh ji/);
    assert.equal(chatHref(forwarded), null);
    assert.equal(
      refLine({ ref: 'grp01', refSend: null, refLabel: 'Kanpur group' }, NOW),
      'From the share link "Kanpur group"',
    );
    assert.equal(refLine({ ...base, ref: 'zzz' }, NOW), 'Link code zzz');
    assert.equal(chatHref(base), null);
  });

  it('says who called and when, leaving out what is not known', () => {
    assert.match(
      calledLine({ calledByName: 'Asha', calledAt: '2026-10-22T07:00:00Z' }, NOW),
      /^Called by Asha · /,
    );
    assert.equal(calledLine({ calledByName: null, calledAt: null }, NOW), 'Called');
  });
});
