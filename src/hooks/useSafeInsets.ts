import * as React from 'react';

export interface SafeInsets {
  /** `env(safe-area-inset-top)`, resolved to px. */
  top: number;
  /** `env(safe-area-inset-bottom)`, resolved to px. */
  bottom: number;
  /** Height of the mobile tab bar right now (0 at `≥ md`, 0 on drill-ins). */
  tabBar: number;
  /** `tabBar + bottom` — what a `position: fixed` bottom element must clear. */
  bottomObstruction: number;
}

const ZERO: SafeInsets = { top: 0, bottom: 0, tabBar: 0, bottomObstruction: 0 };

/**
 * Resolve the insets by asking the browser, not by parsing strings.
 *
 * `getComputedStyle(...).getPropertyValue('--safe-bottom')` hands back the
 * custom property's token stream — `env(safe-area-inset-bottom)` or `3.5rem`,
 * not a pixel count. So a throwaway probe carries the same values on real
 * length properties, whose computed values the engine has already resolved to
 * px for us. The probe inherits from `<html>`, which is where `AppShell`
 * publishes `--tab-bar-h`.
 */
function measure(): SafeInsets {
  if (typeof document === 'undefined' || !document.body) return ZERO;
  const probe = document.createElement('div');
  probe.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:0',
    'height:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top,0px)',
    'padding-bottom:env(safe-area-inset-bottom,0px)',
    'margin-top:var(--tab-bar-h,0px)',
  ].join(';');
  document.body.appendChild(probe);
  const style = window.getComputedStyle(probe);
  const top = Number.parseFloat(style.paddingTop) || 0;
  const bottom = Number.parseFloat(style.paddingBottom) || 0;
  const tabBar = Number.parseFloat(style.marginTop) || 0;
  probe.remove();
  return { top, bottom, tabBar, bottomObstruction: tabBar + bottom };
}

/**
 * The pixels a `position: fixed` element has to keep clear at the top and the
 * bottom of a phone screen.
 *
 * Three things make this a hook rather than a constant. The tab bar is 56px on
 * a list screen and **zero** on a drill-in (`/dealers/:id`, an open thread) and
 * at `≥ md`, so nothing bottom-anchored can be placed from a hard-coded number.
 * A `position: fixed` element does not inherit the body's safe-area padding —
 * it resolves against the viewport — so it has to add its own. And the values
 * change under the app: rotating the phone moves the notch, and a route change
 * takes the tab bar away.
 *
 * Prefer the CSS route where one exists: a bottom offset written as a calc()
 * over the two custom properties needs no JavaScript at all. Reach for this
 * hook when the number has to enter a measurement or a style object.
 */
export function useSafeInsets(): SafeInsets {
  const [insets, setInsets] = React.useState<SafeInsets>(ZERO);

  React.useEffect(() => {
    const read = () => {
      const next = measure();
      setInsets((prev) =>
        prev.top === next.top &&
        prev.bottom === next.bottom &&
        prev.tabBar === next.tabBar
          ? prev
          : next,
      );
    };
    read();
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);
    // `--tab-bar-h` is published as an inline style on <html>, and a custom
    // property changing fires no event of its own — watching the attribute is
    // how a route change reaches us.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
    });
    return () => {
      window.removeEventListener('resize', read);
      window.removeEventListener('orientationchange', read);
      observer.disconnect();
    };
  }, []);

  return insets;
}
