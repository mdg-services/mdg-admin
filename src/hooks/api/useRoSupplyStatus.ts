import { useMutation, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { RoSupplyStatusSummary } from '@dk/shared';

/**
 * One prefix for everything this pane caches, so a finished check can clear all
 * of it with a single invalidate rather than a list of keys someone has to
 * remember to extend.
 */
export const roSupplyStatusKeys = {
  all: ['roSupplyStatus'] as const,
  summary: (dealerId: string | undefined) => ['roSupplyStatus', dealerId] as const,
};

/**
 * A dealer's RO supply status — whether SAP is blocking supply to their outlet,
 * and the RDB/SDMS compliance conditions behind it. Never 404s (the backend
 * returns an empty summary for a dealer that was never captured), so this drives
 * the Vault pane directly.
 *
 * `staleTime` is 30s rather than the minute this data actually changes in,
 * because the pane is opened deliberately by someone who wants to know NOW —
 * usually because a dealer just rang about a blocked indent.
 */
export function useRoSupplyStatus(dealerId: string | undefined) {
  return useQuery({
    queryKey: roSupplyStatusKeys.summary(dealerId),
    enabled: !!dealerId,
    queryFn: () =>
      api.get<RoSupplyStatusSummary>(`/ro-supply-status/dealers/${dealerId}/summary`),
    staleTime: 30_000,
  });
}

/**
 * Ask for the RO supply status to be checked now.
 *
 * Answers 202 with a run id and THEN drives the portal, so this deliberately
 * does not invalidate anything: at the moment it resolves there is nothing new
 * to read. The caller watches the run (`useRoSupplyRunWatcher`) and refreshes
 * when it actually lands.
 */
export function useCollectRoSupplyStatus(dealerId: string | undefined) {
  return useMutation({
    mutationFn: () =>
      api.post<{ runId: string }>(`/ro-supply-status/dealers/${dealerId}/collect`),
  });
}

/** `GET /ro-supply-status/dealers/:id/card` — the shareable picture, signed. */
export interface RoSupplyCardUrls {
  viewUrl: string;
  downloadUrl: string;
  filename: string;
  contentType: string;
  expiresIn: number;
}

/**
 * Ask the server for the dealer's pending-work image.
 *
 * A mutation rather than a query on purpose: the URLs are short-lived signatures
 * and the card may have to be drawn first, so this is a thing you DO at the
 * moment of sharing, not a thing the pane holds and lets go stale.
 */
export function useRoSupplyCard(dealerId: string | undefined) {
  return useMutation({
    mutationFn: () => api.get<RoSupplyCardUrls>(`/ro-supply-status/dealers/${dealerId}/card`),
  });
}
