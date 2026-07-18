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
  createdAt: string;
}

export interface ServiceRunWithSteps extends ServiceRun {
  steps?: ServiceRunStep[];
  artifacts?: ServiceRunArtifact[];
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
  };
  riskCategory: string | null;
  state: 'due' | 'advance' | 'clear';
  reconciles: boolean;
  totalReceivableReported: number | null;
  window: { fromDate: string; toDate: string };
  loginAttempts: number;
  cardKey: string;
  rawArtifacts: { padStatementKey?: string; creditMonitoringKey?: string };
}

export interface CreditDodShareState {
  at: string;
  by: string;
  conversationId: string;
}

export interface CreditDodSnapshot {
  shared: CreditDodShareState | null;
}

/** Result of POST /credit-dod/snapshots/:id/share. */
export interface CreditDodShareResult {
  alreadyShared: boolean;
  conversationId: string;
  messageId: string;
}
