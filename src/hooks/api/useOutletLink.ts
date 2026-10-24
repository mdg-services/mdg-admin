import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { RegistrationLinkOption } from '@/lib/outlets';

/**
 * Who a registration could be added to as another outlet, or why not
 * (`GET /admin/registrations/:id/link-option`, any admin). Asked for only while
 * the Approve dialog shows a registration that is "already a client", and never
 * cached: the answer must be what the server would accept right now.
 *
 * Under the `onboarding` root, so the refresh after an approval drops it too.
 */
export function useRegistrationLinkOptionQuery(registrationId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['onboarding', 'link-option', registrationId] as const,
    queryFn: () => api.get<RegistrationLinkOption>(`/admin/registrations/${registrationId}/link-option`),
    enabled: enabled && !!registrationId,
    staleTime: 0,
    gcTime: 0,
  });
}
