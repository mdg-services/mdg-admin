import {
  AlertCircle,
  Archive,
  ClipboardList,
  History,
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
import type { Dealer } from '@dk/shared';

import { CustomRequestTab } from './dealers/CustomRequestTab';
import {
  DealerArchiveDialogs,
  type DealerArchiveAction,
} from './dealers/DealerDangerZone';
import { DealerInfoTab } from './dealers/DealerInfoTab';
import { DealerKavachTab } from './dealers/DealerKavachTab';
import { DealerMembersTab } from './dealers/DealerMembersTab';
import { DealerServicesTab } from './dealers/DealerServicesTab';
import { DealerStaffTab } from './dealers/DealerStaffTab';
import { DealerWorkListTab } from './dealers/DealerWorkListTab';
import { OnboardingTab } from './dealers/OnboardingTab';
import { RunsListInline } from './dealers/RunsListInline';
import { ServicesProvidedTab } from './dealers/ServicesProvidedTab';
import { DealerVaultView } from './dealers/vault/DealerVaultView';

/** Where an entry ends up once every rule below has been applied. */
type TabPlacement = 'strip' | 'menu' | 'hidden';

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
  body: (dealer: Dealer) => React.ReactNode;
}

const ICON = { width: 15, height: 15, strokeWidth: 1.75 } as const;

/** The fallback surface: always available, and where an archived dealer lands. */
const INFO_TAB: TabDef = {
  id: 'info',
  label: 'Info',
  placement: 'strip',
  body: (dealer) => <DealerInfoTab dealer={dealer} />,
};

/**
 * Every dealer surface, and where it belongs.
 *
 * Thirteen tabs was more strip than a phone can show and more choices than the
 * job needs, so the split is by "is this what I opened the dealer to do?":
 *
 * - strip — the daily work: how far onboarding has got, the record itself, the
 *   services it runs, Kavach, its warriors, the work list, the Vault, and the
 *   two report surfaces *when the dealer actually has those services*.
 * - menu — the occasional and the administrative: the team roster, the
 *   services-provided ledger, the run history, the engineer-only custom
 *   requests, and delete/restore. None of it is needed to answer "how is this
 *   dealer doing today?".
 *
 * Demotion is the tool of choice here. `superAdminOnly` is the only thing that
 * takes an entry away from a role, and it is set on internal surfaces only —
 * everything else an admin could reach before this split they can still reach.
 *
 * A tab for a service the dealer has not bought is pure noise, so Credit & DOD
 * and the Daily Sales Report are gated on their plugin actually being attached.
 * Gated off they fall back to the menu for super-admins — who are the ones who
 * attach and debug services — instead of vanishing, and a `?tab=` deep link
 * still renders either of them for anyone: `hidden` here means "not offered",
 * never "unreachable".
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

  const subtitleParts: string[] = [];
  if (dealer.code) subtitleParts.push(dealer.code);
  // Phone is optional now; pushing it unconditionally rendered a dangling
  // "E01 · " when it was absent.
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
          { label: dealer.name ?? dealer.phone ?? dealer.code ?? 'Dealer' },
        ]}
        title={dealer.name ?? 'Unnamed dealer'}
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
          dropped into the page header — the header scrolls away. */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 bg-bg px-4 md:static md:z-auto md:mx-0 md:bg-transparent md:px-0">
        <Tabs
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
      </div>
      {activeDef.body(dealer)}
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
