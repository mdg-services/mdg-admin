import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { PortalId, PortalLoginAskResult, PortalLoginState } from '@dk/shared';

export const portalLoginKeys = {
  dealer: (dealerId: string | null | undefined) =>
    ['portalLogins', dealerId] as const,
};

/**
 * `GET /dealers/:id/portal-logins` — where the outlet's SDMS and IRAS logins
 * stand. Only read while the ask dialog is open (`enabled`), and always fresh:
 * the dialog's pre-ticked boxes come from it.
 */
export function usePortalLogins(dealerId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: portalLoginKeys.dealer(dealerId),
    queryFn: () => api.get<PortalLoginState[]>(`/dealers/${dealerId}/portal-logins`),
    enabled: enabled && !!dealerId,
    staleTime: 0,
    gcTime: 0,
  });
}

export interface AskPortalLoginInput {
  portals: PortalId[];
  withVideo: boolean;
}

/**
 * `POST /dealers/:id/portal-login/ask` — puts the login box (and, if asked, the
 * explainer video) into every owner's chat. Answers 409 `NOTHING_TO_ASK` when
 * no login is needed.
 */
export function useAskPortalLogin(dealerId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AskPortalLoginInput) =>
      api.post<PortalLoginAskResult>(`/dealers/${dealerId}/portal-login/ask`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: portalLoginKeys.dealer(dealerId) });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
