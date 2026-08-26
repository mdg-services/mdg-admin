import { Archive, AlertTriangle, RotateCcw } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  ConfirmDialog,
  useToast,
} from '@/components/ui';
import { useArchiveDealer, useRestoreDealer } from '@/hooks/api/useDealers';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { dealerCodeLabel, type Dealer } from '@dk/shared';

interface Props {
  dealer: Dealer;
}

export type DealerArchiveAction = 'archive' | 'restore';

export interface DealerArchiveDialogsProps {
  dealer: Dealer;
  /** Which confirmation to show, or null for none. */
  action: DealerArchiveAction | null;
  onClose: () => void;
}

/**
 * The archive / restore confirmations and the mutations behind them.
 *
 * Split out of the card below because the dealer page's overflow menu offers the
 * same action from the tab strip: two entry points, one implementation. Whoever
 * renders this owns the open state, so each mount drives exactly one dialog and
 * there is no ambient "which one is open" to get out of sync.
 */
export function DealerArchiveDialogs({
  dealer,
  action,
  onClose,
}: DealerArchiveDialogsProps) {
  const toast = useToast();
  const archive = useArchiveDealer();
  const restore = useRestoreDealer();

  async function run(kind: DealerArchiveAction) {
    try {
      if (kind === 'archive') {
        await archive.mutateAsync(dealer.id);
        toast.success('Dealer archived');
      } else {
        await restore.mutateAsync(dealer.id);
        toast.success('Dealer restored');
      }
      onClose();
    } catch (err) {
      // Leave the dialog open on failure — the message says what went wrong and
      // the confirm button is still there to retry.
      const msg =
        err instanceof ApiError
          ? err.message
          : `Could not ${kind} this dealer`;
      toast.error(msg);
    }
  }

  // Both go through the shared `ConfirmDialog` rather than repeating its shape:
  // it supplies the Cancel/confirm footer, keeps the destructive button red and
  // last, and — the part that matters on a phone — inherits `Dialog`'s bottom
  // sheet, its internal scroll and a footer that stays above the keyboard and
  // the safe area.
  return (
    <>
      <ConfirmDialog
        open={action === 'archive'}
        onCancel={onClose}
        onConfirm={() => void run('archive')}
        title="Delete this dealer?"
        // `size="md"` restores the `max-w-lg` panel the hand-rolled Dialog this
        // replaced had, so adopting the primitive is a no-op at md.
        size="md"
        confirmLabel="Delete dealer"
        confirmVariant="danger"
        loading={archive.isPending}
        description={
          <div className="grid gap-3">
            <p className="font-medium text-text">
              {dealerCodeLabel(dealer.code)}
            </p>
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
        }
      />

      <ConfirmDialog
        open={action === 'restore'}
        onCancel={onClose}
        onConfirm={() => void run('restore')}
        title="Restore this dealer?"
        size="md"
        confirmLabel="Restore dealer"
        loading={restore.isPending}
        description={
          <div className="grid gap-3">
            <p className="font-medium text-text">
              {dealerCodeLabel(dealer.code)}
            </p>
            <p>
              The dealer comes back into the list and its team can sign in
              again. Services stay paused and the status stays Suspended, so
              nothing starts running on its own — turn those back on when you
              are ready.
            </p>
          </div>
        }
      />
    </>
  );
}

/**
 * Super-admin archive / restore for a dealer.
 *
 * Rendered only for super-admins, but that is presentation: the backend's
 * `requireSuperAdmin` is the real gate, and `useIsSuperAdmin` can briefly read
 * false while `/auth/me` is in flight.
 *
 * Lives at the bottom of the Info tab, directly above the audit accordion, so
 * the action and its record sit together. The buttons only open a confirmation,
 * so they carry no busy state of their own — the dialog's confirm button is
 * where the mutation is visible.
 */
export function DealerDangerZone({ dealer }: Props) {
  const [confirming, setConfirming] = React.useState<DealerArchiveAction | null>(
    null,
  );

  const isArchived = !!dealer.archivedAt;

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
              leftIcon={<Archive width={16} height={16} strokeWidth={1.75} />}
            >
              Delete dealer
            </Button>
          </div>
        )}
      </CardContent>

      <DealerArchiveDialogs
        dealer={dealer}
        action={confirming}
        onClose={() => setConfirming(null)}
      />
    </Card>
  );
}
