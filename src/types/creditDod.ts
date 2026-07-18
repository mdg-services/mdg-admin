import type { CreditDodShareState } from './serviceRun';

/**
 * One row of the maintained PAD ledger, as returned by
 * `GET /credit-dod/dealers/:dealerId/ledger`. Rows are newest-first.
 */
export interface CreditDodLedgerRow {
  seq: number;
  /** dd-mm-yyyy */
  date: string;
  /** Document / description. */
  doc: string;
  txnType: string;
  terminal: string;
  product: string;
  debit: number;
  credit: number;
  /** Running balance; negative = advance (dealer in credit), positive = owed. */
  balance: number;
}

export interface CreditDodLedgerResponse {
  total: number;
  rows: CreditDodLedgerRow[];
}

/**
 * A stored Credit & DOD snapshot, as returned by
 * `GET /credit-dod/dealers/:dealerId/snapshots` and
 * `GET /credit-dod/snapshots/:id`.
 */
export interface CreditDodSnapshotRecord {
  id: string;
  capturedAt: string;
  code: string;
  window: { fromDate: string; toDate: string };
  riskCategory: string | null;
  currentLimit: number;
  availedLimit: number;
  availableLimit: number;
  dueAmount: number;
  dueDate: string | null;
  state: 'due' | 'advance' | 'clear';
  formOfLimit: string;
  reconciles: boolean;
  preparedAt: string;
  artifacts: { cardKey?: string };
  shared: CreditDodShareState | null;
}
