import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { SdmsCredentialsStatus, SdmsDealerType } from '@/types/serviceRun';

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
    },
  });
}
