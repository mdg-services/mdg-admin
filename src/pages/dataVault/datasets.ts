import { Database, FileUp, ReceiptText } from 'lucide-react';

import { DocumentsActions, DocumentsPane } from './documents/DocumentsPane';
import { IrasShiftDataActions, IrasShiftDataPane } from './IrasShiftDataPane';
import { PadLedgerPane } from './PadLedgerPane';
import type { VaultDataset } from './types';

/**
 * THE DATASET REGISTRY — the whole extension point of the Data Vault.
 *
 * The Vault started life as one hard-wired screen (IRAS shift data) and is meant
 * to hold everything the platform knows about a dealer, so the shape that
 * matters is the one that makes the SECOND dataset cheap and the fifth no more
 * expensive than the third. Adding one is a data-only change: append a
 * descriptor here. There is no switch to extend, no route to register and no id
 * union to keep in step — `VaultDatasetId` is derived from this array, so the
 * two cannot drift.
 *
 * `as const satisfies` is doing real work: `satisfies` type-checks every
 * descriptor against `VaultDataset` at the point of definition (a typo in a
 * component reference fails here, not at render), while `as const` keeps the
 * ids literal so the derived union is the actual ids rather than `string`.
 *
 * ORDER IS THE RAIL ORDER, and the first entry is the default a bare
 * `/data-vault` opens — which is why IRAS stays first: every link an admin has
 * already bookmarked predates `?dataset=` and must keep landing there.
 */
const REGISTRY = [
  {
    id: 'iras-shift-data',
    label: 'IRAS shift data',
    description: 'Shift-anchored IRAS data collected for every dealer',
    Icon: Database,
    Actions: IrasShiftDataActions,
    Pane: IrasShiftDataPane,
  },
  {
    id: 'pad-ledger',
    label: 'PAD ledger',
    description:
      'Every PAD transaction Credit & DOD monitoring has accumulated, per dealer',
    Icon: ReceiptText,
    Pane: PadLedgerPane,
  },
  {
    id: 'documents',
    label: 'Documents',
    description: 'What every dealer owes MDG, and what has come in',
    Icon: FileUp,
    Actions: DocumentsActions,
    Pane: DocumentsPane,
  },
] as const satisfies readonly VaultDataset[];

/**
 * The ids the registry defines, derived from the array itself so it can never
 * drift from it. Exported so anything linking INTO the Vault can name a dataset
 * with a checked value instead of a bare string.
 */
export type VaultDatasetId = (typeof REGISTRY)[number]['id'];

/**
 * Every dataset, in rail order. Deliberately widened to `VaultDataset[]`: the
 * page treats datasets uniformly, and a union of two differently-shaped literals
 * would make `dataset.Actions` unreadable for the one that has no header
 * controls.
 */
export const VAULT_DATASETS: readonly VaultDataset[] = REGISTRY;

/**
 * The dataset a URL names, falling back to the first one.
 *
 * Total by construction — an unknown or absent `?dataset=` has to land
 * somewhere, and a stale bookmark should open the Vault rather than an error.
 * It is also what keeps every pre-existing `?date=&status=&dealer=` link
 * working untouched: they name no dataset, so they resolve to IRAS shift data
 * exactly as they always did.
 */
export function resolveVaultDataset(id: string | null): VaultDataset {
  return VAULT_DATASETS.find((d) => d.id === id) ?? REGISTRY[0];
}

/**
 * The query string that opens a dataset at its top level.
 *
 * Deliberately carries NOTHING over from the dataset being left. Filters, dates
 * and the open dealer all mean different things per dataset — a business date
 * has no meaning in a ledger, and a dealer with IRAS data may have no PAD ledger
 * at all — so switching datasets lands on that dataset's dealer list, which is
 * both what the rail promises and the only state that is always valid.
 */
export function vaultDatasetHref(id: string): string {
  return `?dataset=${encodeURIComponent(id)}`;
}
