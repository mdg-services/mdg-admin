import { useToast } from '@/components/ui';
import { useCalibrationClaimAction } from '@/hooks/api/useCalibrationClaim';
import { ApiError } from '@/lib/api';
import type { CalibrationClaimActionInput } from '@dk/shared/schemas';

/**
 * What every button on a claim calls: post one action, say how it went.
 *
 * One mutation sits behind all of them, so only one action is in flight at a time
 * on this pane — a second press while the first is out would race it on the same
 * claim — and `busy(type)` lets each button show its own spinner while the others
 * simply go dead. A dialog passes `onDone` to close itself on success; on a
 * failure it stays open with what was typed still in it, and the server's own
 * sentence is the toast.
 *
 * The one failure that is different is a refusal because the claim moved on (the
 * server answers 409: the values changed, a run started, the stage is past it). The
 * pane is re-read at once (`useCalibrationClaimAction`), so what is on screen was
 * out of date; a dialog that was built from it passes `onRefused` to close itself,
 * so the next press opens on the claim as it is now.
 */
export interface ClaimRunner {
  run: (
    claimId: string,
    action: CalibrationClaimActionInput,
    successText: string,
    onDone?: () => void,
    onRefused?: () => void,
  ) => void;
  /** True while an action of this type is in flight; with no type, while any is. */
  busy: (type?: CalibrationClaimActionInput['type']) => boolean;
}

export function useClaimRunner(dealerId: string): ClaimRunner {
  const toast = useToast();
  const mutation = useCalibrationClaimAction(dealerId);

  return {
    run(claimId, action, successText, onDone, onRefused) {
      mutation.mutate(
        { claimId, action },
        {
          onSuccess: () => {
            toast.success(successText);
            onDone?.();
          },
          onError: (err) => {
            toast.error(
              err instanceof ApiError ? err.message : 'Could not do that. Please try again.',
            );
            if (err instanceof ApiError && err.status === 409) onRefused?.();
          },
        },
      );
    },
    busy(type) {
      return mutation.isPending && (type === undefined || mutation.variables?.action.type === type);
    },
  };
}
