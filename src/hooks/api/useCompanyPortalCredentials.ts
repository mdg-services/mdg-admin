import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { CompanyPortalCredentialsStatus, RevealedPortalCredentials } from '@/types/serviceRun';
import type { SaveCompanyPortalLoginInput } from '@dk/shared/schemas';

import { onboardingRoot, outletSetupRoot } from './useOnboarding';
import { portalLoginKeys } from './usePortalLogins';

/** The two company portals: the one dealer portal of BPCL and of HPCL. */
export type CompanyPortalId = 'bpcl' | 'hpcl';

const path = (dealerId: string | undefined, portal: CompanyPortalId) =>
  `/dealers/${dealerId}/company-portal-credentials/${portal}`;

/**
 * A login saved or cleared moves the outlet's onboarding (the logins step, the
 * checklist, the Setup card), so those are read again too, as the SDMS and IRAS
 * hooks do.
 */
function refreshSetup(qc: QueryClient, dealerId: string) {
  void qc.invalidateQueries({ queryKey: outletSetupRoot });
  void qc.invalidateQueries({ queryKey: onboardingRoot });
  void qc.invalidateQueries({ queryKey: portalLoginKeys.dealer(dealerId) });
}

export const companyPortalCredentialsKey = (
  dealerId: string | undefined,
  portal: CompanyPortalId,
) => ['companyPortalCredentials', dealerId, portal] as const;

/**
 * `GET /dealers/:id/company-portal-credentials/:portal/status` — whether the outlet's
 * BPCL or HPCL portal login is saved, who typed it and when. Never the password.
 */
export function useCompanyPortalCredentialsStatus(
  dealerId: string | undefined,
  portal: CompanyPortalId,
) {
  return useQuery({
    queryKey: companyPortalCredentialsKey(dealerId, portal),
    queryFn: () => api.get<CompanyPortalCredentialsStatus>(`${path(dealerId, portal)}/status`),
    enabled: !!dealerId,
  });
}

/** `PUT /dealers/:id/company-portal-credentials/:portal` — an admin types the user ID and password. */
export function useSetCompanyPortalCredentials(dealerId: string, portal: CompanyPortalId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveCompanyPortalLoginInput) =>
      api.put<CompanyPortalCredentialsStatus>(path(dealerId, portal), input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyPortalCredentialsKey(dealerId, portal) });
      refreshSetup(qc, dealerId);
    },
  });
}

/** `DELETE /dealers/:id/company-portal-credentials/:portal` — forget the saved login. */
export function useClearCompanyPortalCredentials(dealerId: string, portal: CompanyPortalId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.del<{ hasCredentials: false }>(path(dealerId, portal)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyPortalCredentialsKey(dealerId, portal) });
      refreshSetup(qc, dealerId);
    },
  });
}

/**
 * Reveal the stored password in plaintext (any admin; audited and rate limited
 * server-side). A mutation, not a query, on purpose: the plaintext must never be
 * cached by TanStack Query, refetched in the background, or persisted — see
 * `useRevealSdmsCredentials`.
 */
export function useRevealCompanyPortalCredentials(dealerId: string, portal: CompanyPortalId) {
  return useMutation({
    mutationFn: () => api.post<RevealedPortalCredentials>(`${path(dealerId, portal)}/reveal`),
  });
}
