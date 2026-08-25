import {
  Activity,
  Building2,
  CalendarDays,
  Database,
  FileBarChart2,
  Headset,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  PartyPopper,
  Plug,
  ScrollText,
  ShieldCheck,
  ShieldPlus,
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
  // The WORK QUEUE is what "Kavach" means to an admin day to day: what has to be
  // verified right now, across every dealer. The per-dealer standing view lives
  // one level down at /kavach/dashboard.
  { to: '/kavach', label: 'Kavach', icon: ShieldCheck },
  // Every dealer's collected IRAS shift data in one place — an everyday admin
  // surface, so deliberately NOT `superAdminOnly`.
  { to: '/data-vault', label: 'Data Vault', icon: Database },
  // The generated day-book each dealer receives — an everyday admin outcome
  // surface, so deliberately NOT `superAdminOnly`.
  { to: '/dsr', label: 'Daily Sales Report', icon: FileBarChart2 },
  // The landing-page assistant's console (ADR 0009). Super-admin only: these
  // are strangers' transcripts and, where they left one, their phone number.
  { to: '/assist', label: 'Assistant', icon: Headset, superAdminOnly: true },
  { to: '/services', label: 'Service Catalog', icon: Plug, superAdminOnly: true },
  { to: '/runs', label: 'Run History', icon: Activity, superAdminOnly: true },
  { to: '/users', label: 'All Users', icon: Users, superAdminOnly: true },
  { to: '/work-list', label: 'Work list', icon: ListChecks, superAdminOnly: true },
  // The global Kavach task catalog. Editing points here moves every dealer who
  // has no override, so it sits with the other super-admin-only defaults.
  { to: '/kavach/defaults', label: 'Kavach defaults', icon: ShieldPlus, superAdminOnly: true },
  { to: '/bank-holidays', label: 'Bank holidays', icon: CalendarDays, superAdminOnly: true },
  { to: '/festival', label: 'Festival greeting', icon: PartyPopper, superAdminOnly: true },
  { to: '/activity', label: 'Activity', icon: ScrollText, superAdminOnly: true },
  { to: '/settings/team', label: 'Team', icon: UserCog, superAdminOnly: true },
];

/**
 * Routes pinned to the mobile bottom tab bar, in display order. Everything else
 * in `NAV_ITEMS` falls into the "More" sheet.
 */
export const BOTTOM_TAB_ROUTES = ['/inbox', '/overview', '/dealers', '/kavach'];
