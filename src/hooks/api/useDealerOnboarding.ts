import type { Dealer, DealerOnboarding, OnboardingStepId } from '@dk/shared';
import type { StepReopenInput } from '@dk/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useDealerOnboardingQuery(dealerId: string | undefined) {
  return useQuery({
    queryKey: ['dealerOnboarding', dealerId],
    queryFn: () => api.get<DealerOnboarding>(`/dealers/${dealerId}/onboarding`),
    enabled: !!dealerId,
  });
}

export function useNextCodeQuery(dealerId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['dealerOnboarding', dealerId, 'next-code'],
    queryFn: () =>
      api.get<{ suggestion: string }>(`/dealers/${dealerId}/onboarding/next-code`),
    enabled: !!dealerId && enabled,
  });
}

export function useStepCompleteMutation(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      stepId,
      payload,
    }: {
      stepId: OnboardingStepId;
      payload: Record<string, unknown>;
    }) =>
      api.post<Dealer>(
        `/dealers/${dealerId}/onboarding/steps/${stepId}/complete`,
        payload,
      ),
    onSuccess: (data) => {
      qc.setQueryData(['dealer', data.id], data);
      qc.invalidateQueries({ queryKey: ['dealerOnboarding', data.id] });
      qc.invalidateQueries({ queryKey: ['dealerAudit', data.id] });
      qc.invalidateQueries({ queryKey: ['dealers'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

export function useStepReopenMutation(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      stepId,
      body,
    }: {
      stepId: OnboardingStepId;
      body: StepReopenInput;
    }) =>
      api.post<Dealer>(
        `/dealers/${dealerId}/onboarding/steps/${stepId}/reopen`,
        body,
      ),
    onSuccess: (data) => {
      qc.setQueryData(['dealer', data.id], data);
      qc.invalidateQueries({ queryKey: ['dealerOnboarding', data.id] });
      qc.invalidateQueries({ queryKey: ['dealerAudit', data.id] });
      qc.invalidateQueries({ queryKey: ['dealers'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}
