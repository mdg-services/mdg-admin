import * as React from 'react';

import { Button, ConfirmDialog, Input, useToast } from '@/components/ui';
import { useSettleWorkPermit } from '@/hooks/api/useWorkPermits';
import { ApiError } from '@/lib/api';
import type { WorkPermitAdminRow } from '@dk/shared';
import type { WorkPermitSettleInput } from '@dk/shared/schemas';

import { settleActions, type SettleActionId } from './format';

interface Pending {
  body: WorkPermitSettleInput;
  title: string;
  description: string;
  done: string;
  danger?: boolean;
}

/**
 * The buttons that fit what a permit is stuck on (see `settleActions`). Each one asks
 * for a confirm first. "Close now" asks the robot to close the permit on SDMS; the
 * others record what a person saw there.
 */
export function SettleActions({ row }: { row: WorkPermitAdminRow }) {
  const settle = useSettleWorkPermit();
  const toast = useToast();
  const [no, setNo] = React.useState('');
  const [pending, setPending] = React.useState<Pending | null>(null);

  const actions = settleActions(row);
  if (actions.length === 0) return null;
  const has = (a: SettleActionId) => actions.includes(a);
  const numberOk = /^[A-Za-z0-9/-]{3,40}$/.test(no.trim());

  function confirm() {
    if (!pending) return;
    const p = pending;
    settle.mutate(
      { dealerId: row.dealerId, permitId: row.id, body: p.body },
      {
        onSuccess: () => {
          toast.success(p.done);
          setPending(null);
        },
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : 'Could not record it');
          setPending(null);
        },
      },
    );
  }

  const ask = (p: Pending) => setPending(p);

  return (
    <div className="grid gap-3 rounded-md border border-border bg-surface-2 p-3">
      {has('found') ? (
        <div className="grid gap-2">
          <p className="text-sm text-text">After checking the Non-Critical permit list on SDMS:</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-44">
              <Input
                aria-label="Permit number on SDMS"
                placeholder="Permit number"
                value={no}
                onChange={(e) => setNo(e.target.value.replace(/[^A-Za-z0-9/-]/g, ''))}
              />
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={settle.isPending || !numberOk}
              onClick={() =>
                ask({
                  body: { outcome: 'issued', number: no.trim() },
                  title: 'Found it on SDMS?',
                  description: `This records the permit as issued with number ${no.trim()}. The dealer is told it is ready.`,
                  done: 'Recorded as issued.',
                })
              }
            >
              Found it on SDMS
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={settle.isPending}
              onClick={() =>
                ask({
                  body: { outcome: 'not_issued' },
                  title: 'Not on SDMS?',
                  description: 'This records the permit as not issued. The dealer is told it did not go through.',
                  done: 'Recorded as not issued.',
                })
              }
            >
              Not on SDMS
            </Button>
          </div>
        </div>
      ) : null}
      {has('close_now') || has('closed_on_sdms') ? (
        <div className="grid gap-2">
          <p className="text-sm text-text-muted">
            The work is done. “Close now” asks the robot to close it on SDMS; “Closed on SDMS” is for when someone already did.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={settle.isPending}
              onClick={() =>
                ask({
                  body: { outcome: 'close_now' },
                  title: 'Close this permit now?',
                  description: 'The robot signs in to SDMS and closes the permit with today’s time.',
                  done: 'Closing it now.',
                })
              }
            >
              Close now
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={settle.isPending}
              onClick={() =>
                ask({
                  body: { outcome: 'closed' },
                  title: 'Already closed on SDMS?',
                  description: 'This only records that the permit is closed. Nothing is sent to SDMS.',
                  done: 'Recorded as closed.',
                })
              }
            >
              Closed on SDMS
            </Button>
          </div>
        </div>
      ) : null}
      {has('clear_flag') ? (
        <div className={has('close_now') || has('found') ? 'border-t border-border pt-3' : ''}>
          <Button
            size="sm"
            variant="secondary"
            disabled={settle.isPending}
            onClick={() =>
              ask({
                body: { outcome: 'clear_attention' },
                title: 'Clear this flag?',
                description: 'The permit stays as it is; it only stops showing as needing a person.',
                done: 'Cleared.',
              })
            }
          >
            Clear flag
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        description={pending?.description}
        confirmLabel="Yes, do it"
        loading={settle.isPending}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      />
    </div>
  );
}
