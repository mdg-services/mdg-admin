import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';

import { DatasetRail } from './dataVault/DatasetRail';
import {
  resolveVaultDataset,
  VAULT_DATASETS,
  vaultDatasetHref,
} from './dataVault/datasets';

/**
 * The Data Vault: the one place an admin reads everything the platform holds
 * about a dealer.
 *
 * It is a SHELL, not a screen. It owns the chrome — the header, the dataset rail
 * and the query string — and nothing about any particular data. Each dataset in
 * `VAULT_DATASETS` renders itself, so the Vault grows by gaining a descriptor
 * rather than by growing this file.
 *
 * ALL state stays in the URL (`?dataset=…&dealer=…` plus whatever each dataset
 * parks there), so any view an admin is looking at is a link they can send. The
 * corollary is the compatibility rule: `?dataset=` is absent from every link
 * bookmarked before this page had datasets, and absent resolves to IRAS shift
 * data, so those links open exactly what they always opened.
 */
export function DataVaultPage() {
  const [search, setSearch] = useSearchParams();
  const dataset = resolveVaultDataset(search.get('dataset'));

  /**
   * Merge-patch the query string.
   *
   * Written as a functional update so it reads the CURRENT params rather than
   * the ones captured when the handler was created — a header control and a pane
   * both hold this callback, and a stale snapshot between them would drop
   * whichever change landed second.
   *
   * `replace` by default: a filter tweak or a search keystroke must not become a
   * Back step. Datasets pass `{ push: true }` for a real navigation — drilling
   * into one dealer's rows — so Back returns to the list.
   */
  const patchParams = React.useCallback(
    (patch: Record<string, string | null>, opts?: { push?: boolean }) => {
      setSearch(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: !opts?.push },
      );
    },
    [setSearch],
  );

  const { Pane, Actions } = dataset;

  return (
    <div>
      <PageHeader
        title="Data Vault"
        subtitle={dataset.description}
        actions={
          Actions ? (
            <Actions params={search} patchParams={patchParams} />
          ) : undefined
        }
      />

      {/* Two panes from `lg`: a fixed-width rail and a track that is allowed to
          be narrower than its content (`minmax(0,1fr)`), without which a wide
          ledger table stretches the grid and scrolls the whole page sideways. */}
      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <DatasetRail
          datasets={VAULT_DATASETS}
          activeId={dataset.id}
          hrefFor={vaultDatasetHref}
        />
        <div className="min-w-0">
          <Pane params={search} patchParams={patchParams} />
        </div>
      </div>
    </div>
  );
}
