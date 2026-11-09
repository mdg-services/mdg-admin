import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { PortalId, PortalLoginAskResult, PortalLoginState, PortalTankerView } from '@dk/shared';

// `useOnboarding` imports this file's keys, so its two roots are spelled out here
// rather than imported back (`onboardingRoot`, `outletSetupRoot`).
const ONBOARDING_ROOT = ['onboarding'] as const;
const OUTLET_SETUP_ROOT = ['outletSetup'] as const;

export const portalLoginKeys = {
  dealer: (dealerId: string | null | undefined) =>
    ['portalLogins', dealerId] as const,
  tanker: (dealerId: string | null | undefined) => ['portalLogins', dealerId, 'tanker'] as const,
};

/**
 * `GET /dealers/:id/portal-logins` — where the outlet's portal logins stand. It always
 * has SDMS and IRAS, plus a BPCL or HPCL row when the outlet needs one or has one saved,
 * so a caller shows only the outlet's company's (`loginsOfCompany` in `lib/portalLogin.ts`).
 * Only read while the ask dialog is open (`enabled`), and always fresh: the dialog's
 * pre-ticked boxes come from it.
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
 * explainer video, which only an SDMS or IRAS ask carries) into every owner's chat.
 * Answers 409 `NOTHING_TO_ASK` when no login is needed.
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

/**
 * `GET /dealers/:id/portal-logins/tanker` — the outlet's answer to "do you also own a
 * tanker?". A yes means the outlet also needs its IndianOil Partners login.
 */
export function useTankerAnswer(dealerId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: portalLoginKeys.tanker(dealerId),
    queryFn: () => api.get<PortalTankerView>(`/dealers/${dealerId}/portal-logins/tanker`),
    enabled: enabled && !!dealerId,
  });
}

/** `PUT /dealers/:id/portal-logins/tanker` — the team answers for the owner. Moves the logins step. */
export function useSetTankerAnswer(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (owns: boolean) => api.put<PortalTankerView>(`/dealers/${dealerId}/portal-logins/tanker`, { owns }),
    onSuccess: (view) => {
      qc.setQueryData(portalLoginKeys.tanker(dealerId), view);
      void qc.invalidateQueries({ queryKey: portalLoginKeys.dealer(dealerId) });
      void qc.invalidateQueries({ queryKey: OUTLET_SETUP_ROOT });
      void qc.invalidateQueries({ queryKey: ONBOARDING_ROOT });
    },
  });
}

/**
 * `POST /dealers/:id/portal-logins/partners/reset` — the team presses the owner's
 * "Forgot password?" for them: MDG fills IndianOil's reset page and IndianOil sends a new
 * password to the owner's registered mobile or email. The same daily limit as the owner's.
 */
export function useResetPartnersPassword(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PortalLoginState[]>(`/dealers/${dealerId}/portal-logins/partners/reset`, {}),
    onSuccess: (states) => {
      qc.setQueryData(portalLoginKeys.dealer(dealerId), states);
    },
  });
}
