import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { dsrKeys } from '@/hooks/api/useDsr';
import { api, ApiError } from '@/lib/api';
import type { AiCheckKind, AiCheckView, AiHoldItem } from '@dk/shared';

/**
 * The AI report check (ADR 0031), per report.
 *
 * Read from the server every time, never off the report: the verdict is pinned
 * to the report's figures, and a regeneration elsewhere in the admin can make it
 * no longer apply while this screen is open.
 */
export const aiCheckKeys = {
  all: ['aiCheck'] as const,
  report: (kind: AiCheckKind, reportId: string | undefined) => ['aiCheck', kind, reportId] as const,
  holds: (limit: number) => ['aiCheck', 'holds', limit] as const,
};

function retryUnlessClientError(count: number, err: unknown): boolean {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
  return count < 1;
}

/** States in which the verdict is still coming. The screen polls through them. */
export function aiCheckPending(view: AiCheckView | null | undefined): boolean {
  return view?.state === 'CHECKING' || view?.state === 'NOT_CHECKED';
}

export function useAiCheck(kind: AiCheckKind, reportId: string | undefined) {
  return useQuery({
    queryKey: aiCheckKeys.report(kind, reportId),
    queryFn: () => api.get<AiCheckView>(`/ai-checks/${kind}/${reportId}`),
    enabled: !!reportId,
    retry: retryUnlessClientError,
    staleTime: 15_000,
    // A check takes a minute or two. Every five seconds while it runs, so the
    // verdict lands on screen without a reload; nothing once it has.
    refetchInterval: (q) => (aiCheckPending(q.state.data) ? 5_000 : false),
  });
}

/** Everything the AI check is holding, across outlets. */
export function useAiHolds(limit = 50) {
  return useQuery({
    queryKey: aiCheckKeys.holds(limit),
    queryFn: () => api.get<AiHoldItem[]>(`/ai-checks/holds?limit=${limit}`),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Every screen that offers a Send reads the AI check, so every one is refreshed
 * when an answer to it changes: the report's own panel, the DSR and Credit & DOD
 * screens that render the Share buttons, and the Today page's one-tap sends.
 */
function useRefreshAfter() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: aiCheckKeys.all });
    void qc.invalidateQueries({ queryKey: dsrKeys.all });
    void qc.invalidateQueries({ queryKey: ['creditDodSnapshot'] });
    void qc.invalidateQueries({ queryKey: ['creditDodSnapshots'] });
    void qc.invalidateQueries({ queryKey: ['overview'] });
  };
}

export function useRerunAiCheck(kind: AiCheckKind, reportId: string) {
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: () => api.post<AiCheckView>(`/ai-checks/${kind}/${reportId}/rerun`, {}),
    onSuccess: refresh,
  });
}

export interface AiAcknowledgeInput {
  problemIds: string[];
  note?: string;
  remember?: boolean;
  /** "Was the AI right to raise this?" — optional. */
  aiWasRight?: boolean;
}

/** "The AI missed something" on a checked report. */
export function useReportAiMiss(kind: AiCheckKind, reportId: string) {
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: (note: string) => api.post<AiCheckView>(`/ai-checks/${kind}/${reportId}/missed`, { note }),
    onSuccess: refresh,
  });
}

export function useAcknowledgeAiCheck(kind: AiCheckKind, reportId: string) {
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: (input: AiAcknowledgeInput) =>
      api.post<AiCheckView>(`/ai-checks/${kind}/${reportId}/acknowledge`, input),
    onSuccess: refresh,
  });
}
