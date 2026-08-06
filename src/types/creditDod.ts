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
 * The dealer's position on deposit deadlines that have already passed, judged
 * against the date the report's figures describe. Null when nothing is late.
 */
export interface CreditDodOverdue {
  /**
   * EVERY past-deadline lot summed. Deliberately not the same as `dueAmount`,
   * which is only the oldest deadline's lot: once several deadlines have gone
   * by, paying `dueAmount` leaves the dealer still in default, so this is the
   * figure that clears it.
   */
  amount: number;
  /** The earliest missed deadline, `dd-mm-yyyy` — when the breach started. */
  since: string;
  /** Whole days from `since` to the date the figures describe. Always >= 1. */
  days: number;
  /**
   * How many DISTINCT deadlines have been missed — not how many lots. Two
   * invoices lifted on one day, or a Thursday and a Friday purchase, share a
   * single deadline.
   */
  deadlines: number;
  /**
   * True while the miss is still within the day or two IndianOil takes to
   * publish a deposit — the dealer may well have paid on time. Show it as
   * unconfirmed, not as a default.
   */
  withinPortalLag: boolean;
  /**
   * True when the breach rests on the opening carry-forward lot, whose real
   * availment date is older than the readable window, so `days` is a lower
   * bound rather than an exact count.
   */
  estimatedFrom: boolean;
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
  /**
   * Set when a deposit deadline had already passed unpaid on the date these
   * figures describe. Orthogonal to `state`, which reports the ledger position
   * ('due' covers both a deadline still ahead and one long gone) — so an
   * overdue report is always `state: 'due'` with this populated.
   */
  overdue: CreditDodOverdue | null;
  formOfLimit: string;
  reconciles: boolean;
  /**
   * False when neither cross-check figure was available, so `reconciles` was
   * never actually verified — it must not be shown as agreement.
   */
  reconcileChecked: boolean;
  /** The portal's own closing balance, the figure `reconciles` compared against. */
  closingBalanceReported: number | null;
  /**
   * True when the look-back never reached a balance reset, so the DUE DATE is a
   * latest-possible estimate rather than a fact.
   */
  openingCarriedForward: boolean;
  /** Rows in the maintained ledger the figures were computed over. */
  transactionCount: number | null;
  /** Ledger rows the parser had to skip — a parser-drift signal. */
  droppedRows: number;
  /**
   * Transactions this run found that the portal published after their own value
   * date — i.e. after an earlier report for those days had been worked out.
   */
  backdatedRows: number;
  /** Value dates of those late transactions, `dd-mm-yyyy`, oldest first. */
  backdatedDates: string[];
  /** Rows the portal has since withdrawn or amended, retired by this run. */
  restatedRows: number;
  /** Rows previously retired that the portal has listed again — a self-repair. */
  restoredRows: number;
  /**
   * False when the portal's response was too incomplete to prove a transaction
   * had been withdrawn, so this run deliberately changed nothing. Distinguishes
   * "nothing changed" from "we did not trust the response enough to act".
   */
  removalApplied: boolean;
  /**
   * When set, a report already sent to the dealer at this time was worked out
   * without the late transactions above, so the dealer is holding stale figures.
   */
  supersededSharedAt: string | null;
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
