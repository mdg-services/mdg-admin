import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  Dialog,
  FieldError,
  Label,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  useMarkPortalNotNeeded,
  useMarkSignedIn,
  useSendSetupWelcome,
  useUndoPortalNotNeeded,
  useWelcomeHandSent,
} from '@/hooks/api/useOnboarding';
import { phoneLabel } from '@/lib/intake';
import {
  REASON_MAX,
  chosenMessageLang,
  isCompanyPortalOutlet,
  markSignedInBody,
  messageLangLabel,
  portalNeedRows,
  portalNotNeededBody,
  reasonProblem,
  sendWelcomeBody,
  welcomeAlreadyWent,
  welcomeLine,
  welcomeNotSentLine,
} from '@/lib/onboarding';
import {
  dealerCodeLabel,
  type OutletSetupAdmin,
  type PortalId,
  type SendSetupWelcomeResult,
  type SetupMessageLang,
} from '@dk/shared';

import { MessageLangField } from './MessageLangField';
import { ForOutlet, errorText } from './SetupDialogs';
import { WelcomeWords } from './WelcomeWords';

/**
 * The small forms behind "Do it for the dealer" (`DoItForDealer`): marking the
 * owner signed in, sending the welcome again, and saying a portal login is not
 * needed. (Billing details and the logins are bigger and have their own files.)
 *
 * They share the shape of the other Setup forms (`SetupDialogs`): `outlet` is the
 * outlet the form is about and `null` is closed; each export mounts the real form
 * keyed on the outlet, only while one is open, so the board refreshing underneath
 * never resets what the person is typing. A rule that says no disables the button
 * and, once the person has touched the form, says why; a failure comes back from
 * the server as a toast with the form left open.
 *
 * What the dealer sees is a plain line in their chat, written by the server, that
 * the team helped. A reason typed here is for the team only.
 */

type Props = { outlet: OutletSetupAdmin | null; onClose: () => void };
type FormProps = { outlet: OutletSetupAdmin; onClose: () => void };

// ── Mark signed in ──────────────────────────────────────────────────────────

/** The owner is not going to sign in yet (no phone, no password): the team says so, with a reason. */
export function MarkSignedInDialog({ outlet, onClose }: Props) {
  return outlet ? <MarkSignedInForm key={outlet.dealerId} outlet={outlet} onClose={onClose} /> : null;
}

function MarkSignedInForm({ outlet, onClose }: FormProps) {
  const toast = useToast();
  const mark = useMarkSignedIn();
  const reasonId = React.useId();
  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const problem = reasonProblem(reason);
  // Not shouted at before anyone has typed: the button simply waits.
  const shown = touched || reason.length > REASON_MAX ? problem : null;

  async function submit() {
    if (mark.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      await mark.mutateAsync({ dealerId: outlet.dealerId, body: markSignedInBody(reason) });
      toast.success(`${dealerCodeLabel(outlet.code)}: marked as signed in.`);
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={mark.isPending ? () => {} : onClose}
      title="Mark signed in"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mark.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={mark.isPending}>
            Mark signed in
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
        <Callout intent="info">
          This does not sign the owner in, and it is not counted as a sign-in. It records that you
          helped them, and the setup moves on to their bill details. Their chat gets a line saying
          the team helped. If they forgot their password, use Reset password in the Team tab.
        </Callout>
        <div>
          <Label htmlFor={reasonId} required>
            Reason
          </Label>
          <Textarea
            id={reasonId}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="For example: helped by phone, signs in from his son's phone."
            invalid={!!shown}
          />
          <FieldError message={shown ?? undefined} />
        </div>
        <p className="text-xs text-text-muted">
          The reason is kept with the outlet and shown to the team only, never to the dealer.
        </p>
      </form>
    </Dialog>
  );
}

// ── Send the welcome on WhatsApp ────────────────────────────────────────────

/**
 * "Send welcome on WhatsApp": the same message Approve sends, in one language.
 * When the server cannot send it (no consent on the registration, the template
 * not approved, Meta refused) the answer is the words and a link, shown here to
 * send by hand, with "Mark welcome sent by hand" to follow. After one already went
 * the button says "Send again" and sends with `force`, because the server refuses
 * a second send otherwise.
 */
export function SendWelcomeDialog({ outlet, onClose }: Props) {
  return outlet ? <SendWelcomeForm key={outlet.dealerId} outlet={outlet} onClose={onClose} /> : null;
}

function SendWelcomeForm({ outlet, onClose }: FormProps) {
  const toast = useToast();
  const send = useSendSetupWelcome();
  const hand = useWelcomeHandSent();
  const [pickedLang, setPickedLang] = React.useState<SetupMessageLang | null>(null);
  const [result, setResult] = React.useState<SendSetupWelcomeResult | null>(null);

  const again = welcomeAlreadyWent(outlet.welcome.state);
  const lang = chosenMessageLang(pickedLang, outlet.messageLang);
  const label = dealerCodeLabel(outlet.code);
  const to = outlet.mobile ? phoneLabel(outlet.mobile) : 'the owner';

  async function submit() {
    if (send.isPending) return;
    try {
      const done = await send.mutateAsync({
        dealerId: outlet.dealerId,
        body: sendWelcomeBody({ messageLang: lang, force: again }),
      });
      if (done.welcome.sent) {
        toast.success(`WhatsApp welcome sent to ${to}, in ${messageLangLabel(done.messageLang)}.`);
        onClose();
      } else {
        setResult(done);
      }
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  async function markByHand() {
    if (hand.isPending) return;
    try {
      await hand.mutateAsync(outlet.dealerId);
      toast.success(`${label}: welcome marked as sent by hand.`);
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  const outcome = result?.welcome;
  return (
    <Dialog
      open
      onClose={send.isPending || hand.isPending ? () => {} : onClose}
      title={again ? 'Send the welcome again' : 'Send welcome on WhatsApp'}
      footerBelow="row"
      footer={
        outcome && !outcome.sent ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={hand.isPending}>
              Close
            </Button>
            <Button onClick={() => void markByHand()} loading={hand.isPending}>
              I sent it: mark sent by hand
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={send.isPending}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} loading={send.isPending}>
              {again ? 'Send again' : 'Send welcome'}
            </Button>
          </>
        )
      }
    >
      {outcome && !outcome.sent && result ? (
        <div className="grid gap-3">
          <ForOutlet outlet={outlet} />
          <Callout intent="warning">{welcomeNotSentLine(outcome.reason)}</Callout>
          <WelcomeWords
            mobile={outlet.mobile ?? ''}
            text={outcome.text}
            waLink={outcome.waLink}
            lang={result.messageLang}
          />
          <p className="text-xs text-text-muted">
            Once you have sent it, press “I sent it” so nobody sends it twice.
          </p>
        </div>
      ) : (
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <ForOutlet outlet={outlet} />
          <p className="text-sm text-text">
            WhatsApp welcome to <span className="font-medium">{to}</span>:{' '}
            <span className="text-text-muted">{welcomeLine(outlet.welcome)}.</span>
          </p>
          {again ? (
            <Callout intent="warning">
              The welcome already went. Sending it again messages the owner once more.
            </Callout>
          ) : null}
          <MessageLangField
            picked={pickedLang}
            fallback={outlet.messageLang}
            onPick={setPickedLang}
            disabled={send.isPending}
          />
          <p className="text-xs text-text-muted">
            It tells them the account is ready and how to sign in. If WhatsApp cannot send it from
            here (no consent on their form, say), you get the words to send from your phone.
          </p>
        </form>
      )}
    </Dialog>
  );
}

// ── A login this outlet does not need ───────────────────────────────────────

/**
 * "Login not needed for this outlet": an outlet with no IRAS automation, say, is
 * not asked for an IRAS login and does not show it missing on the checklist. One
 * portal at a time, with a reason; and the way back ("Ask for it again") until the
 * services start. The dealer is not told anything: the box simply stops asking.
 */
export function PortalNotNeededDialog({ outlet, onClose }: Props) {
  return outlet ? (
    <PortalNotNeededForm key={outlet.dealerId} outlet={outlet} onClose={onClose} />
  ) : null;
}

function PortalNotNeededForm({ outlet, onClose }: FormProps) {
  const toast = useToast();
  const mark = useMarkPortalNotNeeded();
  const undo = useUndoPortalNotNeeded();
  const reasonId = React.useId();
  const [portal, setPortal] = React.useState<PortalId | null>(null);
  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const rows = portalNeedRows(outlet);
  const byHand = isCompanyPortalOutlet(outlet.company);
  // What the board refreshes to may take the picked portal away (somebody else marked it).
  const picked = rows.find((r) => r.portal === portal && r.canMark) ?? null;
  const problem = reasonProblem(reason);
  const shown = touched || reason.length > REASON_MAX ? problem : null;
  const busy = mark.isPending || undo.isPending;

  async function submit() {
    if (!picked || mark.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      await mark.mutateAsync({
        dealerId: outlet.dealerId,
        body: portalNotNeededBody(picked.portal, reason),
      });
      toast.success(`${picked.label} login is not needed for ${dealerCodeLabel(outlet.code)}.`);
      setPortal(null);
      setReason('');
      setTouched(false);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  async function askAgain(p: PortalId, name: string) {
    if (busy) return;
    try {
      await undo.mutateAsync({ dealerId: outlet.dealerId, portal: p });
      toast.success(`${name} login is asked for again.`);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={busy ? () => {} : onClose}
      title="Login not needed for this outlet"
      footerBelow="row"
      footer={
        picked ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setPortal(null);
                setTouched(false);
              }}
              disabled={mark.isPending}
            >
              Back
            </Button>
            <Button onClick={() => void submit()} loading={mark.isPending}>
              {`${picked.label} not needed`}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Done
          </Button>
        )
      }
    >
      <div className="grid gap-3">
        <ForOutlet outlet={outlet} />
        <p className="text-xs text-text-muted">
          {byHand
            ? `The dealer is asked for the ${rows[0]?.label ?? 'company portal'} login. Mark it as not needed when this outlet has none to give. It stops being asked for and stops showing as missing.`
            : 'The dealer is asked for both the SDMS and the IRAS login. Mark one as not needed when this outlet has no use for it (an outlet whose figures are typed by hand has no IRAS). It stops being asked for and stops showing as missing.'}
        </p>
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li
              key={r.portal}
              className="min-w-0 rounded-md border border-border p-2.5 [overflow-wrap:anywhere]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-12 text-sm font-medium text-text">{r.label}</span>
                {r.state === 'asked' ? (
                  <Badge intent="info">Asked for</Badge>
                ) : (
                  <Badge>Not needed</Badge>
                )}
                <span className="ml-auto" />
                {r.canMark && picked?.portal !== r.portal ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setPortal(r.portal);
                      setTouched(false);
                    }}
                    disabled={busy}
                  >
                    Not needed…
                  </Button>
                ) : null}
                {r.canUndo ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void askAgain(r.portal, r.label)}
                    loading={undo.isPending && undo.variables?.portal === r.portal}
                    disabled={busy}
                  >
                    Ask for it again
                  </Button>
                ) : null}
              </div>
              {r.state === 'not_needed' && r.reason ? (
                <p className="mt-1.5 text-xs text-text-muted">
                  {r.reason}
                  {r.by ? ` · ${r.by}` : ''}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        {picked ? (
          <div>
            <Label htmlFor={reasonId} required>
              {`Why is ${picked.label} not needed`}
            </Label>
            <Textarea
              id={reasonId}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={
                byHand
                  ? 'For example: the dealer has no login for it yet.'
                  : 'For example: no IRAS automation, the sales are typed in by hand.'
              }
              invalid={!!shown}
            />
            <FieldError message={shown ?? undefined} />
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
