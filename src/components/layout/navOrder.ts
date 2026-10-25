/**
 * The sidebar's own order, as each admin has dragged it (25 Oct 2026).
 *
 * Kept in the browser, not on the account: it is a desk arrangement, like
 * which inbox was open last, and nothing anyone else sees depends on it. Only
 * routes are stored, so a label or icon change in `NAV_ITEMS` never needs the
 * stored list touched.
 *
 * Pure, so `scripts/navOrder.check.ts` can run it without a browser.
 */

export const NAV_ORDER_STORAGE_KEY = 'dk.nav.order';

/** What the browser stored, as a list of routes; null when it is empty or garbage. */
export function parseNavOrder(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || !value.every((r) => typeof r === 'string')) return null;
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * `items` in the saved order.
 *
 * A route that is saved but no longer exists is dropped. A route that exists
 * but was never saved — a page added after the admin last dragged, or a
 * super-admin page an admin's list never held — goes straight after the item
 * it follows in the default order, so a new page turns up where it was put in
 * the code rather than at the bottom where nobody looks. One with nothing
 * before it goes to the top.
 */
export function orderNavItems<T extends { to: string }>(
  items: readonly T[],
  saved: readonly string[] | null,
): T[] {
  if (!saved || saved.length === 0) return [...items];
  const byRoute = new Map(items.map((item) => [item.to, item]));
  const order: string[] = [];
  for (const route of saved) {
    if (byRoute.has(route) && !order.includes(route)) order.push(route);
  }
  let leading = 0;
  items.forEach((item, k) => {
    if (order.includes(item.to)) return;
    let at = -1;
    for (let p = k - 1; p >= 0 && at === -1; p--) {
      const before = items[p];
      if (before) at = order.indexOf(before.to);
    }
    if (at === -1) order.splice(leading++, 0, item.to);
    else order.splice(at + 1, 0, item.to);
  });
  return order.map((route) => byRoute.get(route) as T);
}

/** `list` with the entry at `from` taken out and put back at `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from === to || from < 0 || from >= next.length) return next;
  // `from` is in range, so exactly one entry comes out.
  const [moved] = next.splice(from, 1) as [T];
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/** True when `routes` is just the default order — nothing to reset. */
export function isDefaultOrder(routes: readonly string[], defaults: readonly string[]): boolean {
  return routes.length === defaults.length && routes.every((r, i) => r === defaults[i]);
}
