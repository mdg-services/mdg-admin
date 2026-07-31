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
  };
  riskCategory: string | null;
  state: 'due' | 'advance' | 'clear';
  reconciles: boolean;
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
