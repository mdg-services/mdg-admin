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
 * Held in memory only. A message that never got an answer before the page was
 * closed is not something to bring back on the next visit: whether it went is
 * answered by the thread itself, which the server holds.
 */
import * as React from 'react';

import type { PendingMessage } from './format';

const EMPTY: readonly PendingMessage[] = Object.freeze([]);

const byPerson = new Map<string, readonly PendingMessage[]>();
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
  byPerson.set(p.person, [...(byPerson.get(p.person) ?? EMPTY), p]);
  emit();
}

export function updatePending(person: string, clientId: string, patch: Partial<PendingMessage>): void {
  const list = byPerson.get(person);
  if (!list?.some((p) => p.clientId === clientId)) return;
  byPerson.set(
    person,
    list.map((p) => (p.clientId === clientId ? { ...p, ...patch } : p)),
  );
  emit();
}

export function removePending(person: string, clientId: string): void {
  const list = byPerson.get(person);
  if (!list?.some((p) => p.clientId === clientId)) return;
  const next = list.filter((p) => p.clientId !== clientId);
  if (next.length === 0) byPerson.delete(person);
  else byPerson.set(person, next);
  emit();
}

export function getPending(person: string, clientId: string): PendingMessage | undefined {
  return byPerson.get(person)?.find((p) => p.clientId === clientId);
}

/** One person's unconfirmed messages, oldest first. The same array until something changes. */
export function usePending(person: string | null): readonly PendingMessage[] {
  const get = React.useCallback(() => (person ? (byPerson.get(person) ?? EMPTY) : EMPTY), [person]);
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
