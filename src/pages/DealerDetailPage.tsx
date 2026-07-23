import { AlertCircle } from 'lucide-react';
import * as React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState, Skeleton, StatusChip, Tabs } from '@/components/ui';
import { useDealerQuery } from '@/hooks/api/useDealers';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';

import { CustomRequestTab } from './dealers/CustomRequestTab';
import { DealerCreditDodTab } from './dealers/DealerCreditDodTab';
import { DealerDataVaultTab } from './dealers/DealerDataVaultTab';
import { DealerInfoTab } from './dealers/DealerInfoTab';
import { DealerKavachTab } from './dealers/DealerKavachTab';
import { DealerMembersTab } from './dealers/DealerMembersTab';
import { DealerServicesTab } from './dealers/DealerServicesTab';
import { DealerStaffTab } from './dealers/DealerStaffTab';
import { DealerWorkListTab } from './dealers/DealerWorkListTab';
import { OnboardingTab } from './dealers/OnboardingTab';
import { RunsListInline } from './dealers/RunsListInline';
import { ServicesProvidedTab } from './dealers/ServicesProvidedTab';

interface TabDef {
  id: string;
  label: string;
  /** Internal/engineer surface — hidden from plain admins. */
  superAdminOnly?: boolean;
}

const TABS: TabDef[] = [
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'info', label: 'Info' },
  { id: 'members', label: 'Team' },
  { id: 'services', label: 'Services' },
  { id: 'kavach', label: 'Kavach' },
  { id: 'staff', label: 'Warriors & points' },
  { id: 'work-list', label: 'Work list' },
  { id: 'provided', label: 'Services provided' },
  { id: 'credit-dod', label: 'Credit & DOD' },
  { id: 'data-vault', label: 'Data Vault' },
  { id: 'runs', label: 'Run history' },
  { id: 'custom', label: 'Custom requests', superAdminOnly: true },
];

// Deep links are validated against every tab, not just the visible ones, so a
// super-admin's `?tab=custom` link survives the /auth/me window. Visibility is
// applied to the strip below, and each gated tab guards its own body.
const TAB_IDS = TABS.map((t) => t.id);

export function DealerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isSuperAdmin = useIsSuperAdmin();
  const { data: dealer, isLoading, isError, error } = useDealerQuery(id);
  const [tab, setTab] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!dealer || tab) return;
    const requested = searchParams.get('tab');
    if (requested && TAB_IDS.includes(requested)) {
      setTab(requested);
      return;
    }
    setTab(dealer.status === 'ACTIVE' ? 'info' : 'onboarding');
  }, [dealer, tab, searchParams]);

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
  subtitleParts.push(dealer.phone);
  if (dealer.pumpLocation?.address) subtitleParts.push(dealer.pumpLocation.address);

  const activeTab = tab ?? 'onboarding';
  const visibleTabs = TABS.filter((t) => !t.superAdminOnly || isSuperAdmin);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Dealers', to: '/dealers' },
          { label: dealer.name ?? dealer.phone },
        ]}
        title={dealer.name ?? 'Unnamed dealer'}
        subtitle={subtitleParts.join(' · ')}
        actions={<StatusChip kind="dealer" value={dealer.status} />}
      />
      {/* Sticky (mobile) so the tab strip stays reachable while a long tab body
          scrolls; static at ≥ md (desktop unchanged). The right-edge fade hints
          that the strip scrolls to more tabs. */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 bg-bg px-4 md:static md:z-auto md:mx-0 md:bg-transparent md:px-0">
        <div className="relative">
          <Tabs items={visibleTabs} value={activeTab} onChange={setTab} />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-bg md:hidden" />
        </div>
      </div>
      {activeTab === 'onboarding' ? <OnboardingTab dealer={dealer} /> : null}
      {activeTab === 'info' ? <DealerInfoTab dealer={dealer} /> : null}
      {activeTab === 'members' ? <DealerMembersTab dealer={dealer} /> : null}
      {activeTab === 'services' ? <DealerServicesTab dealer={dealer} /> : null}
      {activeTab === 'kavach' ? <DealerKavachTab dealer={dealer} /> : null}
      {activeTab === 'staff' ? <DealerStaffTab dealer={dealer} /> : null}
      {activeTab === 'work-list' ? <DealerWorkListTab dealer={dealer} /> : null}
      {activeTab === 'provided' ? <ServicesProvidedTab dealer={dealer} /> : null}
      {activeTab === 'credit-dod' ? (
        <DealerCreditDodTab dealer={dealer} />
      ) : null}
      {activeTab === 'data-vault' ? (
        <DealerDataVaultTab dealer={dealer} />
      ) : null}
      {activeTab === 'runs' ? <RunsListInline dealerId={dealer.id} /> : null}
      {activeTab === 'custom' ? <CustomRequestTab dealer={dealer} /> : null}
    </div>
  );
}
