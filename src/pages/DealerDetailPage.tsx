import {
  AlertCircle,
  Archive,
  ClipboardList,
  History,
  KeyRound,
  ListChecks,
  RotateCcw,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import * as React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  Menu,
  MenuItem,
  MenuSeparator,
  Skeleton,
  StatusChip,
  Tabs,
} from '@/components/ui';
import { useDealerQuery } from '@/hooks/api/useDealers';
import { useDealerServicesQuery } from '@/hooks/api/useDealerServices';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { retryImport } from '@/lib/retryImport';
import { dealerCodeLabel, type Dealer } from '@dk/shared';

import {
  DealerArchiveDialogs,
  type DealerArchiveAction,
} from './dealers/DealerDangerZone';

/**
 * Every tab body is loaded on demand, and only the one on screen.
 *
 * Thirteen static imports meant opening ANY dealer downloaded all thirteen
 * surfaces — the JSON-schema config form stack behind Services included, which
 * is ~300 kB raw / 84 kB brotli of ajv, lodash and @rjsf on its own. Only one
 * body ever renders (see `activeDef.body` below), so the other twelve were
 * bytes nobody asked for, paid for over a mid-range phone's connection.
 *
 * Named exports, hence the `.then` unwrap: `React.lazy` wants a module whose
 * `default` is the component.
 *
 * The `lazy()` calls MUST stay at module scope. Creating one inside the render
 * would hand React a brand-new component type on every render, which remounts
 * the tab — losing its scroll position, its form state and its in-flight
 * queries — instead of re-rendering it.
 */
const CustomRequestTab = React.lazy(
  retryImport(() =>
    import('./dealers/CustomRequestTab').then((m) => ({
      default: m.CustomRequestTab,
    })),
  ),
);
const DealerInfoTab = React.lazy(
  retryImport(() =>
    import('./dealers/DealerInfoTab').then((m) => ({ default: m.DealerInfoTab })),
  ),
);
const DealerKavachTab = React.lazy(
  retryImport(() =>
    import('./dealers/DealerKavachTab').then((m) => ({
      default: m.DealerKavachTab,
    })),
  ),
);
const DealerKavachWorkListTab = React.lazy(
  retryImport(() =>
    import('./dealers/DealerKavachWorkListTab').then((m) => ({
      default: m.DealerKavachWorkListTab,
    })),
  ),
);
const DealerMembersTab = React.lazy(
  retryImport(() =>
    import('./dealers/DealerMembersTab').then((m) => ({
      default: m.DealerMembersTab,
    })),
  ),
);
const DealerPasswordVaultTab = React.lazy(
  retryImport(() =>
    import('./dealers/DealerPasswordVaultTab').then((m) => ({
      default: m.DealerPasswordVaultTab,
    })),
  ),
);
const DealerServicesTab = React.lazy(
  retryImport(() =>
    import('./dealers/DealerServicesTab').then((m) => ({
      default: m.DealerServicesTab,
    })),
  ),
);
const DealerStaffTab = React.lazy(
  retryImport(() =>
    import('./dealers/DealerStaffTab').then((m) => ({
      default: m.DealerStaffTab,
    })),
  ),
);
const DealerWorkListTab = React.lazy(
  retryImport(() =>
    import('./dealers/DealerWorkListTab').then((m) => ({
      default: m.DealerWorkListTab,
    })),
  ),
);
const OnboardingTab = React.lazy(
  retryImport(() =>
    import('./dealers/OnboardingTab').then((m) => ({ default: m.OnboardingTab })),
  ),
);
const RunsListInline = React.lazy(
  retryImport(() =>
    import('./dealers/RunsListInline').then((m) => ({
      default: m.RunsListInline,
    })),
  ),
);
const ServicesProvidedTab = React.lazy(
  retryImport(() =>
    import('./dealers/ServicesProvidedTab').then((m) => ({
      default: m.ServicesProvidedTab,
    })),
  ),
);
const DealerVaultView = React.lazy(
  retryImport(() =>
    import('./dealers/vault/DealerVaultView').then((m) => ({
      default: m.DealerVaultView,
    })),
  ),
);

/** Where an entry ends up once every rule below has been applied. */
type TabPlacement = 'strip' | 'menu' | 'hidden';

/** What a tab body can ask the page to do. */
interface TabContext {
  /** Switch to another tab, as if its entry had been clicked. */
  goToTab: (id: string) => void;
}

interface TabDef {
  id: string;
  label: string;
  /** Home for this entry when nothing demotes it. */
  placement: Exclude<TabPlacement, 'hidden'>;
  /** Internal/engineer surface — hidden from plain admins. */
  superAdminOnly?: boolean;
  /** Strip only while the dealer is still onboarding; the menu once it is live. */
  onboardingOnly?: boolean;
  /** Service plugin that must be attached before this surface earns a tab. */
  requiresService?: string;
  /** Leading glyph, used when the entry renders in the overflow menu. */
  icon?: React.ReactNode;
  body: (dealer: Dealer, ctx: TabContext) => React.ReactNode;
}

const ICON = { width: 15, height: 15, strokeWidth: 1.75 } as const;

/** Referenced from the Info tab's pointer as well as from the entry itself. */
const PASSWORDS_TAB_ID = 'passwords';

/** The fallback surface: always available, and where an archived dealer lands. */
const INFO_TAB: TabDef = {
  id: 'info',
  label: 'Info',
  placement: 'strip',
  body: (dealer, ctx) => (
    <DealerInfoTab
      dealer={dealer}
      onOpenPasswordVault={() => ctx.goToTab(PASSWORDS_TAB_ID)}
    />
  ),
};

/**
 * Every dealer surface, and where it belongs.
 *
 * Thirteen tabs was more strip than a phone can show and more choices than the
 * job needs, so the split is by "is this what I opened the dealer to do?":
 *
 * - strip — the daily work: how far onboarding has got, the record itself, the
 *   services it runs, Kavach, its warriors, the work list, and the Data Vault.
 * - menu — the occasional and the administrative: the Password vault, the team
 *   roster, the services-provided ledger, the run history, the engineer-only
 *   custom requests, and delete/restore. None of it is needed to answer "how is
 *   this dealer doing today?".
 *
 * Demotion is the tool of choice here. `superAdminOnly` is the only thing that
 * takes an entry away from a role, and it is set on internal surfaces only —
 * everything else an admin could reach before this split they can still reach.
 *
 * `requiresService` gates an entry on a service plugin actually being attached:
 * a tab for a service the dealer has not bought is pure noise. No entry uses it
 * today — Credit & DOD and the Daily Sales Report moved into the Data Vault
 * rail, where `vault/datasets.ts` does the same gating per dataset — but the
 * three-way handling in `placementOf` is what makes it safe, so it stays. Note
 * what it means: `hidden` is "not offered", never "unreachable" — a `?tab=`
 * deep link still renders the body, which guards itself.
 */
const TABS: TabDef[] = [
  {
    id: 'onboarding',
    label: 'Onboarding',
    placement: 'strip',
    // Once the dealer is ACTIVE this is a completed checklist, not a task —
    // worth keeping for the record, not worth a permanent slot in the strip.
    onboardingOnly: true,
    icon: <ListChecks {...ICON} />,
    body: (dealer) => <OnboardingTab dealer={dealer} />,
  },
  INFO_TAB,
  {
    id: 'services',
    label: 'Services',
    placement: 'strip',
    body: (dealer) => <DealerServicesTab dealer={dealer} />,
  },
  {
    id: 'kavach',
    label: 'Kavach',
    placement: 'strip',
    body: (dealer) => <DealerKavachTab dealer={dealer} />,
  },
  {
    // Which Kavach tasks this outlet actually has: hide the ones that do not
    // apply, add ones only they have, and depart from the global points where
    // there is a reason to. Sits beside the Kavach panel, not inside it, so the
    // standing view stays a standing view.
    id: 'kavach-work-list',
    label: 'Kavach tasks',
    placement: 'strip',
    body: (dealer) => <DealerKavachWorkListTab dealer={dealer} />,
  },
  {
    id: 'staff',
    label: 'Warriors & points',
    placement: 'strip',
    body: (dealer) => <DealerStaffTab dealer={dealer} />,
  },
  {
    id: 'work-list',
    label: 'Work list',
    placement: 'strip',
    body: (dealer) => <DealerWorkListTab dealer={dealer} />,
  },
  {
    id: 'data-vault',
    label: 'Data Vault',
    placement: 'strip',
    // A sidebar of datasets scoped to this dealer — the per-dealer mirror of the
    // cross-dealer Vault. Credit & DOD and the Daily Sales Report live INSIDE this
    // rail now (as gated datasets) rather than as their own tabs, alongside IRAS
    // shift data, the PAD ledger and Inspection Reports.
    body: (dealer) => <DealerVaultView dealer={dealer} />,
  },
  {
    id: PASSWORDS_TAB_ID,
    label: 'Password vault',
    placement: 'menu',
    // Deliberately NOT superAdminOnly. Every login this dealer has lives here —
    // their app sign-in and the IRAS/SDMS portal credentials — and reading a
    // stored portal password back is ordinary support work, not an engineer's
    // errand. The backend gates it to admins, caps it per person per hour and
    // audits every reveal before releasing the plaintext.
    icon: <KeyRound {...ICON} />,
    body: (dealer) => <DealerPasswordVaultTab dealer={dealer} />,
  },
  {
    id: 'members',
    label: 'Team',
    placement: 'menu',
    icon: <Users {...ICON} />,
    body: (dealer) => <DealerMembersTab dealer={dealer} />,
  },
  {
    id: 'provided',
    label: 'Services provided',
    placement: 'menu',
    icon: <ClipboardList {...ICON} />,
    body: (dealer) => <ServicesProvidedTab dealer={dealer} />,
  },
  {
    id: 'runs',
    label: 'Run history',
    placement: 'menu',
    // Deliberately NOT superAdminOnly: the backend allows any admin to list a
    // dealer's runs, and the standalone /runs page is super-admin-only, so this
    // tab is a plain admin's only way to see whether last night's automation
    // ran. Moving it into the menu is a layout call; taking it away is not.
    icon: <History {...ICON} />,
    body: (dealer) => <RunsListInline dealerId={dealer.id} />,
  },
  {
    id: 'custom',
    label: 'Custom requests',
    placement: 'menu',
    superAdminOnly: true,
    icon: <Send {...ICON} />,
    body: (dealer) => <CustomRequestTab dealer={dealer} />,
  },
];

// Deep links are validated against every tab, not just the offered ones, so a
// super-admin's `?tab=custom` link survives the /auth/me window and `?tab=dsr`
// survives the dealer-services fetch. Placement is applied below, and each
// gated tab guards its own body.
const TAB_IDS = TABS.map((t) => t.id);

function tabById(id: string): TabDef | undefined {
  return TABS.find((t) => t.id === id);
}

export function DealerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSuperAdmin = useIsSuperAdmin();
  const { data: dealer, isLoading, isError, error } = useDealerQuery(id);
  // Drives the service gating below. Shares its query key with the Services tab,
  // so on a warm cache this is a read rather than another round trip.
  const servicesQ = useDealerServicesQuery(id);
  const [tab, setTab] = React.useState<string | null>(null);
  const [dangerAction, setDangerAction] =
    React.useState<DealerArchiveAction | null>(null);
  // Stable, so a tab body that memoises on it does not re-render on every
  // parent render. `setTab` is itself stable, hence the empty dep list.
  const tabContext = React.useMemo<TabContext>(
    () => ({ goToTab: (id) => setTab(id) }),
    [],
  );

  React.useEffect(() => {
    if (!dealer || tab) return;
    const requested = searchParams.get('tab');
    // Credit & DOD and the Daily Sales Report moved from their own tabs into the
    // Data Vault rail. Keep old `?tab=credit-dod` / `?tab=dsr` links working by
    // landing on the Data Vault tab with that dataset selected.
    if (requested === 'credit-dod' || requested === 'dsr') {
      setTab('data-vault');
      setSearchParams(
        (cur) => {
          const next = new URLSearchParams(cur);
          next.set('tab', 'data-vault');
          next.set('vault', requested);
          return next;
        },
        { replace: true },
      );
      return;
    }
    if (requested && TAB_IDS.includes(requested)) {
      setTab(requested);
      return;
    }
    setTab(dealer.status === 'ACTIVE' ? 'info' : 'onboarding');
  }, [dealer, tab, searchParams, setSearchParams]);

  if (isLoading) {
    return (
      <div>
        <Skeleton className="mb-4 h-8 w-48" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (isError || !dealer) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Dealer not found"
        description={(error as Error | undefined)?.message ?? 'The requested dealer could not be loaded.'}
      />
    );
  }

  // The code is the title now, so it is not repeated here.
  const subtitleParts: string[] = [];
  // Phone is optional; pushing it unconditionally rendered a dangling " · ".
  if (dealer.phone) subtitleParts.push(dealer.phone);
  if (dealer.pumpLocation?.address) subtitleParts.push(dealer.pumpLocation.address);

  const isArchived = !!dealer.archivedAt;
  const isOnboarding = dealer.status !== 'ACTIVE';

  // `null` until the query has actually *succeeded* — deliberately keyed on
  // `isSuccess` rather than on `data`, because those two differ exactly where it
  // matters: on the error path. See the three-way branch in `placementOf`.
  const attachedServiceIds = servicesQ.isSuccess
    ? new Set(servicesQ.data.map((s) => s.serviceId))
    : null;

  function placementOf(t: TabDef): TabPlacement {
    // An archived dealer is read-only: every mutating endpoint 409s or 404s, and
    // its credential/onboarding sub-resources 404 outright, which would render
    // the other tabs as dead or, worse, as empty "not set up yet" states.
    // Collapse to Info, which is where Restore lives.
    if (isArchived) return t.id === INFO_TAB.id ? 'strip' : 'hidden';
    if (t.superAdminOnly && !isSuperAdmin) return 'hidden';
    // Three states, and all three have to be told apart. Collapsing them to
    // "truthy data or not" is what let a failed GET /dealers/:id/services
    // silently delete the Credit & DOD tab — the only route to that surface in
    // the whole app — with no error, no empty state and no hint anything went
    // wrong.
    if (t.requiresService) {
      if (attachedServiceIds) {
        // Answered: no plugin, no tab. Super-admins keep it in the menu because
        // they are the ones who attach and debug services.
        if (!attachedServiceIds.has(t.requiresService)) {
          return isSuperAdmin ? 'menu' : 'hidden';
        }
      } else if (!servicesQ.isError) {
        // Still in flight: withhold, so a gated tab can only ever appear once
        // the answer is in and never gets pulled back out from under a tapping
        // finger.
        return 'hidden';
      }
      // Failed (queryClient retries once, so a 500 or a timeout gives up fast):
      // "we could not ask" is not "not attached". Fall through to the declared
      // placement — an offered tab whose body explains itself beats a capability
      // that vanishes without a word. The bodies already degrade gracefully: the
      // generate cards say the service isn't attached yet, and the history and
      // ledger they sit next to exist independently of the attachment anyway.
    }
    if (t.onboardingOnly && !isOnboarding) return 'menu';
    return t.placement;
  }

  const defaultTabId = isOnboarding ? 'onboarding' : INFO_TAB.id;
  // Falling back rather than rendering nothing: an unknown id, or an id whose
  // def has gone away, resolves to Info instead of an empty page.
  const activeDef =
    tabById(isArchived ? INFO_TAB.id : (tab ?? defaultTabId)) ?? INFO_TAB;
  const activeTab = activeDef.id;
  const activePlacement = placementOf(activeDef);

  const stripTabs = TABS.filter((t) => placementOf(t) === 'strip');
  const menuTabs = TABS.filter((t) => placementOf(t) === 'menu');
  // Whatever is on screen has to be represented somewhere. A deep link into a
  // gated-off surface — or a service detached while its tab is open — would
  // otherwise leave the strip with nothing selected and the reader with no
  // signpost to what they are looking at.
  //
  // Except when the gate was the role gate. Promoting a `superAdminOnly` tab
  // here would advertise an internal surface in a plain admin's menu — and keep
  // advertising it for the rest of the session, since they could navigate away
  // and click straight back in — which is precisely what that flag exists to
  // prevent. A deep link still renders its body (which guards itself); it just
  // does not earn a permanent entry in the navigation.
  const activeIsRoleGated = !!activeDef.superAdminOnly && !isSuperAdmin;
  const menuEntries =
    activePlacement === 'hidden' && !activeIsRoleGated
      ? [...menuTabs, activeDef]
      : menuTabs;
  const hasMenu = menuEntries.length > 0 || isSuperAdmin;
  // Drives both the tint and the trigger's accessible name below. Derived from
  // the entries actually rendered rather than from `activePlacement`, so the
  // one case where the active tab is hidden *and* not promoted (above) does not
  // claim the menu holds it.
  const activeInMenu = menuEntries.includes(activeDef);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Dealers', to: '/dealers' },
          { label: dealerCodeLabel(dealer.code) },
        ]}
        title={dealerCodeLabel(dealer.code)}
        subtitle={subtitleParts.join(' · ')}
        actions={
          <div className="flex items-center gap-2">
            {dealer.archivedAt ? <Badge intent="danger">Deleted</Badge> : null}
            <StatusChip kind="dealer" value={dealer.status} />
          </div>
        }
      />
      {isArchived ? (
        <Card className="mb-4 border-danger/40 bg-danger-soft/40">
          <CardContent className="flex items-start gap-3">
            <Archive
              width={18}
              height={18}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-danger"
            />
            <div>
              <p className="text-sm font-semibold text-text">This dealer is deleted</p>
              <p className="text-sm text-text-muted">
                Its services are paused and its team cannot sign in. Nothing was
                destroyed — restore it below to make changes again.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {/* Sticky (mobile) so the tab strip stays reachable while a long tab body
          scrolls; static at ≥ md (desktop unchanged). The overflow menu rides
          along with it, which is why it is pinned to the strip rather than
          dropped into the page header — the header scrolls away.

          `sticky` is the primitive's own prop, not a wrapper: the strip has to
          be opaque, has to bleed past the page gutter, and has to use the
          `stick-top` offset rather than `top-0` — a sticky offset resolves
          against the scrollport inset by `main`'s gutter, so `top-0` parks the
          strip one gutter BELOW the header and lets the page scroll through the
          band between them, which is the reported "gap between the header and
          the navbar". Keeping all three in `Tabs` means no caller can get one
          of them wrong. */}
      <Tabs
        className="mb-3 md:mb-4"
        sticky
        items={stripTabs.map((t) => ({ id: t.id, label: t.label }))}
        value={activeTab}
        onChange={setTab}
        trailing={
          <>
            {/* The fade hints that the strip scrolls to more tabs. `right-full`
                parks it immediately left of the menu button, so it sits at the
                edge of the scrolling area whether or not that button renders. */}
            <div className="pointer-events-none absolute inset-y-0 right-full w-6 bg-gradient-to-l from-bg md:hidden" />
            {hasMenu ? (
              <Menu
                // When the surface on screen lives in here the strip has no
                // selected tab, so the trigger has to say where you are. The
                // tint says it visually; the name says it to a screen reader
                // and to anyone the tint is invisible to. Inside the menu the
                // entry itself carries `aria-current` and a check glyph.
                label={
                  activeInMenu
                    ? `More dealer options — showing ${activeDef.label}`
                    : 'More dealer options'
                }
                title="More"
                triggerClassName={
                  activeInMenu
                    ? 'bg-brand-soft text-brand hover:bg-brand-soft hover:text-brand'
                    : undefined
                }
              >
                {menuEntries.map((t) => (
                  <MenuItem
                    key={t.id}
                    icon={t.icon}
                    selected={t.id === activeTab}
                    onSelect={() => setTab(t.id)}
                  >
                    {t.label}
                  </MenuItem>
                ))}
                {isSuperAdmin ? (
                  <>
                    {menuEntries.length > 0 ? <MenuSeparator /> : null}
                    <MenuItem
                      danger={!isArchived}
                      icon={
                        isArchived ? (
                          <RotateCcw {...ICON} />
                        ) : (
                          <Trash2 {...ICON} />
                        )
                      }
                      onSelect={() =>
                        setDangerAction(isArchived ? 'restore' : 'archive')
                      }
                    >
                      {isArchived ? 'Restore dealer' : 'Delete dealer'}
                    </MenuItem>
                  </>
                ) : null}
              </Menu>
            ) : null}
          </>
        }
      />
      {/* The boundary for the lazily-loaded tab bodies above. `key`ed on the
          tab: when an already-revealed boundary suspends again, React keeps the
          previous children mounted and merely hides them, so switching tabs
          would leave the tab you just left running its queries and effects
          behind a skeleton. A new key retires it outright. Once a tab's chunk
          is in memory `React.lazy` resolves synchronously, so a second visit
          never flashes the skeleton at all. */}
      <React.Suspense key={activeTab} fallback={<TabBodySkeleton />}>
        {activeDef.body(dealer, tabContext)}
      </React.Suspense>
      {/* Delete/restore straight from the menu. The Info tab's danger-zone card
          drives the same component with its own state, so the archive flow has
          one implementation and the two entry points cannot disagree. */}
      {isSuperAdmin ? (
        <DealerArchiveDialogs
          dealer={dealer}
          action={dangerAction}
          onClose={() => setDangerAction(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Stands in while a tab body's chunk arrives.
 *
 * Shaped like a tab body — a heading bar over a card — rather than a spinner,
 * so the page keeps its height and the strip above it does not jump as the
 * chunk lands. Every tab opens onto something roughly this size.
 */
function TabBodySkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
