/**
 * Messages the admin has sent that the server has not yet confirmed — the ones
 * that show a clock — and the ones that did not go.
 *
 * Kept outside React and outside the query cache on purpose. A send keeps
 * running when the admin moves to another chat, and its bubble has to be there
 * when they come back, with the clock, or with the red mark and the reason. A
 * component's own state is gone by then, and a query that nothing fetches is
 * not what the query cache is for.
 *
 * Each chat is its own inbox AND person (`chatKeyOf`): a waiting message
 * belongs to the number it was typed in, and must never show in the same
 * person's chat on the other one.
 *
 * Held in memory only. A message that never got an answer before the page was
 * closed is not something to bring back on the next visit: whether it went is
 * answered by the thread itself, which the server holds.
 */
import * as React from 'react';

import type { WhatsAppLine } from '@dk/shared';

import { chatKeyOf, type PendingMessage } from './format';

const EMPTY: readonly PendingMessage[] = Object.freeze([]);

const byChat = new Map<string, readonly PendingMessage[]>();
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

export function addPending(p: PendingMessage): void {
  const key = chatKeyOf(p.line, p.person);
  byChat.set(key, [...(byChat.get(key) ?? EMPTY), p]);
  emit();
}

export function updatePending(
  line: WhatsAppLine,
  person: string,
  clientId: string,
  patch: Partial<PendingMessage>,
): void {
  const key = chatKeyOf(line, person);
  const list = byChat.get(key);
  if (!list?.some((p) => p.clientId === clientId)) return;
  byChat.set(
    key,
    list.map((p) => (p.clientId === clientId ? { ...p, ...patch } : p)),
  );
  emit();
}

export function removePending(line: WhatsAppLine, person: string, clientId: string): void {
  const key = chatKeyOf(line, person);
  const list = byChat.get(key);
  if (!list?.some((p) => p.clientId === clientId)) return;
  const next = list.filter((p) => p.clientId !== clientId);
  if (next.length === 0) byChat.delete(key);
  else byChat.set(key, next);
  emit();
}

export function getPending(line: WhatsAppLine, person: string, clientId: string): PendingMessage | undefined {
  return byChat.get(chatKeyOf(line, person))?.find((p) => p.clientId === clientId);
}

/** One chat's unconfirmed messages, oldest first. The same array until something changes. */
export function usePending(line: WhatsAppLine | null, person: string | null): readonly PendingMessage[] {
  const get = React.useCallback(
    () => (line && person ? (byChat.get(chatKeyOf(line, person)) ?? EMPTY) : EMPTY),
    [line, person],
  );
  return React.useSyncExternalStore(subscribe, get, () => EMPTY);
}

/**
 * Failed messages of ours that have been sent again, by the id of the failed
 * message. The failed row stays in the chat as it is — the server has no link
 * from it to its replacement — so without this it would keep its "Try again",
 * and every tap on it would send the words once more.
 *
 * Kept here, beside the pending messages, rather than in the open chat's own
 * state: switching to another chat and back mounts the chat afresh, and a
 * message already sent again must not be offered again for that.
 */
let retried: ReadonlySet<string> = new Set();

export function isRetried(messageId: string): boolean {
  return retried.has(messageId);
}

export function markRetried(messageId: string): void {
  if (retried.has(messageId)) return;
  retried = new Set(retried).add(messageId);
  emit();
}

/** Every failed message sent again this visit. The same set until one is added. */
export function useRetried(): ReadonlySet<string> {
  return React.useSyncExternalStore(subscribe, () => retried, () => retried);
}
