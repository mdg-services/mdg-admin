import { PauseCircle, PlayCircle } from 'lucide-react';
import * as React from 'react';

import { Button, Card, CardContent, CardHeader, Dialog, Input, Label, useToast } from '@/components/ui';
import { useSetDealerPlacing, useSetGlobalPlacing } from '@/hooks/api/useFuelIndent';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { FuelIndentVaultView } from '@dk/shared';

import { datesText, draftLinesText, linesText } from './format';

/**
 * The team's brake on PLACING orders (ADR 0041, robustness pass of 13 Nov 2026):
 * pause this outlet, or (super-admins) every outlet, without a restart. Only
 * placing and cancelling stop; the portal is still read, and tankers are still
 * told. A yes an owner already gave is not acted on while paused: the owner is
 * told they can place it on the portal themselves. So before pausing, the dialog
 * lists the orders that are waiting on a yes right now — pausing drops them.
 */
export function PlacingControlCard({ view, dealerId }: { view: FuelIndentVaultView; dealerId: string }) {
  const isSuper = useIsSuperAdmin();
  const toast = useToast();
  const setDealer = useSetDealerPlacing(dealerId);
  const setGlobal = useSetGlobalPlacing();
  const [dialog, setDialog] = React.useState<null | 'dealer' | 'global'>(null);
  const [reason, setReason] = React.useState('');
  const [hours, setHours] = React.useState('');

  const c = view.control;
  if (!c) return null;
  const dealerPaused = c.dealerPlacingPaused;
  const globalOn = c.globalPlacingOn;
  // Orders an owner already said yes to (or is about to): a pause drops them.
  const atRisk: string[] = [
    ...view.orders
      .filter((o) => o.state === 'confirmed')
      .map((o) => `${linesText(o.lines)}${o.deliveryDates.length ? ` for ${datesText(o.deliveryDates)}` : ''} — the owner said yes; waiting to be placed`),
    ...view.drafts
      .filter((d) => d.state === 'awaiting_confirm')
      .map((d) => `${draftLinesText(d.lines)}${d.deliveryDate ? ` for ${datesText([d.deliveryDate])}` : ''} — read back; waiting for a yes`),
  ];

  const fail = (err: unknown, fallback: string) => toast.error(err instanceof ApiError ? err.message : fallback);
  const close = () => {
    setDialog(null);
    setReason('');
    setHours('');
  };

  function pauseDealer() {
    const h = Number(hours);
    const until = Number.isFinite(h) && h > 0 ? new Date(Date.now() + h * 3_600_000).toISOString() : null;
    setDealer.mutate(
      { placingPaused: true, until, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success('Placing is paused for this outlet. The portal is still checked.');
          close();
        },
        onError: (err) => fail(err, 'Could not pause placing'),
      },
    );
  }
  function resumeDealer() {
    setDealer.mutate(
      { placingPaused: false },
      {
        onSuccess: () => toast.success('Placing is back on for this outlet.'),
        onError: (err) => fail(err, 'Could not resume placing'),
      },
    );
  }
  function setEverywhere(placingOn: boolean) {
    setGlobal.mutate(
      { placingOn, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(placingOn ? 'Placing is back on everywhere.' : 'Placing is paused for every outlet.');
          close();
        },
        onError: (err) => fail(err, 'Could not change placing for every outlet'),
      },
    );
  }

  return (
    <Card>
      <CardContent>
        <CardHeader align="center">
          <p className="text-base font-semibold text-text">Placing orders through MDG</p>
          <p className="text-sm text-text-muted">
            Pausing stops only placing and cancelling. Orders are still checked and tankers still reported.
          </p>
        </CardHeader>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm text-text">
              {dealerPaused ? (
                <>
                  Paused for this outlet
                  {c.dealerUntil ? ` until ${formatDateTime(c.dealerUntil)}` : ''}
                  {c.dealerReason ? <span className="block text-text-muted">Why: {c.dealerReason}</span> : null}
                </>
              ) : (
                'On for this outlet'
              )}
            </div>
            {dealerPaused ? (
              <Button
                size="sm"
                variant="secondary"
                loading={setDealer.isPending}
                leftIcon={<PlayCircle width={14} height={14} strokeWidth={1.75} />}
                onClick={resumeDealer}
              >
                Resume placing
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<PauseCircle width={14} height={14} strokeWidth={1.75} />}
                onClick={() => setDialog('dealer')}
              >
                Pause placing
              </Button>
            )}
          </div>
          {isSuper || !globalOn ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <div className="min-w-0 text-sm text-text">
                {globalOn ? (
                  'On for every outlet'
                ) : (
                  <>
                    Paused for every outlet
                    {c.globalReason ? <span className="block text-text-muted">Why: {c.globalReason}</span> : null}
                  </>
                )}
              </div>
              {isSuper ? (
                globalOn ? (
                  <Button
                    size="sm"
                    variant="danger"
                    leftIcon={<PauseCircle width={14} height={14} strokeWidth={1.75} />}
                    onClick={() => setDialog('global')}
                  >
                    Pause everywhere
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={setGlobal.isPending}
                    leftIcon={<PlayCircle width={14} height={14} strokeWidth={1.75} />}
                    onClick={() => setEverywhere(true)}
                  >
                    Resume everywhere
                  </Button>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>

      <Dialog
        open={dialog !== null}
        onClose={() => (setDealer.isPending || setGlobal.isPending ? undefined : close())}
        title={dialog === 'global' ? 'Pause placing for every outlet?' : 'Pause placing for this outlet?'}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={setDealer.isPending || setGlobal.isPending}>
              Keep placing on
            </Button>
            <Button
              variant="danger"
              loading={setDealer.isPending || setGlobal.isPending}
              onClick={() => (dialog === 'global' ? setEverywhere(false) : pauseDealer())}
            >
              Pause placing
            </Button>
          </>
        }
      >
        <div className="grid gap-3 text-sm text-text">
          <p className="text-text-muted">
            Owners are told placing is paused and that they can place the order on the portal themselves. Checking the
            portal and telling them about tankers go on.
          </p>
          {dialog === 'dealer' ? <AtRiskList items={atRisk} /> : null}
          {dialog === 'global' ? (
            <p className="text-text-muted">
              Any yes an owner gives anywhere while this is on is not placed. Orders waiting on a yes at other outlets
              are not listed here.
            </p>
          ) : null}
          <div className="grid gap-1">
            <Label htmlFor="fuel-pause-reason">Why (for the team; owners do not see it)</Label>
            <Input id="fuel-pause-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </div>
          {dialog === 'dealer' ? (
            <div className="grid gap-1">
              <Label htmlFor="fuel-pause-hours">For how many hours (empty = until someone resumes it)</Label>
              <Input
                id="fuel-pause-hours"
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))}
              />
            </div>
          ) : null}
        </div>
      </Dialog>
    </Card>
  );
}

function AtRiskList({ items }: { items: string[] }) {
  if (items.length === 0) return <p>No order is waiting on an owner’s yes at this outlet right now.</p>;
  return (
    <div className="grid gap-1">
      <p className="font-medium">These will not be placed:</p>
      <ul className="grid gap-1">
        {items.map((t, i) => (
          <li key={i} className="break-words">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
