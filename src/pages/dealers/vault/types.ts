import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';

import type { Dealer } from '@dk/shared';

/**
 * What every per-dealer Vault pane is handed: the dealer it is scoped to.
 *
 * Unlike the cross-dealer Vault (whose panes carry a dealer list and drill into
 * one via the query string), the per-dealer Vault already knows its dealer — the
 * page opened it — so a pane just renders that one dealer's slice of a dataset.
 */
export interface DealerVaultPaneProps {
  dealer: Dealer;
}

/**
 * One dataset in a dealer's Data Vault.
 *
 * The per-dealer mirror of `dataVault/types.ts`'s `VaultDataset`: same rail
 * shape (id/label/description/Icon), but the `Pane` is scoped to a single dealer
 * rather than a URL-driven dealer list. A new per-dealer dataset is one appended
 * descriptor in `datasets.ts`.
 */
export interface DealerVaultDataset {
  /** Stable value for `?vault=`. Never rename one — deep links carry it. */
  id: string;
  /** Rail label. Keep it short; the rail is ~13rem wide on desktop. */
  label: string;
  /** One line under the section title while this dataset is open. */
  description: string;
  /** Rail icon, from lucide-react. */
  Icon: LucideIcon;
  /**
   * A service plugin that must be attached before this dataset earns a rail
   * entry. Gated datasets are hidden from the rail for a plain admin when the
   * service is not attached (super-admins keep them — they attach/debug
   * services), but a `?vault=` deep link still renders the pane. Omit for
   * datasets that are always shown (they self-explain when empty).
   */
  requiresService?: string;
  /** The dataset itself, scoped to the open dealer. */
  Pane: React.ComponentType<DealerVaultPaneProps>;
}
