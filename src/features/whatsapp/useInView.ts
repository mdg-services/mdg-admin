import * as React from 'react';

/**
 * True from the moment the element comes within `margin` pixels of the screen,
 * and for good after that. For a photo in a chat: nothing is fetched for a
 * picture three screens up, and a picture that has been fetched is never
 * un-fetched by scrolling away from it.
 */
export function useOnceVisible<T extends HTMLElement>(margin = 300): [React.RefObject<T>, boolean] {
  const ref = React.useRef<T>(null);
  const [seen, setSeen] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    // No observer (a very old WebView): treat it as visible rather than never load it.
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: `${margin}px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, margin]);

  return [ref, seen];
}

/**
 * Calls `onReach` whenever the sentinel element is within `margin` pixels of
 * the edge of `rootRef`'s scroll box — for loading the next page of a list as
 * its end approaches, or older messages as the top of a chat does.
 *
 * `active` gates it: no page to ask for, or one already on its way, means the
 * observer is not even created. When a page lands and the sentinel is still in
 * range, the observer is rebuilt and reports again, so a list shorter than the
 * screen keeps loading until it is long enough.
 */
export function useSentinel<T extends HTMLElement>(
  rootRef: React.RefObject<HTMLElement>,
  active: boolean,
  onReach: () => void,
  margin = 300,
): React.RefObject<T> {
  const ref = React.useRef<T>(null);
  const latest = React.useRef(onReach);
  React.useEffect(() => {
    latest.current = onReach;
  });

  React.useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) latest.current();
      },
      { root: rootRef.current, rootMargin: `${margin}px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootRef, active, margin]);

  return ref;
}
