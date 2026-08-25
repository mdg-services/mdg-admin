import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  IrasCredentialsStatus,
  RevealedPortalCredentials,
} from '@/types/serviceRun';

export interface SetIrasCredentialsInput {
  username: string;
  password: string;
}

export function useIrasCredentialsStatus(dealerId: string | undefined) {
  return useQuery({
    queryKey: ['irasCredentials', dealerId],
    queryFn: () =>
      api.get<IrasCredentialsStatus>(
        `/dealers/${dealerId}/iras-credentials/status`,
      ),
    enabled: !!dealerId,
  });
}

export function useSetIrasCredentials(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetIrasCredentialsInput) =>
      api.put<IrasCredentialsStatus>(
        `/dealers/${dealerId}/iras-credentials`,
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['irasCredentials', dealerId] });
    },
  });
}

export function useClearIrasCredentials(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.del<{ id?: string }>(`/dealers/${dealerId}/iras-credentials`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['irasCredentials', dealerId] });
    },
  });
}

/**
 * Reveal the stored IRAS password in plaintext (any admin; audited and rate
 * limited server-side, and refused for an archived dealer). A mutation
 * rather than a query so the plaintext is never cached or refetched — see
 * `useRevealSdmsCredentials`.
 */
export function useRevealIrasCredentials(dealerId: string) {
  return useMutation({
    mutationFn: () =>
      api.post<RevealedPortalCredentials>(
        `/dealers/${dealerId}/iras-credentials/reveal`,
      ),
  });
}
