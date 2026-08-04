import { Archive, AlertTriangle, RotateCcw } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Dialog,
  useToast,
} from '@/components/ui';
import { useArchiveDealer, useRestoreDealer } from '@/hooks/api/useDealers';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Dealer } from '@dk/shared';

interface Props {
  dealer: Dealer;
}

/**
 * Super-admin archive / restore for a dealer.
 *
 * Rendered only for super-admins, but that is presentation: the backend's
 * `requireSuperAdmin` is the real gate, and `useIsSuperAdmin` can briefly read
 * false while `/auth/me` is in flight.
 *
 * Lives at the bottom of the Info tab, directly above the audit accordion, so
 * the action and its record sit together.
 */
export function DealerDangerZone({ dealer }: Props) {
  const toast = useToast();
  const archive = useArchiveDealer();
  const restore = useRestoreDealer();
  const [confirming, setConfirming] = React.useState<null | 'archive' | 'restore'>(null);

  const busy = archive.isPending || restore.isPending;
  const isArchived = !!dealer.archivedAt;

  async function run(kind: 'archive' | 'restore') {
    try {
      if (kind === 'archive') {
        await archive.mutateAsync(dealer.id);
        toast.success('Dealer archived');
      } else {
        await restore.mutateAsync(dealer.id);
        toast.success('Dealer restored');
      }
      setConfirming(null);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : `Could not ${kind} this dealer`;
      toast.error(msg);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{isArchived ? 'Archived dealer' : 'Danger zone'}</CardTitle>
          <CardSubtitle>
            {isArchived
              ? 'This dealer is deleted but recoverable.'
              : 'Delete this dealer. Reversible — nothing is destroyed.'}
          </CardSubtitle>
        </div>
        <AlertTriangle
          width={18}
          height={18}
          strokeWidth={1.75}
          className={isArchived ? 'text-text-muted' : 'text-danger'}
        />
      </CardHeader>
      <CardContent>
        {isArchived ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-muted">
              Archived on {formatDateTime(dealer.archivedAt ?? undefined)}. Restoring brings it
              back into the dealer list and lets its team sign in again. The status
              stays <span className="font-medium text-text">Suspended</span> and its
              services stay paused until you turn them back on.
            </p>
            <Button
              variant="secondary"
              onClick={() => setConfirming('restore')}
              loading={busy}
              leftIcon={<RotateCcw width={16} height={16} strokeWidth={1.75} />}
            >
              Restore dealer
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-muted">
              Deleting removes this dealer from the list, pauses every service and
              signs its team out. The record, documents, reports and chat history
              are all kept, and you can restore it at any time.
            </p>
            <Button
              variant="danger"
              onClick={() => setConfirming('archive')}
              loading={busy}
              leftIcon={<Archive width={16} height={16} strokeWidth={1.75} />}
            >
              Delete dealer
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog
        open={confirming === 'archive'}
        onClose={() => setConfirming(null)}
        title="Delete this dealer?"
        description={dealer.name ?? dealer.phone ?? dealer.code ?? 'This dealer'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => run('archive')}
              loading={archive.isPending}
            >
              Delete dealer
            </Button>
          </>
        }
      >
        <div className="grid gap-3 text-sm text-text-muted">
          <p>This will:</p>
          <ul className="list-disc pl-5">
            <li>Remove the dealer from the dealer list and the dashboard counts</li>
            <li>Pause every service, so no more automatic reports run for them</li>
            <li>Stop the owner and their team from signing in</li>
          </ul>
          <p className="font-medium text-text">
            Nothing is deleted. You can restore this dealer at any time.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={confirming === 'restore'}
        onClose={() => setConfirming(null)}
        title="Restore this dealer?"
        description={dealer.name ?? dealer.phone ?? dealer.code ?? 'This dealer'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button onClick={() => run('restore')} loading={restore.isPending}>
              Restore dealer
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">
          The dealer comes back into the list and its team can sign in again.
          Services stay paused and the status stays Suspended, so nothing starts
          running on its own — turn those back on when you are ready.
        </p>
      </Dialog>
    </Card>
  );
}
