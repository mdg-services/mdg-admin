import { Database } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { Card, CardContent, EmptyState, Skeleton } from '@/components/ui';
import { useDealerServicesQuery } from '@/hooks/api/useDealerServices';
import { DatasetRail } from '@/pages/dataVault/DatasetRail';

import { DEALER_VAULT_DATASETS } from './datasets';
import type { DealerVaultDataset, DealerVaultPaneProps } from './types';

/**
 * A dealer's Data Vault: the datasets as a HORIZONTAL segmented bar, with the
 * selected dataset full-width beneath it.
 *
 * A vertical rail is wrong here — this view already sits inside the app sidebar
 * AND the dealer tab strip, and a third vertical rail left a wide ledger nowhere
 * to go. Which dataset is open lives in `?vault=`, so it stays a shareable link
 * and the WebView Back button steps between datasets.
 *
 * A dataset is only offered once its backing service is attached to the dealer
 * (IRAS → iras-shift-data, PAD ledger & Credit & DOD → credit-dod-monitoring,
 * DSR → dsr-report, Inspection → inspection-reports). A dealer with none attached
 * gets a clear empty state rather than an empty bar.
 */
export function DealerVaultView({ dealer }: DealerVaultPaneProps) {
  const [search] = useSearchParams();
  const param = search.get('vault');

  // Shares the Services tab's query key, so on a warm cache (the dealer page
  // already fetched it) this is a read, not another round trip.
  const servicesQ = useDealerServicesQuery(dealer.id);
  const attached = servicesQ.isSuccess
    ? new Set(servicesQ.data.map((s) => s.serviceId))
    : null;

  const isVisible = (d: DealerVaultDataset): boolean => {
    if (!d.requiresService) return true;
    if (attached) return attached.has(d.requiresService);
    // Still asking: withhold. Ask failed: "could not ask" is not "not attached",
    // so show it — the panes degrade gracefully when the service is missing.
    return servicesQ.isError;
  };

  const visible = DEALER_VAULT_DATASETS.filter(isVisible);
  // Never land on a hidden dataset: an old `?vault=` for a since-detached service
  // falls back to the first offered one.
  const dataset = visible.find((d) => d.id === param) ?? visible[0] ?? null;

  const hrefFor = React.useCallback((id: string) => {
    const next = new URLSearchParams();
    // Keep the dealer page on its Data Vault tab, switch only the dataset.
    next.set('tab', 'data-vault');
    next.set('vault', id);
    return `?${next.toString()}`;
  }, []);

  // Cold deep-link straight into the tab (the dealer page usually warms this).
  if (servicesQ.isLoading && !attached) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-9 w-full max-w-xl" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!dataset) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<Database width={28} height={28} strokeWidth={1.75} />}
            title="No data services attached yet"
            description="A dataset appears here once its service — IRAS, Credit & DOD, Daily Sales Report or Inspection Reports — is attached to this dealer from the Services tab."
          />
        </CardContent>
      </Card>
    );
  }

  const { Pane } = dataset;

  return (
    <div className="min-w-0">
      <DatasetRail
        orientation="horizontal"
        datasets={visible}
        activeId={dataset.id}
        hrefFor={hrefFor}
      />
      <p className="mb-3 mt-3 text-sm text-text-muted">{dataset.description}</p>
      <Pane dealer={dealer} />
    </div>
  );
}
