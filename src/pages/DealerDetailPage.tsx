import { AlertCircle } from 'lucide-react';
import * as React from 'react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState, Skeleton, StatusChip, Tabs } from '@/components/ui';
import { useDealerQuery } from '@/hooks/api/useDealers';

import { CustomRequestTab } from './dealers/CustomRequestTab';
import { DealerInfoTab } from './dealers/DealerInfoTab';
import { DealerServicesTab } from './dealers/DealerServicesTab';
import { OnboardingTab } from './dealers/OnboardingTab';
import { RunsListInline } from './dealers/RunsListInline';

const TABS = [
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'info', label: 'Info' },
  { id: 'services', label: 'Services' },
  { id: 'runs', label: 'Run history' },
  { id: 'custom', label: 'Custom requests' },
];

export function DealerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: dealer, isLoading, isError, error } = useDealerQuery(id);
  const [tab, setTab] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!dealer || tab) return;
    setTab(dealer.status === 'ACTIVE' ? 'info' : 'onboarding');
  }, [dealer, tab]);

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
      <Tabs items={TABS} value={activeTab} onChange={setTab} className="mb-4" />
      {activeTab === 'onboarding' ? <OnboardingTab dealer={dealer} /> : null}
      {activeTab === 'info' ? <DealerInfoTab dealer={dealer} /> : null}
      {activeTab === 'services' ? <DealerServicesTab dealer={dealer} /> : null}
      {activeTab === 'runs' ? <RunsListInline dealerId={dealer.id} /> : null}
      {activeTab === 'custom' ? <CustomRequestTab dealer={dealer} /> : null}
    </div>
  );
}
