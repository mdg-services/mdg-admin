import * as React from 'react';

import { useWhatsAppChatLines } from '@/hooks/api/useWhatsAppInbox';
import { WHATSAPP_DEFAULT_LINE, type WhatsAppLine } from '@dk/shared';

import { LINE_STORAGE_KEY, parseLine, pickLine, rememberedLineOf } from './format';

/** The inbox the admin was last in, from the browser's storage; the default one when there is none. */
export function readRememberedLine(): WhatsAppLine {
  try {
    return rememberedLineOf(window.localStorage.getItem(LINE_STORAGE_KEY));
  } catch {
    return WHATSAPP_DEFAULT_LINE;
  }
}

/** Storage can be off; the line is still in the address, so nothing depends on this. */
export function rememberLine(line: WhatsAppLine): void {
  try {
    window.localStorage.setItem(LINE_STORAGE_KEY, line);
  } catch {
    // Not remembered: the admin lands on the default inbox next time.
  }
}

export type InboxLine = { status: 'resolving' } | { status: 'ready'; line: WhatsAppLine };

/**
 * Which inbox the page is in — settled before anything that could send is drawn.
 *
 * The address says it (`?line=`). When it does not — an old alert, lead,
 * results or call-back link carries a person and no number — then:
 *
 * - with a chat in the address, ask which numbers that person is on and take
 *   the one with the most unread, else the newest; if they are on neither, or
 *   the question cannot be answered, the inbox the admin was last in;
 * - with none, the inbox the admin was last in.
 *
 * Whatever is chosen is written back into the address (replacing the entry, so
 * Back does not step through it) and remembered for next time. Until a chat's
 * number is known the answer is `resolving`: the page shows a spinner, never a
 * box a message could be typed in.
 *
 * `replaceLine` is told about the address change and must replace, not push.
 */
export function useInboxLine(
  lineParam: string | null,
  chat: string | null,
  replaceLine: (line: WhatsAppLine) => void,
): InboxLine {
  const fromUrl = parseLine(lineParam);
  // Read on every draw, not once: the page stays mounted while the admin moves
  // between inboxes, and the sidebar's bare "/whatsapp" must land in the one
  // they were last in — not the one the page first opened with.
  const remembered = readRememberedLine();

  const needsLookup = fromUrl === null && chat !== null;
  const lookup = useWhatsAppChatLines(chat, needsLookup);
  const lookupDone = lookup.isSuccess || lookup.isError;

  let line: WhatsAppLine | null = fromUrl;
  if (line === null && chat === null) line = remembered;
  if (line === null && lookupDone) line = pickLine(lookup.data?.lines ?? [], remembered);

  // Put it in the address; the page then reads it back from there.
  React.useEffect(() => {
    if (fromUrl === null && line !== null) replaceLine(line);
  }, [fromUrl, line, replaceLine]);

  React.useEffect(() => {
    if (line !== null) rememberLine(line);
  }, [line]);

  return line === null ? { status: 'resolving' } : { status: 'ready', line };
}
