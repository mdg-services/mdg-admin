import * as React from 'react';

/**
 * Subscribe to a CSS media query and re-render on change. Used to switch between
 * inline (desktop) and overlay (mobile) layouts where CSS alone can't — e.g. the
 * Inbox context panel, which is a flex child on large screens but a slide-over on
 * small ones. SSR-safe (returns false when `window` is absent).
 */
export function useMediaQuery(query: string): boolean {
  const getMatch = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false;

  const [matches, setMatches] = React.useState(getMatch);

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
