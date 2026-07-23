import {
  ChevronDown,
  ChevronLeft,
  LogOut,
  Search,
  Shield,
} from 'lucide-react';
import * as React from 'react';
import {
  matchPath,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import { Input } from '@/components/ui';
import { useBankHolidayPendingQuery } from '@/hooks/api/useBankHolidays';
import { useConversations } from '@/hooks/api/useConversations';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { usePushBridge } from '@/hooks/usePushBridge';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth';

import { MobileTabBar } from './MobileTabBar';
import { NAV_ITEMS, type NavItem } from './navItems';

function NavList({
  items,
  badges,
  onNavigate,
}: {
  items: NavItem[];
  /** Count badge to show next to a nav item, keyed by its route. */
  badges: Record<string, number>;
  onNavigate?: () => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const badge = badges[item.to] ?? 0;
        return (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              onClick={onNavigate}
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
  const admin = useAuthStore((s) => s.admin);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const mineQ = useConversations('mine');
  const unreadCount = (mineQ.data ?? []).filter((c) => c.unreadByAdmin).length;
  const isSuperAdmin = useIsSuperAdmin();
  const navItems = NAV_ITEMS.filter((item) => !item.superAdminOnly || isSuperAdmin);
  // Nav count badges keyed by route: unread chats + unconfirmed national holidays.
  const pendingHolidaysQ = useBankHolidayPendingQuery();
  const navBadges: Record<string, number> = {
    '/inbox': unreadCount,
    '/bank-holidays': pendingHolidaysQ.data?.totalCount ?? 0,
  };

  // A full-screen drill-in: `/dealers/:id` (guarded against the `/dealers` list).
  const isDealerDetail = !!matchPath('/dealers/:id', location.pathname);
  // A thread is open when `?c=<id>` rides on the Inbox URL (§3.1).
  const inThread = location.pathname === '/inbox' && searchParams.has('c');
  // The bottom bar shows on top-level list screens and hides on full-screen
  // drill-ins so chat/detail own the whole viewport (native "push hides tabs").
  const showTabBar = !isDealerDetail && !inThread;

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
      {/* Desktop sidebar (≥ md) — unchanged. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <BrandMark />
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <NavList items={navItems} badges={navBadges} />
        </nav>
        <div className="border-t border-border p-3 text-xs text-text-subtle">v0.1.0</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-surface px-3 md:gap-3 md:px-4">
          {/* Mobile: a back chevron on a drill-in, otherwise the brand. Both md:hidden. */}
          {isDealerDetail ? (
            <button
              type="button"
              aria-label="Back"
              onClick={() => navigate(-1)}
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
          <div className="ml-auto">
            <AdminMenu
              name={admin?.name ?? 'Admin'}
              email={admin?.email ?? ''}
              onLogout={onLogout}
            />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-bg p-4 md:p-6">
          <Outlet />
        </main>
        {showTabBar ? <MobileTabBar className="md:hidden" /> : null}
      </div>
    </div>
  );
}

function AdminMenu({
  name,
  email,
  onLogout,
}: {
  name: string;
  email: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-surface-2 md:min-h-0"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
          {initials || 'A'}
        </span>
        <span className="hidden text-text md:inline">{name}</span>
        <ChevronDown
          width={14}
          height={14}
          strokeWidth={1.75}
          className="text-text-muted"
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-56 rounded-md border border-border bg-surface shadow-md"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="text-sm font-medium text-text">{name}</p>
            {email ? (
              <p className="truncate text-xs text-text-muted">{email}</p>
            ) : null}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-surface-2"
          >
            <LogOut width={14} height={14} strokeWidth={1.75} />
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}
