import type { DealerRecord } from '@dk/shared';
import type { CreateRecordInput } from '@dk/shared/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useCreateRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRecordInput) =>
      api.post<DealerRecord>('/records', input),
    onSuccess: (record) => {
      qc.invalidateQueries({
        queryKey: ['records', { dealerId: record.dealerId }],
      });
      qc.invalidateQueries({ queryKey: ['records'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['conversation'] });
      qc.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}
