import {
  Activity,
  Building2,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plug,
  ScrollText,
  Search,
  Shield,
  ShieldCheck,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { Input } from '@/components/ui';
import { useConversations } from '@/hooks/api/useConversations';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth';

const NAV_ITEMS: Array<{
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Visible only to super-admins (Activity log, team management). */
  superAdminOnly?: boolean;
}> = [
  { to: '/inbox', label: 'Inbox', icon: MessageSquare },
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/dealers', label: 'Dealers', icon: Building2 },
  { to: '/kavach', label: 'Kavach', icon: ShieldCheck },
  { to: '/services', label: 'Service Catalog', icon: Plug },
  { to: '/runs', label: 'Run History', icon: Activity },
  { to: '/users', label: 'All Users', icon: Users, superAdminOnly: true },
  { to: '/activity', label: 'Activity', icon: ScrollText, superAdminOnly: true },
  { to: '/settings/team', label: 'Team', icon: UserCog, superAdminOnly: true },
];

type NavItem = (typeof NAV_ITEMS)[number];

function NavList({
  items,
  unreadCount,
  onNavigate,
}: {
  items: NavItem[];
  unreadCount: number;
  onNavigate?: () => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
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
            {item.to === '/inbox' && unreadCount > 0 ? (
              <span
                aria-label={`${unreadCount} unread`}
                className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-text-inverse"
              >
                {unreadCount}
              </span>
            ) : null}
          </NavLink>
        </li>
      ))}
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
  const admin = useAuthStore((s) => s.admin);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const mineQ = useConversations('mine');
  const unreadCount = (mineQ.data ?? []).filter((c) => c.unreadByAdmin).length;
  const isSuperAdmin = useIsSuperAdmin();
  const navItems = NAV_ITEMS.filter((item) => !item.superAdminOnly || isSuperAdmin);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  function onLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex h-full min-h-screen w-full">
      {/* Desktop sidebar (≥ md) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <BrandMark />
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <NavList items={navItems} unreadCount={unreadCount} />
        </nav>
        <div className="border-t border-border p-3 text-xs text-text-subtle">v0.1.0</div>
      </aside>

      {/* Mobile nav drawer (< md) */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col border-r border-border bg-surface shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <BrandMark />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-2"
              >
                <X width={18} height={18} strokeWidth={1.75} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3">
              <NavList
                items={navItems}
                unreadCount={unreadCount}
                onNavigate={() => setMobileNavOpen(false)}
              />
            </nav>
            <div className="border-t border-border p-3 text-xs text-text-subtle">
              v0.1.0
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-surface px-3 md:gap-3 md:px-4">
          {/* Mobile: hamburger + brand (the sidebar is hidden < md) */}
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 md:hidden"
          >
            <Menu width={20} height={20} strokeWidth={1.75} />
          </button>
          <div className="md:hidden">
            <BrandMark />
          </div>

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
        <main className="flex-1 overflow-x-hidden bg-bg p-4 md:p-6">
          <Outlet />
        </main>
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
        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-surface-2"
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
