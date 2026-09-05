import {
  Activity,
  Building2,
  CalendarDays,
  Database,
  FileBarChart2,
  Gauge,
  Headset,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  PartyPopper,
  Plug,
  ScanLine,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  ShieldPlus,
  UserCog,
  Users,
  Zap,
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
  // The AI first line's turn log, and the whole safety case for it: every answer
  // the machine has given a dealer, with a verdict button on each. Deliberately
  // NOT `superAdminOnly` — the people who answer the tickets are the people who
  // can tell whether an answer was any good, and gating it would mean the
  // verdicts came from whoever had the rights rather than whoever had the
  // context. It carries an unreviewed count badge (`AppShell`), because a page
  // nobody is nudged to open is not a safety case.
  { to: '/ai-answers', label: 'AI answers', icon: Zap },
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/dealers', label: 'Dealers', icon: Building2 },
  // The WORK QUEUE is what "Kavach" means to an admin day to day: what has to be
  // verified right now, across every dealer. The per-dealer standing view lives
  // one level down at /kavach/dashboard.
  //
  // `end` matters here and nowhere else in this list: `/kavach` is a PREFIX of
  // `/kavach/dashboard` and `/kavach/defaults`, and a NavLink matches by prefix
  // unless told otherwise — so without it the Kavach tab and the More tab both
  // lit up on the two child routes, and the desktop sidebar highlighted two
  // rows at once.
  { to: '/kavach', label: 'Kavach', icon: ShieldCheck, end: true },
  // Where every dealer stands, and — the only alarm anywhere for OUR backlog —
  // how long since anybody at MDG verified each outlet. It has a route in
  // `App.tsx` but had no link from anywhere, and the admin app is a WebView
  // shell with no address bar: on a phone the screen simply could not be
  // opened. Not in `BOTTOM_TAB_ROUTES`, so it falls into the More sheet.
  { to: '/kavach/dashboard', label: 'Kavach standing', icon: Gauge },
  // Every movement on every dealer's PAD ledger that is not the routine
  // buy-and-pay pair: interest, licence-fee recoveries, participation fees, a
  // card settlement clawed back. All of them silently move the outstanding, and
  // therefore the due amount and the due date, and until this screen existed
  // nobody was told. Deliberately NOT `superAdminOnly` — the person who answers
  // the dealer's call is the person who needs it. Not in `BOTTOM_TAB_ROUTES`
  // either: the bar holds four, so it falls into the More sheet.
  { to: '/ledger-watch', label: 'Ledger watch', icon: ScanLine },
  // Every dealer's collected IRAS shift data in one place — an everyday admin
  // surface, so deliberately NOT `superAdminOnly`.
  { to: '/data-vault', label: 'Data Vault', icon: Database },
  // The generated day-book each dealer receives — an everyday admin outcome
  // surface, so deliberately NOT `superAdminOnly`.
  { to: '/dsr', label: 'Daily Sales Report', icon: FileBarChart2 },
  // Everything the pre-send correctness gate is refusing to send, across every
  // dealer. Deliberately NOT `superAdminOnly` — the endpoint behind it is
  // `requireRole('admin')`, and more to the point a withheld report on an
  // automatic path (the Kavach digest sends on its own schedule with nobody
  // watching) is discovered here or not at all. Not in `BOTTOM_TAB_ROUTES`: the
  // bar holds four, and this is a once-a-day check rather than a working
  // surface, so it falls into the More sheet.
  { to: '/assurance', label: 'Withheld reports', icon: ShieldAlert },
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
