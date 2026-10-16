import * as React from 'react';

import { useToast } from '@/components/ui';

import { shareToastSpec, type ShareResult } from './shareToast';

/**
 * `(message, result) => void`: raises the toast for a send. Green when the send
 * reached everyone it was asked to; a warning that stays about 12 seconds when
 * `result.notReached` is not empty (see {@link shareToastSpec}).
 *
 * `message` already carries the `notReached` sentences when it came from
 * `shareResultMessage` — pass it as it is and do not add them again.
 */
export function useShareToast(): (
  message: string,
  result: Pick<ShareResult, 'notReached'> | undefined,
) => void {
  const toast = useToast();
  return React.useCallback(
    (message, result) => {
      const spec = shareToastSpec(message, result);
      toast.toast({
        intent: spec.intent,
        title: spec.title,
        ...(spec.duration ? { duration: spec.duration } : {}),
      });
    },
    [toast],
  );
}
