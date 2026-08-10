import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';

/**
 * What every dataset pane is handed. Deliberately just the URL and a way to
 * change it: the Vault keeps ALL of its state in the query string so any view is
 * a shareable link, and a dataset that kept its own React state would quietly
 * break that promise.
 */
export interface VaultDatasetProps {
  /** The page's current query string. A dataset reads only its own keys. */
  params: URLSearchParams;
  /**
   * Merge-patch the query string. `null` or `''` removes a key; a key the patch
   * does not mention is left untouched, so a dataset can never clobber
   * `?dataset` or another dataset's parked state.
   *
   * Replaces the history entry by default — filter tweaks and search keystrokes
   * must not each become a Back step. Pass `{ push: true }` for a real
   * navigation, e.g. drilling from a dealer list into one dealer's rows, so
   * Back returns to the list.
   */
  patchParams: (
    patch: Record<string, string | null>,
    opts?: { push?: boolean },
  ) => void;
}

/**
 * One dataset the Data Vault holds.
 *
 * This is the whole extension point: a new dataset is a new descriptor appended
 * to `VAULT_DATASETS`, and nothing else in the page changes — no switch to
 * extend, no route to add, no id union to keep in sync (it is derived from the
 * array). The rail, the deep-link resolution and the header actions are all
 * driven off this shape.
 */
export interface VaultDataset {
  /** Stable URL value for `?dataset=`. Never rename one — links carry it. */
  id: string;
  /** Rail label. Keep it short; the rail is 13rem wide on desktop. */
  label: string;
  /** One line under the page title while this dataset is open. */
  description: string;
  /** Rail icon, from lucide-react. */
  Icon: LucideIcon;
  /**
   * Rendered into the page header's action slot while this dataset is open —
   * for controls that scope the whole dataset (the IRAS business date). Omit
   * when a dataset has none.
   */
  Actions?: React.ComponentType<VaultDatasetProps>;
  /** The dataset itself: its dealer list, and its drill-in. */
  Pane: React.ComponentType<VaultDatasetProps>;
}
