import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import * as React from 'react';


import { Button, useToast } from '@/components/ui';
import { dsrKeys, useGenerateDsr } from '@/hooks/api/useDsr';
import { api, ApiError } from '@/lib/api';
import type { ServiceRun } from '@dk/shared';

interface Props {
  dealerId: string;
  /** The day to (re)generate. Omit for today (IST). */
  businessDate?: string;
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  /** Fired once the POST is accepted, with the queued run id. */
  onQueued?: (runId: string) => void;
  className?: string;
}

/**
 * Generate a dealer's DSR and keep the button "Generating…" until the run
 * actually lands. The POST answers 202 immediately, so on its own the freshly
 * invalidated queries would re-fetch the OLD report; polling the run and
 * invalidating again on a terminal status is what makes the new report appear
 * without a manual refresh.
 *
 * Shared by the Vault list, the full report view and the dealer tab so all three
 * behave identically.
 */
export function GenerateDsrButton({
  dealerId,
  businessDate,
  label = 'Generate',
  variant = 'secondary',
  size = 'sm',
  icon,
  onQueued,
  className,
}: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const generate = useGenerateDsr();
  const [runId, setRunId] = React.useState<string | null>(null);

  // The dealer tab reuses this component across dealers instead of remounting,
  // so a run started for dealer A must be dropped when the view switches to B —
  // otherwise B's caches get invalidated and toasted for A's completion.
  const watched = React.useRef(dealerId);
  if (watched.current !== dealerId) {
    watched.current = dealerId;
    if (runId !== null) setRunId(null);
  }

  const poll = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api.get<ServiceRun>(`/runs/${runId}`),
    enabled: !!runId,
    retry: 2,
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      return st === 'SUCCESS' || st === 'FAILED' ? false : 2500;
    },
  });

  React.useEffect(() => {
    if (!runId || !poll.isError) return;
    // Lost sight of the run — it is still finishing server-side.
    setRunId(null);
    void qc.invalidateQueries({ queryKey: dsrKeys.all });
    toast.info(
      'Lost track of that run — it is probably still finishing. Refresh in a moment.',
    );
  }, [poll.isError, runId, qc, toast]);

  React.useEffect(() => {
    const st = poll.data?.status;
    if (!runId || (st !== 'SUCCESS' && st !== 'FAILED')) return;
    if (st === 'SUCCESS') {
      void qc.invalidateQueries({ queryKey: dsrKeys.all });
      toast.success('Report ready — it is showing below.');
    } else {
      toast.error(
        "The report could not be generated. Open the dealer's Run history for details.",
      );
    }
    setRunId(null);
  }, [poll.data?.status, runId, qc, toast]);

  const busy = generate.isPending || runId !== null;

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      loading={busy}
      leftIcon={
        icon ?? (
          <RefreshCw
            width={size === 'sm' ? 14 : 16}
            height={size === 'sm' ? 14 : 16}
            strokeWidth={1.75}
          />
        )
      }
      onClick={(e) => {
        e.stopPropagation();
        generate.mutate(
          { dealerId, businessDate },
          {
            onSuccess: (data) => {
              setRunId(data.runId);
              onQueued?.(data.runId);
              toast.success(
                'Generating the report — this updates when it lands.',
              );
            },
            onError: (err) =>
              toast.error(
                err instanceof ApiError
                  ? err.message
                  : 'Could not start the generation',
              ),
          },
        );
      }}
    >
      {busy ? 'Generating…' : label}
    </Button>
  );
}
