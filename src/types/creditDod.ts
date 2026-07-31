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

/** One unpaid FIFO lot behind the DUE AMOUNT — oldest first. */
export interface CreditDodOpenLot {
  /** dd-mm-yyyy the credit was availed. */
  date: string;
  amount: number;
  /** dd-mm-yyyy the deposit is due for this lot. */
  deadline: string;
}

/**
 * Short-lived signed URLs for a snapshot's stored files, so the report can be
 * viewed and shared straight from Report history without going via its run.
 * Every field is optional — the render can fail, and raw captures are only
 * signed for super-admins.
 */
export interface CreditDodSnapshotArtifacts {
  /** `inline` — safe to use as an `<img src>`. */
  cardUrl?: string;
  /** `attachment` — saves the card PNG. */
  cardDownloadUrl?: string;
  /** The readable, rendered PAD statement. */
  padStatementUrl?: string;
  /** Raw portal captures. Super-admin only. */
  rawPadStatementUrl?: string;
  rawCreditMonitoringUrl?: string;
}

/**
 * A stored Credit & DOD snapshot, as returned by
 * `GET /credit-dod/dealers/:dealerId/snapshots` and
 * `GET /credit-dod/snapshots/:id`.
 */
export interface CreditDodSnapshotRecord {
  id: string;
  dealerId: string;
  /** The run that produced it. Absent on very old rows. */
  runId?: string;
  capturedAt: string;
  code: string;
  window: { fromDate: string; toDate: string };
  /** dd-mm-yyyy the report was generated "as of" (back-dated run), else null. */
  asOf: string | null;
  /** True when this snapshot was a stateless back-dated backfill. */
  backdated: boolean;
  riskCategory: string | null;
  currentLimit: number;
  /** SDMS's own "Current Total Receivable", the figure AVAILED is checked against. */
  totalReceivableReported: number | null;
  availedLimit: number;
  availableLimit: number;
  dueAmount: number;
  dueDate: string | null;
  state: 'due' | 'advance' | 'clear';
  formOfLimit: string;
  reconciles: boolean;
  /**
   * True when the look-back never reached a balance reset, so the DUE DATE is a
   * latest-possible estimate rather than a fact.
   */
  openingCarriedForward: boolean;
  /** Rows in the maintained ledger the figures were computed over. */
  transactionCount: number | null;
  /** Ledger rows the parser had to skip — a parser-drift signal. */
  droppedRows: number;
  preparedAt: string;
  openLots: CreditDodOpenLot[];
  artifacts: CreditDodSnapshotArtifacts;
  shared: CreditDodShareState | null;
}

/**
 * Manual-generation budget for a dealer, from
 * `GET /credit-dod/dealers/:dealerId/quota`. Every generation is a live SDMS
 * login, so it is capped per dealer; super-admins come back `exempt`.
 */
export interface CreditDodQuota {
  limit: number;
  used: number;
  remaining: number;
  windowMs: number;
  /** ISO time a slot frees up, or null when nothing is counted. */
  resetAt: string | null;
  exempt: boolean;
}
