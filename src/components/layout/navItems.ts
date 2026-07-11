import {
  Activity,
  Building2,
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
  /** Visible only to super-admins (Activity log, team management). */
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
  { to: '/services', label: 'Service Catalog', icon: Plug },
  { to: '/runs', label: 'Run History', icon: Activity },
  { to: '/users', label: 'All Users', icon: Users, superAdminOnly: true },
  { to: '/work-list', label: 'Work list', icon: ListChecks, superAdminOnly: true },
  { to: '/activity', label: 'Activity', icon: ScrollText, superAdminOnly: true },
  { to: '/settings/team', label: 'Team', icon: UserCog, superAdminOnly: true },
];

/**
 * Routes pinned to the mobile bottom tab bar, in display order. Everything else
 * in `NAV_ITEMS` falls into the "More" sheet.
 */
export const BOTTOM_TAB_ROUTES = ['/inbox', '/overview', '/dealers', '/kavach'];
