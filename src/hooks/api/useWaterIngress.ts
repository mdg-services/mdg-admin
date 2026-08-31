import { useMutation, useQuery } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api';
import type { WaterIngressDayLog } from '@dk/shared';

/**
 * Water Ingress Testing — the day-shaped compliance record, per dealer.
 *
 * One request for a fortnight rather than one per date: a day is twelve rows and
 * the pane lets an admin step between dates, so fourteen round trips to render a
 * date picker would be the wrong trade.
 */
export interface WaterIngressDaysResponse {
  dealerId: string;
  outletCode: string | null;
  days: WaterIngressDayLog[];
}

export const waterIngressKeys = {
  all: ['water-ingress'] as const,
  days: (dealerId: string | undefined, limit: number) =>
    ['water-ingress', 'days', dealerId, limit] as const,
};

/** Don't hammer a 4xx: a 404 for a dealer with no record will not fix itself. */
function retryUnlessClientError(count: number, err: unknown): boolean {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
  return count < 2;
}

export function useWaterIngressDays(dealerId: string | undefined, limit = 14) {
  return useQuery({
    queryKey: waterIngressKeys.days(dealerId, limit),
    queryFn: () =>
      api.get<WaterIngressDaysResponse>(`/water-ingress/dealers/${dealerId}/days`, { limit }),
    enabled: !!dealerId,
    retry: retryUnlessClientError,
    staleTime: 60_000,
  });
}

/** `GET /water-ingress/dealers/:id/days/:date/card` — the saved picture, signed. */
export interface WaterIngressCardUrls {
  /** Inline, for opening in a tab. */
  viewUrl: string;
  /** `Content-Disposition: attachment`, for saving. */
  downloadUrl: string;
  filename: string;
  contentType: string;
  expiresIn: number;
}

/**
 * Ask for a day's saved image.
 *
 * A mutation rather than a query even though it only reads: the URLs are signed
 * and short-lived, so caching them would hand somebody an expired link, and the
 * request is only ever made because a person pressed a button.
 */
export function useWaterIngressCard(dealerId: string | undefined) {
  return useMutation({
    mutationFn: (businessDate: string) =>
      api.get<WaterIngressCardUrls>(
        `/water-ingress/dealers/${dealerId}/days/${businessDate}/card`,
      ),
  });
}
