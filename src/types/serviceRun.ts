import type { ServiceRun } from '@dk/shared';

/**
 * Local extension of the shared ServiceRun. Until the backend publishes the
 * step/artifact shapes through @dk/shared, these mirror the contract from
 * docs/API_CONTRACT.md so the frontend can type-check end-to-end.
 */
export interface ServiceRunStep {
  name: string;
  status: 'start' | 'ok' | 'error';
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  message?: string;
  meta?: Record<string, unknown>;
  error?: { message: string; stack?: string };
}

export interface ServiceRunArtifact {
  id: string;
  /** 'STK' | 'TOT' | 'REC' | other */
  reportCode?: string;
  filename: string;
  size?: number;
  contentType?: string;
  /**
   * `output` = a deliverable meant to be opened; `diagnostic` = raw capture,
   * only ever served to super-admins. Always present from the API — older rows
   * are classified by filename server-side.
   */
  kind?: 'output' | 'diagnostic';
  createdAt: string;
}

export interface ServiceRunWithSteps extends ServiceRun {
  /**
   * Per-step trace. Diagnostics — the API only serialises this for
   * super-admins, so treat it as absent in the plain-admin view.
   */
  steps?: ServiceRunStep[];
  artifacts?: ServiceRunArtifact[];
  /**
   * Stable failure code for a FAILED run (e.g. `LOGIN_REJECTED`), serialised at
   * the top level for every role so the plain-language failure copy works even
   * when `steps`/`error` are withheld.
   */
  failureCode?: string;
  /** Optional plain-language next step served alongside `failureCode`. */
  failureHint?: string;
  /**
   * Map of `artifactId` -> short-lived signed URL. These can be used directly
   * as `<img src>` / `<a href download>` WITHOUT a bearer token. Absent on
   * older runs, in which case callers fall back to the token-gated
   * `/runs/:id/artifacts/:id/download` route.
   *
   * These carry `Content-Disposition: attachment`, so they always SAVE. Use
   * `artifactViewUrls` for anything that must render in place.
   */
  artifactUrls?: Record<string, string>;
  /**
   * Map of `artifactId` -> signed URL with an `inline` disposition, for images
   * rendered with `<img src>`. Only images get one.
   */
  artifactViewUrls?: Record<string, string>;
}

export interface IrasCredentialsStatus {
  hasCredentials: boolean;
  username?: string;
  setAt?: string;
}

export type SdmsDealerType = 'retail' | 'lpg' | '1906';

export interface SdmsCredentialsStatus {
  hasCredentials: boolean;
  username?: string;
  dealerType?: SdmsDealerType;
  setAt?: string;
}

/**
 * Response of the admin-only credential reveal. Carries the decrypted
 * password, so never persist it in the query cache — the reveal hooks are
 * mutations for exactly that reason.
 */
export interface RevealedPortalCredentials {
  username: string;
  password: string;
  dealerType?: SdmsDealerType;
  setAt?: string;
}

/**
 * Shape of `run.output` for the `credit-dod-monitoring` service. Mirrors the
 * backend contract; cast `run.output` to this in the run-detail view.
 */
export interface CreditDodRunOutput {
  snapshotId: string;
  card: {
    code: string;
    dueAmount: number;
    dueDate: string | null;
    currentLimit: number;
    availedLimit: number;
    availableLimit: number;
    formOfLimit: 'DOD' | 'CREDIT' | 'CASH & CARRY';
    preparedAt: string;
    /** dd-mm-yyyy the figures describe — the anchor the card's countdown uses. */
    preparedOn?: string;
    /**
     * The credit-limit review. Once `lapsed`, the limit above cannot be drawn
     * on: the account is locked and the dealer buys cash and carry until their
     * sales officer reopens it. Optional and nullable because a run from before
     * this existed has no such field, and because the verdict is deliberately
     * withheld on a back-dated run and on an unreadable date — none of which is
     * evidence that the limit is live.
     */
    creditReview?: { on: string; daysUntil: number; lapsed: boolean } | null;
  };
  riskCategory: string | null;
  /** The portal's "Next Review Date" exactly as it wrote it, e.g. `31-Mar-2027`. */
  nextReviewDate?: string | null;
  /** The verdict on it — the same object the card carries. */
  creditReview?: { on: string; daysUntil: number; lapsed: boolean } | null;
  state: 'due' | 'advance' | 'clear';
  /**
   * Set when a deposit deadline had already passed unpaid. Optional because a
   * run from before the overdue engine existed has no such field, and absent is
   * indistinguishable from "nothing was late" — which is the safe reading.
   */
  overdue?: {
    amount: number;
    since: string;
    days: number;
    /** DISTINCT missed deadlines, not lots. */
    deadlines: number;
    withinPortalLag: boolean;
    estimatedFrom: boolean;
  } | null;
  reconciles: boolean;
  /** False when no cross-check figure was available, so `reconciles` proves nothing. */
  reconcileChecked?: boolean;
  /** The portal's own closing balance, the figure `reconciles` compared against. */
  closingBalanceReported?: number | null;
  /** The second cross-check: FIFO availed against SDMS's Current Total Receivable. */
  receivableReconciles?: boolean | null;
  totalReceivableReported: number | null;
  window: { fromDate: string; toDate: string };
  loginAttempts: number;
  cardKey: string;
  rawArtifacts: {
    /** The readable, rendered PAD statement. */
    padStatementKey?: string;
    /** The untouched RetriveData fragment (super-admin only). */
    padStatementRawKey?: string;
    creditMonitoringKey?: string;
  };
  /** True when this run was a stateless back-dated reconstruction. */
  backdated?: boolean;
  /** dd-mm-yyyy the report was generated "as of" on a back-dated run. */
  asOf?: string | null;
  /** Ledger rows the parser had to skip — a parser-drift signal. */
  droppedRows?: number;
  /** Number of maintained PAD transactions this run accounts for. */
  transactionCount?: number;
  /** Transactions newly appended by this run. */
  newRows?: number;
  /**
   * Of those, the ones dated before what the previous report could see — the
   * portal published them late.
   */
  backdatedRows?: number;
  /** Value dates of those late transactions, `dd-mm-yyyy`, oldest first. */
  backdatedDates?: string[];
  /** Stored rows the portal has since withdrawn or amended. */
  restatedRows?: number;
  /** Rows previously retired that the portal has listed again. */
  restoredRows?: number;
  /** False when an unreadable or empty fetch made a row's absence unprovable. */
  removalApplied?: boolean;
  /** ISO time of a report already shared with the dealer that is now out of date. */
  supersededSharedAt?: string | null;
  /** Times the capture had to widen its window before the ledger verified. */
  verifyWidenings?: number;
  /** Whether this run appended to an existing ledger rather than rebuilding it. */
  incremental?: boolean;
  /**
   * True when the look-back window never reached a balance reset, so the
   * opening balance was carried forward and the due date is an estimate.
   */
  openingCarriedForward?: boolean;
  /** Whether the card image was rendered for this run. */
  cardRendered?: boolean;
}

export interface CreditDodShareState {
  at: string;
  by: string;
  conversationId: string;
}

export interface CreditDodSnapshot {
  shared: CreditDodShareState | null;
  /** dd-mm-yyyy the report was generated "as of" (back-dated run), else null. */
  asOf?: string | null;
  /** True when this snapshot was a stateless back-dated backfill. */
  backdated?: boolean;
}

/** Result of POST /credit-dod/snapshots/:id/share. */
export interface CreditDodShareResult {
  alreadyShared: boolean;
  conversationId: string;
  messageId: string;
}
