import type { DealerService } from '@dk/shared';
import type {
  AttachServiceInput,
  RunNowInput,
  UpdateDealerServiceInput,
} from '@dk/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useDealerServicesQuery(dealerId: string | undefined) {
  return useQuery({
    queryKey: ['dealerServices', dealerId],
    queryFn: () => api.get<DealerService[]>(`/dealers/${dealerId}/services`),
    enabled: !!dealerId,
  });
}

export function useAttachDealerService(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AttachServiceInput) =>
      api.post<DealerService>(`/dealers/${dealerId}/services`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dealerServices', dealerId] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

export function useUpdateDealerService(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dsId,
      patch,
    }: {
      dsId: string;
      patch: UpdateDealerServiceInput;
    }) => api.patch<DealerService>(`/dealer-services/${dsId}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dealerServices', dealerId] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

export function useDeleteDealerService(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dsId: string) =>
      api.del<{ id: string }>(`/dealer-services/${dsId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dealerServices', dealerId] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

export function useRunNow(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dsId,
      body = {},
    }: {
      dsId: string;
      body?: RunNowInput;
    }) =>
      api.post<{ runId: string }>(
        `/dealer-services/${dsId}/run-now`,
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['dealerServices', dealerId] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}
