import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  RevealedPortalCredentials,
  SdmsCredentialsStatus,
  SdmsDealerType,
} from '@/types/serviceRun';

import { onboardingRoot, outletSetupRoot } from './useOnboarding';

/**
 * A login saved or cleared moves the outlet's onboarding (the logins step, the
 * checklist, the Setup card), so those are read again too. Matters most from the
 * "Enter logins" form on the Setup card, which has no other way to know.
 */
function refreshSetup(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: outletSetupRoot });
  void qc.invalidateQueries({ queryKey: onboardingRoot });
}

export interface SetSdmsCredentialsInput {
  username: string;
  password: string;
  dealerType: SdmsDealerType;
}

export function useSdmsCredentialsStatus(dealerId: string | undefined) {
  return useQuery({
    queryKey: ['sdmsCredentials', dealerId],
    queryFn: () =>
      api.get<SdmsCredentialsStatus>(
        `/dealers/${dealerId}/sdms-credentials/status`,
      ),
    enabled: !!dealerId,
  });
}

export function useSetSdmsCredentials(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetSdmsCredentialsInput) =>
      api.put<SdmsCredentialsStatus>(
        `/dealers/${dealerId}/sdms-credentials`,
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sdmsCredentials', dealerId] });
      refreshSetup(qc);
    },
  });
}

export function useClearSdmsCredentials(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.del<{ id?: string }>(`/dealers/${dealerId}/sdms-credentials`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sdmsCredentials', dealerId] });
      refreshSetup(qc);
    },
  });
}

/**
 * Reveal the stored SDMS password in plaintext (any admin; audited and rate
 * limited server-side, and refused for an archived dealer).
 *
 * A mutation, not a query, on purpose: the plaintext must never be cached by
 * TanStack Query, refetched in the background, or persisted. Each reveal is an
 * explicit, audited, rate-limited action.
 */
export function useRevealSdmsCredentials(dealerId: string) {
  return useMutation({
    mutationFn: () =>
      api.post<RevealedPortalCredentials>(
        `/dealers/${dealerId}/sdms-credentials/reveal`,
      ),
  });
}
