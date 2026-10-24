/**
 * Checks for the words under a voice note (`src/lib/chatTranscript.ts`): when a
 * note shows a transcript, and how `message:transcript` is put on the cached thread.
 *
 *   cd mdg-admin && npm run check:chat-transcript
 *
 * which is `npx tsx --test scripts/chatTranscript.check.ts`. Types come from the
 * shared source by relative path, as the other check scripts do.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Attachment, Message } from '../shared/src/types/conversation';
import { applyTranscript, transcriptOf } from '../src/lib/chatTranscript';

const note = (over: Partial<Attachment> = {}): Attachment => ({
  kind: 'audio',
  storageKey: 'chat/voice-1.webm',
  filename: 'voice-1.webm',
  contentType: 'audio/webm',
  size: 40_000,
  durationMs: 12_000,
  ...over,
});

const message = (id: string, attachments: Attachment[]): Message =>
  ({
    id,
    conversationId: 'c1',
    senderId: 'u1',
    senderRole: 'dealer-owner',
    attachments,
    createdAt: '2026-10-24T08:00:00.000Z',
  }) as Message;

const event = (over: Partial<Parameters<typeof applyTranscript>[1]> = {}) => ({
  conversationId: 'c1',
  messageId: 'm1',
  storageKey: 'chat/voice-1.webm',
  transcript: 'DSR kab aayega',
  ...over,
});

describe('the words under a voice note', () => {
  it('shows them only for a voice note that has some', () => {
    assert.equal(transcriptOf(note({ transcript: 'DSR kab aayega' })), 'DSR kab aayega');
    assert.equal(transcriptOf(note({ transcript: '  DSR kab aayega \n' })), 'DSR kab aayega');
    assert.equal(transcriptOf(note()), null);
    assert.equal(transcriptOf(note({ transcript: '   ' })), null);
    // a picture never shows words, whatever the field says
    assert.equal(transcriptOf(note({ kind: 'image', transcript: 'x' })), null);
  });
});

describe('putting the words on the thread the admin has open', () => {
  it('sets the transcript on the voice note the event names, and leaves everything else alone', () => {
    const other = message('m2', [note({ storageKey: 'chat/voice-2.webm' })]);
    const target = message('m1', [note(), note({ kind: 'image', storageKey: 'chat/pic.jpg' })]);
    const pages = [[other], [target]];
    const next = applyTranscript(pages, event());
    assert.notEqual(next, pages);
    assert.equal(next[1]![0]!.attachments[0]!.transcript, 'DSR kab aayega');
    // the picture beside it and the other message are the same objects
    assert.equal(next[1]![0]!.attachments[1], target.attachments[1]);
    assert.equal(next[0]![0], other);
    // nothing was changed in place
    assert.equal(target.attachments[0]!.transcript, undefined);
  });

  it('answers the same pages for a repeat, a stranger message, a missing note or no words', () => {
    const pages = [[message('m1', [note({ transcript: 'DSR kab aayega' })])]];
    assert.equal(applyTranscript(pages, event()), pages);
    assert.equal(applyTranscript(pages, event({ messageId: 'nope' })), pages);
    assert.equal(applyTranscript(pages, event({ storageKey: 'chat/other.webm' })), pages);
    assert.equal(applyTranscript(pages, event({ transcript: '   ' })), pages);
  });

  it('never writes words on an attachment that is not a voice note', () => {
    const pages = [[message('m1', [note({ kind: 'image' })])]];
    assert.equal(applyTranscript(pages, event()), pages);
  });
});
