/**
 * Words pushed INTO a WhatsApp chat's reply box from outside it — today, a draft
 * from the Reply helper's "Put in reply box" (ADR 0025); the box tags every one
 * as the helper's.
 *
 * WHY A STORE AND NOT A PROP. The helper lives in the page's side panel and the
 * box (`ReplyComposer`) is deep in `ChatPane`, not even mounted in six states
 * (loading, sending switched off, the chat blocked…). A prop would have to be
 * threaded through those branches and would be lost when the box mounts after
 * the press. A module store keyed by the chat reaches the box whenever it
 * is there, and costs the rest of `ChatPane` nothing. It has the shape of
 * `pendingStore.ts` for the same reason: `useSyncExternalStore`, one entry per
 * chat, and a snapshot that is the same object until something changes.
 *
 * KEYED BY THE CHAT (`chatKeyOf`: the inbox AND the person). Words written for
 * somebody on one number must never turn up in the box for the same somebody on
 * the other, or for anyone else.
 *
 * AN INSERT HAS A SEQUENCE NUMBER, not just text, so pressing "Use this" on the
 * same draft twice puts it in twice; an effect keyed on the string would do
 * nothing the second time and look broken. The box remembers the number it has
 * already applied, and starts from the CURRENT one when it mounts: an insert
 * made before the box existed is already in the saved draft (see
 * `insertIntoComposer`), and applying it again would put it in twice.
 *
 * It also records which boxes are mounted, so the helper can tell the admin
 * truthfully whether the words went into a box they can see or were saved for
 * the box to show when it opens.
 *
 * Held in memory only. The text lives on in `drafts.ts` (the saved draft) the
 * moment it is used; this store only carries the "a new one just arrived" signal.
 */
import * as React from 'react';

import { appendToBox } from '@/lib/replyHelper';
import type { WhatsAppLine } from '@dk/shared';

import { getDraft, markHelperDraft, setDraft } from './drafts';
import { chatKeyOf } from './format';

export interface ComposerInsertRequest {
  /** Grows by one for every request on this chat, from 1. */
  seq: number;
  text: string;
}

const NONE: ComposerInsertRequest = Object.freeze({ seq: 0, text: '' });

const byChat = new Map<string, ComposerInsertRequest>();
const mounted = new Map<string, number>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Put `text` in this chat's reply box. Returns where it went: `'box'` when a box
 * is open for the chat, `'saved'` when there is none and the words were kept as
 * the chat's draft for the box to show when it opens.
 *
 * The saved draft is written in BOTH cases, with the same words the box will
 * end up holding: a box that mounts later reads it, and an open box writes the
 * very same value through its own `change()`.
 */
export function insertIntoComposer(line: WhatsAppLine, person: string, text: string): 'box' | 'saved' {
  const key = chatKeyOf(line, person);
  const add = text.trim();
  if (!add) return mounted.has(key) ? 'box' : 'saved';
  setDraft(line, person, appendToBox(getDraft(line, person), add));
  markHelperDraft(line, person, true);
  byChat.set(key, { seq: (byChat.get(key)?.seq ?? 0) + 1, text: add });
  emit();
  return mounted.has(key) ? 'box' : 'saved';
}

/** The latest insert request for one chat. The same object until a new one arrives. */
export function useComposerInsert(line: WhatsAppLine, person: string): ComposerInsertRequest {
  const key = chatKeyOf(line, person);
  const get = React.useCallback(() => byChat.get(key) ?? NONE, [key]);
  return React.useSyncExternalStore(subscribe, get, () => NONE);
}

/**
 * Register a mounted reply box for this chat while the caller is mounted. A
 * count, not a flag: two boxes for one chat (a remount before the old one's
 * cleanup has run) must not make the second one's mount look like the first's
 * unmount.
 */
export function useComposerPresence(line: WhatsAppLine, person: string): void {
  const key = chatKeyOf(line, person);
  React.useEffect(() => {
    mounted.set(key, (mounted.get(key) ?? 0) + 1);
    return () => {
      const n = (mounted.get(key) ?? 1) - 1;
      if (n <= 0) mounted.delete(key);
      else mounted.set(key, n);
    };
  }, [key]);
}

/** The request number the chat is on right now, read once by a box as it mounts. */
export function currentInsertSeq(line: WhatsAppLine, person: string): number {
  return byChat.get(chatKeyOf(line, person))?.seq ?? 0;
}
