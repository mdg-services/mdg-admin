import * as React from 'react';

import { Badge, Button, Card, CardContent, CardHeader, ConfirmDialog, useToast } from '@/components/ui';
import { useResetLetterhead } from '@/hooks/api/useWorkPermits';
import { ApiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import type { WorkPermitsDealerAdminView } from '@dk/shared';

import { LETTERHEAD_WORDS } from './format';

/** The outlet's SDMS dealer representatives and the vendors used; expired representatives in red. */
export function PeopleCard({ view }: { view: WorkPermitsDealerAdminView }) {
  return (
    <Card>
      <CardContent>
        <CardHeader align="center">
          <p className="text-base font-semibold text-text">Who can sign for the outlet</p>
          <p className="text-sm text-text-muted">
            Dealer representatives on SDMS and the vendors used before. An expired representative is asked about
            in the chat.
          </p>
        </CardHeader>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div className="grid content-start gap-1">
            <p className="font-medium text-text">Dealer representatives</p>
            {view.dealerReps.length === 0 ? (
              <p className="text-text-muted">None read yet. The first check reads them.</p>
            ) : (
              <ul className="grid gap-1">
                {view.dealerReps.map((r) => (
                  <li key={r.id} className="[overflow-wrap:anywhere]">
                    <span className={r.expired ? 'text-danger' : 'text-text'}>{r.name}</span>
                    {r.mobile ? <span className="text-text-muted"> · {r.mobile}</span> : null}
                    <span className={`block text-xs ${r.expired ? 'text-danger' : 'text-text-subtle'}`}>
                      {r.expired ? 'Expired' : 'Valid'}
                      {r.validTill ? ` · till ${formatDate(r.validTill)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid content-start gap-1">
            <p className="font-medium text-text">Vendors used</p>
            {view.vendors.length === 0 ? (
              <p className="text-text-muted">No vendor yet.</p>
            ) : (
              <ul className="grid gap-1">
                {view.vendors.map((v) => (
                  <li key={v.code} className="[overflow-wrap:anywhere]">
                    {v.name ?? v.code}
                    <span className="block text-xs text-text-subtle">
                      {v.name ? `${v.code} · ` : ''}
                      {v.lastUsedAt ? `last used ${formatDateTime(v.lastUsedAt)}` : 'not used yet'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** How the outlet signs the letters, what is on file, and a confirmed Reset. */
export function LetterheadCard({ dealerId, view }: { dealerId: string; view: WorkPermitsDealerAdminView }) {
  const toast = useToast();
  const reset = useResetLetterhead(dealerId);
  const [confirming, setConfirming] = React.useState(false);
  const kit = view.letterhead;
  const anything = kit.way !== null || kit.hasBlankLetterhead || kit.hasSignStamp;

  return (
    <Card>
      <CardContent>
        <CardHeader align="center">
          <p className="text-base font-semibold text-text">Letterhead for the Letter of Authorization</p>
          <p className="text-sm text-text-muted">
            {kit.updatedAt ? `Last changed ${formatDateTime(kit.updatedAt)}` : 'Not chosen yet. The dealer picks a way at the first permit.'}
          </p>
        </CardHeader>
        <div className="grid gap-3 text-sm">
          <p className="text-text">{kit.way ? LETTERHEAD_WORDS[kit.way] : 'No way chosen'}</p>
          <div className="flex flex-wrap gap-2">
            <Badge intent={kit.hasBlankLetterhead ? 'success' : 'neutral'}>
              {kit.hasBlankLetterhead ? 'Blank letterhead on file' : 'No blank letterhead'}
            </Badge>
            <Badge intent={kit.hasSignStamp ? 'success' : 'neutral'}>
              {kit.hasSignStamp ? 'Signature and stamp on file' : 'No signature and stamp'}
            </Badge>
          </div>
          <div>
            <Button
              size="sm"
              variant="secondary"
              disabled={!anything || reset.isPending}
              onClick={() => setConfirming(true)}
            >
              Reset
            </Button>
          </div>
        </div>
        <ConfirmDialog
          open={confirming}
          title="Reset the letterhead?"
          description="This forgets the chosen way and the photos on file. The dealer is asked to choose again at the next permit."
          confirmLabel="Yes, reset it"
          confirmVariant="danger"
          loading={reset.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            reset.mutate(undefined, {
              onSuccess: () => {
                toast.success('Letterhead reset.');
                setConfirming(false);
              },
              onError: (err) => {
                toast.error(err instanceof ApiError ? err.message : 'Could not reset the letterhead');
                setConfirming(false);
              },
            })
          }
        />
      </CardContent>
    </Card>
  );
}
