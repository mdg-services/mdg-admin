import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { useDealerServicesQuery } from '@/hooks/api/useDealerServices';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { DatasetRail } from '@/pages/dataVault/DatasetRail';

import { DEALER_VAULT_DATASETS, resolveDealerVaultDataset } from './datasets';
import type { DealerVaultDataset, DealerVaultPaneProps } from './types';

/**
 * A dealer's Data Vault, presented the way the cross-dealer Vault is: a dataset
 * rail on the left, the selected dataset on the right — scoped to this one
 * dealer. Which dataset is open lives in `?vault=`, so a dataset is a shareable
 * link and the WebView Back button steps between datasets.
 *
 * The rail keeps `?tab=data-vault` set (this view is the dealer page's Data Vault
 * tab) and swaps only `?vault=`. Below `lg` the rail lies down into a scrolling
 * strip above the content — the same responsive shape the cross-dealer Vault uses
 * — which is what makes a sidebar work on a phone-width admin screen.
 */
export function DealerVaultView({ dealer }: DealerVaultPaneProps) {
  const [search] = useSearchParams();
  // Resolve against the FULL registry, so a `?vault=` deep link into a gated-off
  // dataset still renders its pane — the rail is a display of what's offered, not
  // a gate on what's reachable.
  const dataset = resolveDealerVaultDataset(search.get('vault'));

  // Shares the Services tab's query key, so on a warm cache (the dealer page
  // already fetched it) this is a read, not another round trip.
  const servicesQ = useDealerServicesQuery(dealer.id);
  const isSuperAdmin = useIsSuperAdmin();
  const attached = servicesQ.isSuccess
    ? new Set(servicesQ.data.map((s) => s.serviceId))
    : null;

  // Cheap and render-only (drives the rail this render), so a plain function —
  // not a hook — is the right tool.
  const railVisible = (d: DealerVaultDataset): boolean => {
    if (!d.requiresService) return true;
    if (attached) {
      // Answered: show only if attached; super-admins keep it either way.
      return attached.has(d.requiresService) || isSuperAdmin;
    }
    // In-flight: withhold (a gated entry only appears once the answer is in).
    // Failed: "could not ask" is not "not attached" — show it, its pane degrades
    // gracefully when the service is missing.
    return servicesQ.isError;
  };

  const visible = DEALER_VAULT_DATASETS.filter(railVisible);
  // A deep-linked, gated-off dataset still earns a rail entry so the reader has a
  // signpost to what they are looking at (mirrors the dealer page's tab logic).
  const railDatasets = visible.includes(dataset) ? visible : [...visible, dataset];

  const hrefFor = React.useCallback((id: string) => {
    const next = new URLSearchParams();
    // Keep the dealer page on its Data Vault tab, switch only the dataset.
    next.set('tab', 'data-vault');
    next.set('vault', id);
    return `?${next.toString()}`;
  }, []);

  const { Pane } = dataset;

  return (
    <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <DatasetRail datasets={railDatasets} activeId={dataset.id} hrefFor={hrefFor} />
      <div className="min-w-0">
        <p className="mb-3 text-sm text-text-muted">{dataset.description}</p>
        <Pane dealer={dealer} />
      </div>
    </div>
  );
}
