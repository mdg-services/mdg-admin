import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { DealerRecord, RecordType } from '@dk/shared';

export const dealerRecordsKey = (
  dealerId: string | null | undefined,
  type?: RecordType,
) => ['records', { dealerId, type }] as const;

export function useDealerRecords(
  dealerId: string | null | undefined,
  type?: RecordType,
) {
  return useQuery({
    queryKey: dealerRecordsKey(dealerId, type),
    queryFn: () =>
      api.get<DealerRecord[]>('/records', { dealerId, type }),
    enabled: !!dealerId,
    staleTime: 15_000,
  });
}
