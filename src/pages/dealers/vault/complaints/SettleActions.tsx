import * as React from 'react';

import { Button, Input, useToast } from '@/components/ui';
import { useSettleComplaint } from '@/hooks/api/useComplaints';
import { ApiError } from '@/lib/api';
import type { ComplaintAdminRow } from '@dk/shared';
import type { ComplaintSettleInput } from '@dk/shared/schemas';

/**
 * The buttons that fit what a complaint is stuck on. None of them presses anything
 * on the portal: they record what a person saw there, or ask the dealer a question.
 *
 *  - unclear press: Submit was pressed and the answer was lost. "It was filed as #…"
 *    (needs the number) or "It was not filed".
 *  - unclear acknowledgement: "Acknowledged on portal" / "Not acknowledged".
 *  - a complaint found on the portal that the engineer has fixed: "Ask the dealer if
 *    it's fixed" sends the dealer the same question as for their own complaints.
 *  - any other attention flag: "Clear". Never offered on an unclear press or
 *    acknowledgement: clearing would leave the complaint stuck with no way to settle it.
 */
export function SettleActions({ row }: { row: ComplaintAdminRow }) {
  const settle = useSettleComplaint();
  const toast = useToast();
  const [no, setNo] = React.useState('');

  function send(body: ComplaintSettleInput, done: string) {
    settle.mutate(
      { dealerId: row.dealerId, complaintId: row.id, body },
      {
        onSuccess: () => toast.success(done),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not record it'),
      },
    );
  }

  // Stage 'unclear' only ever means a lost Submit answer, so it keeps its settle buttons
  // even when the flag was already cleared (or the dealer's box spins on "Filing" for good
  // with nothing to press). 'acknowledging' is also the normal in-flight stage, so the
  // acknowledgement buttons need the unclear_ack flag as well.
  const unclearPress = row.stage === 'unclear' || row.attention === 'unclear_press';
  const unclearAck = row.stage === 'acknowledging' && row.attention === 'unclear_ack';
  const canAsk = row.canAskDealer;
  const canClear = !!row.attention && !unclearPress && !unclearAck;
  if (!unclearPress && !unclearAck && !canAsk && !canClear) return null;

  const numberOk = /^[A-Za-z0-9-]{3,40}$/.test(no.trim());
  return (
    <div className="grid gap-3 rounded-md border border-border bg-surface-2 p-3">
      {unclearPress ? (
        <div className="grid gap-2">
          <p className="text-sm text-text">After checking the portal’s complaint list:</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-44">
              <Input
                aria-label="Complaint number on the portal"
                placeholder="Complaint number"
                value={no}
                onChange={(e) => setNo(e.target.value.replace(/[^A-Za-z0-9-]/g, ''))}
              />
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={settle.isPending || !numberOk}
              onClick={() =>
                send({ outcome: 'filed', number: no.trim() }, 'Recorded. The dealer is told it was filed.')
              }
            >
              It was filed as #{no.trim() || '…'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={settle.isPending}
              onClick={() => send({ outcome: 'not_filed' }, 'Recorded as not filed.')}
            >
              It was not filed
            </Button>
          </div>
        </div>
      ) : null}
      {unclearAck ? (
        <div className="grid gap-2">
          <p className="text-sm text-text">After checking the portal:</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={settle.isPending}
              onClick={() => send({ outcome: 'acknowledged' }, 'Recorded as acknowledged on the portal.')}
            >
              Acknowledged on portal
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={settle.isPending}
              onClick={() => send({ outcome: 'not_acknowledged' }, 'Recorded as not acknowledged.')}
            >
              Not acknowledged
            </Button>
          </div>
        </div>
      ) : null}
      {canAsk ? (
        <div className="grid gap-1">
          <p className="text-sm text-text-muted">
            The engineer marked this done on the portal. This sends the dealer “is it working now?”.
          </p>
          <div>
            <Button
              size="sm"
              variant="primary"
              disabled={settle.isPending}
              onClick={() => send({ outcome: 'ask_dealer' }, 'The dealer is being asked.')}
            >
              Ask the dealer if it’s fixed
            </Button>
          </div>
        </div>
      ) : null}
      {canClear ? (
        <div className={canAsk ? 'border-t border-border pt-3' : ''}>
          <Button
            size="sm"
            variant="secondary"
            disabled={settle.isPending}
            onClick={() => send({ outcome: 'clear_attention' }, 'Cleared.')}
          >
            Clear this flag
          </Button>
        </div>
      ) : null}
    </div>
  );
}
