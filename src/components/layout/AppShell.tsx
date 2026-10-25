import {
  Bell,
  ChevronDown,
  ChevronLeft,
  GripVertical,
  LogOut,
  Search,
  Shield,
} from 'lucide-react';
import * as React from 'react';
import {
  Link,
  matchPath,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import { Input, Menu, MenuItem } from '@/components/ui';
import { useAlertsLive } from '@/hooks/api/useAdminAlerts';
import { useTicketsLive } from '@/hooks/api/useTickets';
import { useHeldMessagesLive } from '@/hooks/useHeldMessagesLive';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { useLeadsLive } from '@/hooks/useLeadsLive';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNavBadges } from '@/hooks/useNavBadges';
import { useOutletSetupLive } from '@/hooks/useOutletSetupLive';
import { usePushBridge } from '@/hooks/usePushBridge';
import { useSafeBack } from '@/hooks/useSafeBack';
import { useSoftKeyboard } from '@/hooks/useSoftKeyboard';
import { useWebsiteIntakeLive } from '@/hooks/useWebsiteIntakeLive';
import { useWhatsAppLive } from '@/hooks/useWhatsAppLive';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth';

import { ErrorBoundary } from './ErrorBoundary';
import { MobileTabBar } from './MobileTabBar';
import { NAV_ITEMS, type NavItem } from './navItems';
import { moveItem } from './navOrder';
import { useNavOrder } from './useNavOrder';

/**
 * The sidebar's links, each one draggable to a new place (25 Oct 2026). Alt+↑
 * and Alt+↓ move the focused one, for whoever is on the keyboard.
 */
function NavList({
  items,
  badges,
  onNavigate,
  onReorder,
}: {
  items: NavItem[];
  /** Count badge to show next to a nav item, keyed by its route. */
  badges: Record<string, number>;
  onNavigate?: () => void;
  /** The new order of routes, once a row has been dropped in a new place. */
  onReorder: (routes: string[]) => void;
}) {
  const listRef = React.useRef<HTMLUListElement>(null);
  // The row being dragged. A ref as well as state: the state only lands a tick
  // after the drag starts (see `onDragStart`), and the first `dragover` must
  // not miss it. Null means any drag over the list is not ours — a file, a
  // link from another tab — and is left alone.
  const draggingRef = React.useRef<string | null>(null);
  const [dragging, setDragging] = React.useState<string | null>(null);
  // While a row is held, the list is drawn from this so the others make way
  // for it as it passes. Saved on drop; thrown away if the drag is cancelled
  // (Escape, or let go outside the list), which puts every row back.
  const [draft, setDraft] = React.useState<string[] | null>(null);

  const byRoute = new Map(items.map((i) => [i.to, i]));
  const shown = draft
    ? draft.map((r) => byRoute.get(r)).filter((i): i is NavItem => Boolean(i))
    : items;

  // Rows slide to their new place rather than jump: each row's old position
  // is remembered, and one that moved is played from there to here.
  const tops = React.useRef(new Map<string, number>());
  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, number>();
    list.querySelectorAll<HTMLElement>('[data-nav-route]').forEach((row) => {
      const route = row.dataset.navRoute as string;
      next.set(route, row.offsetTop);
      const before = tops.current.get(route);
      if (!still && before !== undefined && before !== row.offsetTop && row.animate) {
        row.animate(
          [{ transform: `translateY(${before - row.offsetTop}px)` }, { transform: 'none' }],
          { duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
        );
      }
    });
    tops.current = next;
  });

  function endDrag() {
    draggingRef.current = null;
    setDragging(null);
    setDraft(null);
  }

  function moveBy(route: string, step: -1 | 1) {
    const routes = items.map((i) => i.to);
    const from = routes.indexOf(route);
    const to = from + step;
    if (to < 0 || to >= routes.length) return;
    onReorder(moveItem(routes, from, to));
    // React may move a different row's node to get there, and a node taken
    // out of the page loses focus — so put it back on the link that moved.
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-nav-route="${route}"] a`)
        ?.focus();
    });
  }

  return (
    <ul
      ref={listRef}
      className="flex flex-col gap-0.5"
      // The 2px gaps between rows count as the list too, or letting go in one
      // reads as a cancelled drag and the row springs back.
      onDragOver={(e) => {
        if (draggingRef.current) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!draggingRef.current) return;
        e.preventDefault();
        if (draft && !draft.every((r, i) => r === items[i]?.to)) onReorder(draft);
        endDrag();
      }}
    >
      {shown.map((item) => {
        const badge = badges[item.to] ?? 0;
        return (
          <li
            key={item.to}
            data-nav-route={item.to}
            draggable
            onDragStart={(e) => {
              draggingRef.current = item.to;
              e.dataTransfer.effectAllowed = 'move';
              // Firefox will not start a drag that carries nothing. Our own
              // type, so dropping it on a page or the address bar does nothing.
              e.dataTransfer.setData('application/x-dk-nav', item.to);
              // A tick later: the browser photographs the row for the drag
              // image after this handler, and it should look like the row,
              // not the faded gap it leaves behind.
              const route = item.to;
              window.setTimeout(() => {
                if (draggingRef.current !== route) return;
                setDragging(route);
                setDraft(items.map((i) => i.to));
              }, 0);
            }}
            onDragOver={(e) => {
              const held = draggingRef.current;
              if (!held) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (held === item.to) return;
              // Every row is the same height, so swapping the held row into
              // this one's place leaves the pointer over the held row and
              // nothing flickers back and forth.
              setDraft((d) => {
                const base = d ?? items.map((i) => i.to);
                return moveItem(base, base.indexOf(held), base.indexOf(item.to));
              });
            }}
            onDragEnd={endDrag}
            onKeyDown={(e) => {
              if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
              e.preventDefault();
              moveBy(item.to, e.key === 'ArrowUp' ? -1 : 1);
            }}
            className={cn('group relative', dragging === item.to && 'opacity-40')}
          >
            {/* Shown on hover only: the sign that a row can be picked up. It
                sits in the row's left padding, so nothing else moves. */}
            <GripVertical
              aria-hidden
              width={12}
              height={12}
              strokeWidth={2}
              className={cn(
                'pointer-events-none absolute left-0.5 top-1/2 -translate-y-1/2 text-text-subtle opacity-0 transition-opacity',
                dragging ? '' : 'group-hover:opacity-100',
              )}
            />
            <NavLink
              to={item.to}
              // Prefix matching is the default, so an item that is a prefix of
              // another route (`/kavach` vs `/kavach/defaults`) lights two rows
              // at once unless it opts out.
              end={item.end ?? item.to === '/'}
              onClick={onNavigate}
              // The row is what gets dragged, not the link: a dragged link
              // carries its address, and dropped on the tab strip it opens.
              draggable={false}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-soft text-brand'
                    : 'text-text-muted hover:bg-surface-2 hover:text-text',
                )
              }
            >
              <item.icon width={18} height={18} strokeWidth={1.75} />
              <span className="flex-1">{item.label}</span>
              {badge > 0 ? (
                <span
                  aria-label={`${badge} pending`}
                  className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-text-inverse"
                >
                  {badge}
                </span>
              ) : null}
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <Shield width={20} height={20} strokeWidth={1.75} className="text-brand" />
      <span className="text-base font-semibold text-text">Dealer Kavach</span>
    </div>
  );
}

export function AppShell() {
  usePushBridge(); // register push token + handle deep links from native
  useAlertsLive(); // keep the bell's count current on every screen
  useTicketsLive(); // ...and the Tickets badge, and any open thread's strip
  useWebsiteIntakeLive(); // ...and the Grievances and Registrations badges
  useOutletSetupLive(); // ...and the Onboarding page, and any open outlet's Setup card
  useHeldMessagesLive(); // ...and the held-message queue, and the held count on each Setup card
  useWhatsAppLive(); // ...and the WhatsApp badge, toasts, sound and tab title
  useLeadsLive(); // ...and the Leads badge, list and open lead
  const admin = useAuthStore((s) => s.admin);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isSuperAdmin = useIsSuperAdmin();
  const visibleItems = React.useMemo(
    () => NAV_ITEMS.filter((item) => !item.superAdminOnly || isSuperAdmin),
    [isSuperAdmin],
  );
  // ...in the order this browser's admin dragged them into.
  const navOrder = useNavOrder(visibleItems);
  // The same counts the phone's tab bar shows — one hook, so they cannot drift.
  const navBadges = useNavBadges();

  // A full-screen drill-in: `/dealers/:id` (guarded against the `/dealers` list).
  const isDealerDetail = !!matchPath('/dealers/:id', location.pathname);
  // A thread is open when `?c=<id>` rides on the Inbox URL (§3.1) — or
  // `?chat=<person>` on the WhatsApp one, which is the same kind of screen:
  // the chat's own header carries Back, and the tab bar and the shell's bar
  // above it would only cost it height.
  const inThread =
    (location.pathname === '/inbox' && searchParams.has('c')) ||
    (location.pathname === '/whatsapp' && searchParams.has('chat'));
  // The bottom bar shows on top-level list screens and hides on full-screen
  // drill-ins so chat/detail own the whole viewport (native "push hides tabs").
  const showTabBar = !isDealerDetail && !inThread;
  // ...and while the on-screen keyboard is up. Navigation cannot be used
  // mid-entry, and on the shift sheet at 360×420 the bar was 65px of the 226px
  // left for the form. It comes back when the field loses focus.
  const keyboardUp = useSoftKeyboard();
  const tabBarVisible = showTabBar && !keyboardUp;

  // Publish the bar's height so anything bottom-anchored can clear it without
  // guessing. It is NOT a constant: 56px on a list screen, zero on a drill-in,
  // and zero at `≥ md` where the bar is `md:hidden`. The Toast viewport reads
  // it in a calc(); `useSafeInsets()` reads it in JavaScript.
  const isDesktop = useMediaQuery('(min-width: 768px)');
  React.useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      '--tab-bar-h',
      tabBarVisible && !isDesktop ? '3.5rem' : '0px',
    );
    return () => {
      root.style.removeProperty('--tab-bar-h');
    };
  }, [tabBarVisible, isDesktop]);

  // Back must not walk out of the app: a push notification can deep-link
  // straight to a dealer, making it the first entry in history.
  const goBack = useSafeBack('/dealers');

  function onLogout() {
    logout();
    navigate('/login');
  }

  return (
    // Fixed-height flex column so the mobile tab bar pins and `main` scrolls
    // between the header and the bar. `h-full` (not `h-screen`) so the body's
    // safe-area-inset-top padding is not double-counted and the bar stays on
    // screen; safe-top = 0 on desktop, so this matches the old desktop height.
    <div className="flex h-full w-full">
      {/* Desktop sidebar (≥ md). Kept narrow (w-52) so data-heavy pages — the
          per-dealer Data Vault's wide ledgers especially — keep their width. */}
      <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <BrandMark />
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <NavList items={navOrder.items} badges={navBadges} onReorder={navOrder.save} />
        </nav>
        <div className="flex items-center border-t border-border p-3 text-xs text-text-subtle">
          <span>v0.1.0</span>
          {navOrder.isCustom ? (
            <button
              type="button"
              onClick={navOrder.reset}
              className="ml-auto rounded px-1 text-text-muted hover:bg-surface-2 hover:text-text"
            >
              Reset order
            </button>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 48px below md, not 56: with the tab bar under it the shell's own
            chrome is 112px of a 740px screen, and on a phone this bar carries
            only the brand mark (or a back chevron) and the account button. Both
            of those are 44px tall, so 48px still holds them. 56px from md up.

            Not at all in an open thread below md: the thread's own header
            carries Back and the conversation's actions, and this bar above it
            was 48px of brand mark — 139px of chrome before the first message,
            with the name of the person being answered cut to fit. One ternary
            rather than `flex` plus `hidden`, because `cn` is clsx and two
            display classes would be settled by stylesheet order. */}
        <header
          className={cn(
            'sticky top-0 z-10 h-12 items-center gap-2 border-b border-border bg-surface px-3 md:h-14 md:gap-3 md:px-4',
            inThread ? 'hidden md:flex' : 'flex',
          )}
        >
          {/* Mobile: a back chevron on a drill-in, otherwise the brand. Both md:hidden. */}
          {isDealerDetail ? (
            <button
              type="button"
              aria-label="Back"
              onClick={goBack}
              className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 md:hidden"
            >
              <ChevronLeft width={22} height={22} strokeWidth={1.75} />
            </button>
          ) : (
            <div className="md:hidden">
              <BrandMark />
            </div>
          )}

          {/* Desktop: search (hidden on mobile — it is a disabled placeholder) */}
          <div className="relative hidden max-w-md flex-1 md:block">
            <Search
              width={16}
              height={16}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
            />
            <Input
              type="search"
              placeholder="Search (coming soon)"
              className="pl-9"
              disabled
            />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <AlertsBell count={navBadges['/alerts'] ?? 0} />
            <AdminMenu
              name={admin?.name ?? 'Admin'}
              email={admin?.email ?? ''}
              onLogout={onLogout}
            />
          </div>
        </header>
        {/* `data-app-scroller` is how `useBodyScrollLock` finds the thing that
            actually scrolls — it is this element, not the body, so the usual
            `body { overflow: hidden }` recipe is a no-op here. On a drill-in
            the tab bar is gone and nothing else carries the bottom safe-area
            inset, so `main` carries it: without this the last row of a dealer
            page sits under the gesture strip.

            `relative` makes `main` the containing block for every absolutely
            positioned thing inside it that has no positioned ancestor of its
            own — the `sr-only` labels, most of all. Without it they resolved
            against the initial containing block, escaped `main`'s overflow
            clip and made the DOCUMENT scrollable: 4,796px on a 740px phone on a
            Daily Sales Report, so a fling past the end of `main` scrolled the
            whole shell away and left a blank screen with the tab bar riding
            up under the header. */}
        <main
          data-app-scroller
          className={cn(
            'relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-bg p-[var(--app-gutter)]',
            !showTabBar &&
              'pb-[calc(var(--app-gutter)+env(safe-area-inset-bottom))]',
          )}
        >
          {/* A second boundary, INSIDE the shell. The outer one in App.tsx sits
              above the shell, so a page that threw took the sidebar, the header,
              the tab bar and the back chevron with it — leaving a phone with a
              "Try again" button and no way to go anywhere else. */}
          <ErrorBoundary
            homeLabel="Go to Inbox"
            onGoHome={() => navigate('/inbox')}
          >
            <Outlet />
          </ErrorBoundary>
        </main>
        {tabBarVisible ? <MobileTabBar className="md:hidden" /> : null}
      </div>
    </div>
  );
}

/**
 * The bell: how many alerts are waiting, on every screen, one tap from the list.
 *
 * In the header rather than the tab bar because the bar is full at four, and a
 * count that lives in the More sheet is a count nobody sees. A link, not a
 * button — it goes somewhere — and its name carries the number, because the
 * badge is the whole message and a screen reader would otherwise miss it.
 */
function AlertsBell({ count }: { count: number }) {
  const label = count > 0 ? `Alerts, ${count} waiting` : 'Alerts';
  return (
    <Link
      to="/alerts"
      aria-label={label}
      title={label}
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text"
    >
      <Bell width={20} height={20} strokeWidth={1.75} />
      {count > 0 ? (
        <span
          aria-hidden
          className="absolute right-1 top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold leading-[18px] text-text-inverse"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The account button in the header: who is signed in, and the way out.
 *
 * It used to be a hand-rolled popover — no bottom sheet on a phone, no Escape,
 * no focus management, dismissal on `mousedown` (which a touch does not fire
 * until the tap resolves), and a ~36px Logout row. `Menu` already does all of
 * that, so this is now just its trigger and one item.
 */
function AdminMenu({
  name,
  email,
  onLogout,
}: {
  name: string;
  email: string;
  onLogout: () => void;
}) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Menu
      label="Account"
      align="end"
      triggerShape="auto"
      trigger={
        <>
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
            {initials || 'A'}
          </span>
          <span className="hidden text-text md:inline">{name}</span>
          <ChevronDown
            width={14}
            height={14}
            strokeWidth={1.75}
            className="text-text-muted"
          />
        </>
      }
    >
      {/* Identity block, not an action — `break-all` because an email has no
          break opportunity at `@` or `.` and would otherwise overflow the
          sheet. */}
      <div className="border-b border-border px-3 pb-2 pt-1">
        <p className="text-sm font-medium text-text">{name}</p>
        {email ? (
          <p className="break-all text-xs text-text-muted">{email}</p>
        ) : null}
      </div>
      <MenuItem
        icon={<LogOut width={14} height={14} strokeWidth={1.75} />}
        onSelect={onLogout}
      >
        Logout
      </MenuItem>
    </Menu>
  );
}
