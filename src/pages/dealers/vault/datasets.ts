import {
  ClipboardCheck,
  CreditCard,
  Database,
  Droplets,
  FileBarChart2,
  Gauge,
  ReceiptText,
  Truck,
} from 'lucide-react';

import { DealerCreditDodTab } from '../DealerCreditDodTab';
import { DealerDataVaultTab } from '../DealerDataVaultTab';
import { DealerDsrTab } from '../DealerDsrTab';

import { DealerInspectionPane } from './DealerInspectionPane';
import { DealerPadLedgerPane } from './DealerPadLedgerPane';
import { DealerRoSupplyStatusPane } from './DealerRoSupplyStatusPane';
import { DealerTtDensityPane } from './DealerTtDensityPane';
import { DealerWaterIngressPane } from './DealerWaterIngressPane';
import type { DealerVaultDataset } from './types';

/**
 * THE PER-DEALER DATASET REGISTRY — a dealer's Data Vault, as a sidebar.
 *
 * The mirror of the cross-dealer Vault's registry (`dataVault/datasets.ts`),
 * scoped to one dealer. It is the same extension point: a new dataset is one
 * appended descriptor, and the id union is derived from the array so the two
 * cannot drift. Order is the rail order; the first entry is what the tab opens
 * to when no `?vault=` is named.
 *
 * IRAS shift data reuses the existing per-dealer tab body verbatim; PAD ledger
 * and Inspection Reports are per-dealer panes over the same admin endpoints the
 * cross-dealer Vault reads.
 */
const REGISTRY = [
  {
    id: 'iras-shift-data',
    label: 'IRAS shift data',
    description: "This dealer's shift-anchored IRAS captures — latest and history.",
    Icon: Database,
    requiresService: 'iras-shift-data',
    Pane: DealerDataVaultTab,
  },
  {
    id: 'pad-ledger',
    label: 'PAD ledger',
    description: "This dealer's accumulated PAD transactions from Credit & DOD monitoring.",
    Icon: ReceiptText,
    // The PAD ledger IS the Credit & DOD scrape's output, so it lives or dies
    // with that service being attached.
    requiresService: 'credit-dod-monitoring',
    Pane: DealerPadLedgerPane,
  },
  {
    id: 'credit-dod',
    label: 'Credit & DOD',
    description: "This dealer's Credit & DOD monitoring — latest report and the days-of-default position.",
    Icon: CreditCard,
    requiresService: 'credit-dod-monitoring',
    Pane: DealerCreditDodTab,
  },
  {
    id: 'dsr',
    label: 'Daily Sales Report',
    description: "This dealer's generated Daily Sales Reports — stock variation and the sales ledger.",
    Icon: FileBarChart2,
    requiresService: 'dsr-report',
    Pane: DealerDsrTab,
  },
  {
    id: 'inspection-reports',
    label: 'Inspection Reports',
    description: "The latest inspection reports on this dealer's outlet, and how many more the portal holds.",
    Icon: ClipboardCheck,
    requiresService: 'inspection-reports',
    Pane: DealerInspectionPane,
  },
  {
    id: 'tt-density',
    label: 'TT Density',
    description:
      "Density@15 from this dealer's tanker invoices, and the daily register photos.",
    Icon: Gauge,
    requiresService: 'tt-density',
    Pane: DealerTtDensityPane,
  },
  {
    id: 'ro-supply-status',
    label: 'RO supply status',
    description:
      'Whether the portal is currently blocking supply to this outlet, and the compliance conditions behind it.',
    Icon: Truck,
    requiresService: 'ro-supply-status',
    Pane: DealerRoSupplyStatusPane,
  },
  {
    id: 'water-ingress',
    label: 'Water ingress',
    description:
      "Which two-hour observation windows this outlet recorded, day by day, and which it missed.",
    Icon: Droplets,
    requiresService: 'water-ingress-testing',
    Pane: DealerWaterIngressPane,
  },
] as const satisfies readonly DealerVaultDataset[];

export type DealerVaultDatasetId = (typeof REGISTRY)[number]['id'];

/** Every per-dealer dataset, in rail order. */
export const DEALER_VAULT_DATASETS: readonly DealerVaultDataset[] = REGISTRY;

/** The dataset a `?vault=` names, falling back to the first one. */
export function resolveDealerVaultDataset(id: string | null): DealerVaultDataset {
  return DEALER_VAULT_DATASETS.find((d) => d.id === id) ?? REGISTRY[0];
}
