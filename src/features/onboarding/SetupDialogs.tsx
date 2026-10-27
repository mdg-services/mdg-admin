import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  Dialog,
  FieldError,
  Input,
  Label,
  Textarea,
  useToast,
} from '@/components/ui';
import { useDealerServicesQuery } from '@/hooks/api/useDealerServices';
import { useChangeWatch, useOutletSetupQuery, useStartServices } from '@/hooks/api/useOnboarding';
import { usePortalLogins } from '@/hooks/api/usePortalLogins';
import {
  DEFAULT_WATCH_DAYS,
  MAX_WATCH_DAYS,
  OVERRIDE_REASON_MAX,
  PORTAL_LABEL,
  type DealerTabId,
  extendProblem,
  startBody,
  startProblem,
  watchBody,
} from '@/lib/onboarding';
import { serviceLabel } from '@/lib/serviceLabel';
import { CHECKLIST_LABEL, checklistOpenKeys, missingChecklist, startNeedsReason } from '@/lib/watchHold';
import { dealerCodeLabel, type OutletSetupAdmin, type PortalId } from '@dk/shared';

import { DealerTabLink } from './DealerTabLink';
import { SetupChecklist } from './SetupChecklist';

/**
 * The forms behind MDG's taps after the payment: starting the services and
 * extending a watch. (The bill, the payment and the pause are in `BillingDialogs`.)
 *
 * They share one shape. `outlet` is the outlet the form is about, `null` is
 * closed. Each export is a thin wrapper that mounts the real form, keyed on the
 * outlet's id, only while one is open: its fields start from `useState`
 * initialisers, so a different outlet gets a fresh form and, above all, the
 * board refreshing underneath (a new `outlet` object every time) never resets
 * what the person is typing. A rule that says no (`lib/onboarding.ts`) disables
 * the button and, once the person has touched the form, says why in words; and a
 * failure comes back from the server as a toast, with the form left open so the
 * retry is one more tap.
 *
 * Nothing here messages the dealer. The bill is sent by the team on WhatsApp,
 * outside the app: this records that it went, and the app then shows the dealer
 * the amount and the due date and nothing else.
 */

type Props = {
  outlet: OutletSetupAdmin | null;
  onClose: () => void;
  /** On the dealer's own page: switch its tab instead of following a link (see `DealerTabLink`). */
  onGoToTab?: (tab: DealerTabId) => void;
};
type FormProps = {
  outlet: OutletSetupAdmin;
  onClose: () => void;
  onGoToTab?: ((tab: DealerTabId) => void) | undefined;
};

export const errorText = (err: unknown) =>
  err instanceof Error && err.message ? err.message : 'That did not go through.';

/** The line that says which outlet a form is for, the same on every form. */
export function ForOutlet({ outlet }: { outlet: OutletSetupAdmin }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 [overflow-wrap:anywhere]">
      <p className="text-sm font-medium text-text">
        {dealerCodeLabel(outlet.code)}
        {outlet.ownerName ? (
          <span className="font-normal text-text-muted"> · {outlet.ownerName}</span>
        ) : null}
      </p>
    </div>
  );
}

// ── Start services ──────────────────────────────────────────────────────────

/**
 * Start the outlet's services. From "ready to set up" it is one tap; from the
 * bill or logins stage it is the API's override, and a reason is required.
 */
export function StartServicesDialog({ outlet, onClose, onGoToTab }: Props) {
  return outlet ? (
    <StartServicesForm
      key={outlet.dealerId}
      outlet={outlet}
      onClose={onClose}
      onGoToTab={onGoToTab}
    />
  ) : null;
}

function StartServicesForm({ outlet, onClose, onGoToTab }: FormProps) {
  const toast = useToast();
  const start = useStartServices();
  const logins = usePortalLogins(outlet.dealerId, true);
  // What the team has attached, read fresh: there is no choice to show, the outlet gets whatever
  // is attached in the Services tab (the checklist's "Services attached" reads the same).
  const attached = useDealerServicesQuery(outlet.dealerId);
  const daysId = React.useId();
  const reasonId = React.useId();
  const [days, setDays] = React.useState(String(DEFAULT_WATCH_DAYS));
  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const early = outlet.stage !== 'setup';
  // ── watch hold ── "ready to start?", read fresh: the board only carries it for outlets at
  // "setting up". Starting with a line open is allowed but needs a reason, as the server says.
  const fresh = useOutletSetupQuery(outlet.dealerId);
  const checklist = fresh.data?.checklist ?? outlet.checklist;
  const openLines = missingChecklist(checklist);
  const needsReason = startNeedsReason(outlet.stage, checklist);
  const anyway = early || openLines.length > 0;
  const form = { watchDays: days, reason, needsReason };
  const problem = startProblem(form);

  async function submit() {
    if (start.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      await start.mutateAsync({ dealerId: outlet.dealerId, body: startBody(form) });
      toast.success(`${dealerCodeLabel(outlet.code)}: services started.`);
      onClose();
    } catch (err) {
      // The list moved under the form (a line was open when the server looked).
      const keys = checklistOpenKeys(err);
      toast.error(
        keys
          ? `Not ready yet${keys.length ? `: ${keys.map((k) => CHECKLIST_LABEL[k]).join(', ')}` : ''}. Give a reason to start anyway.`
          : errorText(err),
      );
    }
  }

  const loginStatus = (portal: PortalId) => logins.data?.find((l) => l.portal === portal)?.status;

  return (
    <Dialog
      open
      onClose={onClose}
      title={anyway ? 'Start anyway' : 'Start services'}
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={start.isPending}>
            {anyway ? 'Start anyway' : 'Start services'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <ForOutlet outlet={outlet} />

        {early ? (
          <Callout intent="warning">
            {outlet.stage === 'payment'
              ? outlet.payment.state === 'sent'
                ? 'The bill has not been paid yet.'
                : 'The bill has not been sent yet.'
              : 'Some portal logins are not saved yet.'}{' '}
            Starting now is allowed, but say why. The reason is kept with the outlet.
          </Callout>
        ) : null}

        {/* ── watch hold ── the setup checklist; a line still open needs a reason too */}
        <SetupChecklist dealerId={outlet.dealerId} items={checklist} company={outlet.company} />
        {!early && openLines.length > 0 ? (
          <Callout intent="warning">
            The checklist is not complete. Starting now is allowed, but say why. The reason is kept
            with the outlet.
          </Callout>
        ) : null}

        <div>
          <p className="text-sm font-medium text-text">Services attached</p>
          {attached.isPending ? (
            <p className="text-sm text-text-subtle">checking…</p>
          ) : attached.isError ? (
            <p className="text-sm text-text-muted">Could not read them. See the Services tab.</p>
          ) : attached.data.length === 0 ? (
            <p className="text-sm text-text-muted">None attached yet.</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {attached.data.map((s) => (
                <li key={s.id}>
                  <Badge intent={s.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {serviceLabel(s.serviceId)}
                    {s.status === 'ACTIVE' ? '' : ' (paused)'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-xs text-text-muted">
            Starting does not attach them: set each one up in the{' '}
            <DealerTabLink
              dealerId={outlet.dealerId}
              tab="services"
              onGoToTab={onGoToTab}
              onClick={onClose}
            >
              Services tab
            </DealerTabLink>
            .
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-text">Portal logins</p>
          {outlet.loginsNeeded.length === 0 ? (
            <p className="text-sm text-text-muted">None asked for.</p>
          ) : (
            <ul className="mt-1 grid gap-1 text-sm">
              {outlet.loginsNeeded.map((portal) => {
                const status = loginStatus(portal);
                return (
                  <li key={portal} className="flex items-center gap-2">
                    <span className="min-w-12 font-medium text-text">{PORTAL_LABEL[portal]}</span>
                    {logins.isPending ? (
                      <span className="text-text-subtle">checking…</span>
                    ) : status === 'saved' ? (
                      <Badge intent="success">Saved</Badge>
                    ) : status === 'refused' ? (
                      <Badge intent="danger">Refused by the portal</Badge>
                    ) : (
                      <Badge intent="warning">Missing</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {/* A login an admin said this outlet has no use for: not missing, just not asked. */}
          {outlet.portalsNotNeeded.length > 0 ? (
            <ul className="mt-1 grid gap-1 text-sm">
              {outlet.portalsNotNeeded.map((n) => (
                <li key={n.portal} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-12 font-medium text-text">{PORTAL_LABEL[n.portal]}</span>
                  <Badge>Not needed</Badge>
                  <span className="text-xs text-text-muted">{n.reason}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="max-w-[12rem]">
          <Label htmlFor={daysId} required hint={`0 to ${MAX_WATCH_DAYS}`}>
            Watch for (days)
          </Label>
          <Input
            id={daysId}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_WATCH_DAYS}
            step={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </div>

        {needsReason ? (
          <div>
            <Label htmlFor={reasonId} required>
              Why start now
            </Label>
            <Textarea
              id={reasonId}
              rows={3}
              value={reason}
              maxLength={OVERRIDE_REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: paid in cash, logins taken by phone."
            />
          </div>
        ) : null}
        <FieldError message={touched ? (problem ?? undefined) : undefined} />

        <p className="text-xs text-text-muted">
          The outlet becomes Active and the watch begins. With 0 days it goes straight to Live. The
          dealer is told their services have started.
        </p>
      </form>
    </Dialog>
  );
}

// ── Extend the watch ────────────────────────────────────────────────────────

export function ExtendWatchDialog({ outlet, onClose }: Props) {
  return outlet ? (
    <ExtendWatchForm key={outlet.dealerId} outlet={outlet} onClose={onClose} />
  ) : null;
}

function ExtendWatchForm({ outlet, onClose }: FormProps) {
  const toast = useToast();
  const change = useChangeWatch();
  const daysId = React.useId();
  const [days, setDays] = React.useState('1');
  const [touched, setTouched] = React.useState(false);

  const problem = extendProblem(days);

  async function submit() {
    if (change.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      await change.mutateAsync({
        dealerId: outlet.dealerId,
        body: watchBody({ action: 'extend', days }),
      });
      toast.success(`Watch extended by ${days} ${days === '1' ? 'day' : 'days'}.`);
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Extend the watch"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={change.isPending}>
            Extend
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <ForOutlet outlet={outlet} />
        <div className="max-w-[12rem]">
          <Label htmlFor={daysId} required hint={`1 to ${MAX_WATCH_DAYS}`}>
            Extend by (days)
          </Label>
          <Input
            id={daysId}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_WATCH_DAYS}
            step={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </div>
        <FieldError message={touched ? (problem ?? undefined) : undefined} />
      </form>
    </Dialog>
  );
}
