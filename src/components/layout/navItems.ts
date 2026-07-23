import {
  Activity,
  Building2,
  CalendarDays,
  Database,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Plug,
  ScrollText,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /**
   * Visible only to super-admins (activity log, team management, and the
   * internal run/plugin surfaces). Every entry flagged here must also have its
   * route wrapped in `RequireSuperAdmin` in `App.tsx` — the flag only hides the
   * link, it does not guard the URL.
   */
  superAdminOnly?: boolean;
}

/**
 * The full navigation set, shared by the desktop sidebar (`AppShell`) and the
 * mobile bottom tab bar (`MobileTabBar`). Extracted into its own module so both
 * can import it without a circular dependency.
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/inbox', label: 'Inbox', icon: MessageSquare },
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/dealers', label: 'Dealers', icon: Building2 },
  { to: '/kavach', label: 'Kavach', icon: ShieldCheck },
  // Every dealer's collected IRAS shift data in one place — an everyday admin
  // surface, so deliberately NOT `superAdminOnly`.
  { to: '/data-vault', label: 'Data Vault', icon: Database },
  { to: '/services', label: 'Service Catalog', icon: Plug, superAdminOnly: true },
  { to: '/runs', label: 'Run History', icon: Activity, superAdminOnly: true },
  { to: '/users', label: 'All Users', icon: Users, superAdminOnly: true },
  { to: '/work-list', label: 'Work list', icon: ListChecks, superAdminOnly: true },
  { to: '/bank-holidays', label: 'Bank holidays', icon: CalendarDays, superAdminOnly: true },
  { to: '/activity', label: 'Activity', icon: ScrollText, superAdminOnly: true },
  { to: '/settings/team', label: 'Team', icon: UserCog, superAdminOnly: true },
];

/**
 * Routes pinned to the mobile bottom tab bar, in display order. Everything else
 * in `NAV_ITEMS` falls into the "More" sheet.
 */
export const BOTTOM_TAB_ROUTES = ['/inbox', '/overview', '/dealers', '/kavach'];
