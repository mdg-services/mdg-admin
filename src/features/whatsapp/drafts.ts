/**
 * What was being typed in each chat, so moving to another chat does not lose it.
 *
 * The box belongs to the chat: the draft for one person must never end up in
 * another's — and a chat is an inbox AND a person (`chatKeyOf`), so words typed
 * for somebody on one number never turn up in the box for the same somebody on
 * the other. So each chat has its own entry, held in memory for this visit and
 * written to the browser's storage so a reload does not lose it either. The
 * storage part is a convenience and is wrapped as one — in a private window or
 * with site data blocked it simply does not persist.
 *
 * Only the newest few are kept. Drafts are small, but an admin who has answered
 * two thousand leads should not be carrying all of their abandoned half-lines.
 */
import type { WhatsAppLine } from '@dk/shared';

import { chatKeyOf } from './format';

// A draft kept before the two inboxes existed was filed under the bare person.
// Its key is a different shape (no `line:` in front), so it is simply never read
// again — and aged out by the cap below — instead of landing in the wrong number.
const KEY = 'dk.whatsapp.drafts';
const MAX_DRAFTS = 40;

type Drafts = Record<string, { text: string; at: number }>;

let cache: Drafts | null = null;
let timer: number | null = null;

function load(): Drafts {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    cache = parsed && typeof parsed === 'object' ? (parsed as Drafts) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function persist(): void {
  timer = null;
  const drafts = load();
  const keys = Object.keys(drafts);
  if (keys.length > MAX_DRAFTS) {
    keys
      .sort((a, b) => (drafts[b]?.at ?? 0) - (drafts[a]?.at ?? 0))
      .slice(MAX_DRAFTS)
      .forEach((k) => delete drafts[k]);
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(drafts));
  } catch {
    // Storage is full or off: the draft still lives for this visit.
  }
}

// Written a moment after the last keystroke, not on every one, and always
// before the page goes away.
function schedulePersist(): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(persist, 500);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (timer !== null) persist();
  });
}

export function getDraft(line: WhatsAppLine, person: string): string {
  return load()[chatKeyOf(line, person)]?.text ?? '';
}

export function setDraft(line: WhatsAppLine, person: string, text: string): void {
  const drafts = load();
  const key = chatKeyOf(line, person);
  if (text.length === 0) delete drafts[key];
  else drafts[key] = { text, at: Date.now() };
  schedulePersist();
}
