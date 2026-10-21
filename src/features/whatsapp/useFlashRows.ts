import * as React from 'react';

import type { WhatsAppChatSummary } from '@dk/shared';

/** How long a row keeps its tint. The animation itself is 1.4 s; this outlasts it. */
const FLASH_MS = 1600;
/** A chat that is new to the list only counts as "just arrived" at the very top. */
const TOP_ROWS = 10;

/**
 * Which rows have just received a message, so the list can tint them once.
 *
 * A row counts when its newest message is not the one it had last time — a
 * message in, a message out — or when a chat appears at the top that was not
 * there before. Anything else is not news: reading a chat changes its unread
 * count, and loading the next page puts new rows at the bottom, and neither
 * should light up. Switching to another filter or search swaps the whole list;
 * `resetKey` says so, and that swap is taken as the new baseline, not as ten
 * rows' worth of news. `paused` is for the stretch in between, while the old
 * list is still on screen waiting for the new one.
 */
export function useFlashRows(
  chats: readonly WhatsAppChatSummary[],
  resetKey: string,
  paused: boolean,
): ReadonlySet<string> {
  const previous = React.useRef<{ key: string; last: Map<string, string> } | null>(null);
  const timer = React.useRef<number | null>(null);
  const [flashing, setFlashing] = React.useState<ReadonlySet<string>>(() => new Set());

  React.useEffect(() => {
    // While the old list is held up for a new filter, what is on screen is not
    // the new list: forget the baseline, so the list that replaces it is taken
    // as a fresh start and not as a dozen new chats.
    if (paused) {
      previous.current = null;
      return;
    }
    const last = new Map(chats.map((c) => [c.person, c.last.id]));
    const before = previous.current;
    previous.current = { key: resetKey, last };
    // No baseline yet: the first list to arrive is not news. (The page renders
    // once with no chats before the first page lands, which would otherwise
    // read as ten new chats at the top.)
    if (!before || before.key !== resetKey || before.last.size === 0) return;

    const changed = new Set<string>();
    chats.forEach((c, i) => {
      const old = before.last.get(c.person);
      if (old === undefined ? i < TOP_ROWS : old !== c.last.id) changed.add(c.person);
    });
    if (changed.size === 0) return;

    setFlashing(changed);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setFlashing(new Set());
    }, FLASH_MS);
  }, [chats, resetKey, paused]);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return flashing;
}
