import * as React from 'react';

import {
  NAV_ORDER_STORAGE_KEY,
  isDefaultOrder,
  orderNavItems,
  parseNavOrder,
} from './navOrder';

function readSavedOrder(): string[] | null {
  try {
    return parseNavOrder(window.localStorage.getItem(NAV_ORDER_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * The sidebar's items in the order this browser saved, with the ways to change
 * it. Storage can be off; then a drag still moves the rows for as long as the
 * page is open, and the next visit starts from the default order.
 */
export function useNavOrder<T extends { to: string }>(items: T[]) {
  const [saved, setSaved] = React.useState<string[] | null>(readSavedOrder);

  // Another tab dragged the sidebar: follow it, so two open tabs never disagree.
  React.useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === NAV_ORDER_STORAGE_KEY || e.key === null) setSaved(readSavedOrder());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const ordered = React.useMemo(() => orderNavItems(items, saved), [items, saved]);

  const save = React.useCallback((routes: string[]) => {
    setSaved(routes);
    try {
      window.localStorage.setItem(NAV_ORDER_STORAGE_KEY, JSON.stringify(routes));
    } catch {
      // Not remembered: the order holds until the page is closed.
    }
  }, []);

  const reset = React.useCallback(() => {
    setSaved(null);
    try {
      window.localStorage.removeItem(NAV_ORDER_STORAGE_KEY);
    } catch {
      // Nothing stored to clear.
    }
  }, []);

  const isCustom = !isDefaultOrder(
    ordered.map((i) => i.to),
    items.map((i) => i.to),
  );

  return { items: ordered, save, reset, isCustom };
}
