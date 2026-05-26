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
