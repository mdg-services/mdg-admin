import type { ServiceRun } from '@dk/shared';

/**
 * Local mirror of the OverviewSnapshot contract documented in
 * docs/API_CONTRACT.md. The backend will eventually publish this type
 * via @dk/shared; until then, keep the shape aligned with the contract.
 */
export interface OverviewSnapshot {
  dealers: {
    total: number;
    byStatus: Record<'ONBOARDING' | 'ACTIVE' | 'SUSPENDED', number>;
  };
  services: {
    pluginCount: number;
    attached: number;
    active: number;
  };
  runs: {
    last24h: number;
    successRate24h: number;
    failedLast24h: number;
    avgDurationMs24h: number;
  };
  recentRuns: ServiceRun[];
  /** Optional: backend may include upcoming runs. */
  upcomingRuns?: ServiceRun[];
}
