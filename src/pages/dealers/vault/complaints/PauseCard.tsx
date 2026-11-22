import { PauseCircle, PlayCircle } from 'lucide-react';
import * as React from 'react';

import { Button, Card, CardContent, CardHeader, Dialog, Input, Label, useToast } from '@/components/ui';
import { useSetComplaintsControl } from '@/hooks/api/useComplaints';
import { ApiError } from '@/lib/api';

/**
 * The team's brake for ONE outlet. While paused nothing is filed or acknowledged for
 * the outlet; what is already on the portal stays there. Pausing does not delete anything.
 */
export function PauseCard({
  dealerId,
  pausedByTeam,
  serviceActive,
}: {
  dealerId: string;
  pausedByTeam: boolean;
  serviceActive: boolean;
}) {
  const toast = useToast();
  const set = useSetComplaintsControl(dealerId);
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');

  const fail = (err: unknown, fallback: string) =>
    toast.error(err instanceof ApiError ? err.message : fallback);

  function pause() {
    set.mutate(
      { paused: true, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success('Complaints are paused for this outlet.');
          setOpen(false);
          setReason('');
        },
        onError: (err) => fail(err, 'Could not pause'),
      },
    );
  }
  function resume() {
    set.mutate(
      { paused: false },
      {
        onSuccess: () => toast.success('Complaints are back on for this outlet.'),
        onError: (err) => fail(err, 'Could not resume'),
      },
    );
  }

  return (
    <Card>
      <CardContent>
        <CardHeader align="center">
          <p className="text-base font-semibold text-text">Filing complaints through MDG</p>
          <p className="text-sm text-text-muted">
            Pausing stops filing and acknowledging for this outlet. Nothing already on the portal is touched.
          </p>
        </CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 text-sm text-text">
            {pausedByTeam
              ? 'Paused for this outlet'
              : !serviceActive
                ? 'The Complaints service is not active for this outlet. Switch it on from the Services tab.'
                : 'On for this outlet'}
          </p>
          {pausedByTeam ? (
            <Button
              size="sm"
              variant="secondary"
              loading={set.isPending}
              leftIcon={<PlayCircle width={14} height={14} strokeWidth={1.75} />}
              onClick={resume}
            >
              Resume
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<PauseCircle width={14} height={14} strokeWidth={1.75} />}
              onClick={() => setOpen(true)}
            >
              Pause
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog
        open={open}
        onClose={() => (set.isPending ? undefined : setOpen(false))}
        title="Pause complaints for this outlet?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={set.isPending}>
              Keep it on
            </Button>
            <Button variant="danger" loading={set.isPending} onClick={pause}>
              Pause
            </Button>
          </>
        }
      >
        <div className="grid gap-3 text-sm text-text">
          <p className="text-text-muted">
            A complaint the dealer has already said yes to is not filed while this is on. Reading the portal and the
            dealer’s chat go on as before.
          </p>
          <div className="grid gap-1">
            <Label htmlFor="complaints-pause-reason">Why (for the team; the dealer does not see it)</Label>
            <Input
              id="complaints-pause-reason"
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
      </Dialog>
    </Card>
  );
}
