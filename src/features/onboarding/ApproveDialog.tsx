import { Check, Copy, MessageCircle } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Copyable,
  Dialog,
  FieldError,
  Input,
  Label,
  Textarea,
  useToast,
} from '@/components/ui';
import { useNextDealerCodeQuery } from '@/hooks/api/useDealers';
import { useApproveRegistration } from '@/hooks/api/useOnboarding';
import { useRegistrationLinkOptionQuery } from '@/hooks/api/useOutletLink';
import { copyText } from '@/lib/clipboard';
import { agoLabel, dialHref, istStamp, phoneLabel } from '@/lib/intake';
import { chosenMessageLang, messageLangLabel, type RegistrationRow } from '@/lib/onboarding';
import { LINK_CHOICE_HINT, canApprove as mayApprove, linkChoiceLabel, linkedResultLine } from '@/lib/outlets';
import { ageSince } from '@/pages/overview/format';
import { dealerCodeLabel, type ApproveRegistrationResult, type SetupMessageLang } from '@dk/shared';
import { dealerCodeSchema } from '@dk/shared/schemas';

import { MessageLangField } from './MessageLangField';

/** The owner a registration was added to, kept for the result screen. */
type LinkedTo = { name: string; codes: string[] };

/**
 * Approve one registration: the first of MDG's four taps.
 *
 * It shows what is about to be made (the outlet's code, from the next free one,
 * editable) and what the registration says, then does it in one request. The
 * server makes the outlet and its owner login from the registration, so nothing
 * is typed twice.
 *
 * The second screen is the result, and it is the reason this dialog stays open
 * after the click: the WhatsApp welcome only goes by itself once its template is
 * approved. Until then the server hands back the words and a `wa.me` link, and
 * the person approving sends it from their own phone (Open WhatsApp). A
 * temporary password comes back only for a registration that carried none, shown
 * once.
 *
 * The WhatsApp welcome goes in ONE language, Hinglish or English, chosen here:
 * pre-set to the default for this person (`row.messageLang`) and changeable for
 * this send. The result screen's words and Open WhatsApp link are in that language.
 *
 * `row` is the registration being approved; `null` is closed. The page owns it,
 * not the list, so the result screen stays after the row has left the list.
 */
export function ApproveDialog({
  row,
  onClose,
}: {
  row: RegistrationRow | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const approve = useApproveRegistration();
  const codeId = React.useId();
  const suggestion = useNextDealerCodeQuery(!!row);
  const [code, setCode] = React.useState('');
  const [typed, setTyped] = React.useState(false);
  const [result, setResult] = React.useState<ApproveRegistrationResult | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  // ── one person, several outlets ── ticked: add this as another outlet of the owner on this number
  const [link, setLink] = React.useState(false);
  // The owner the result screen names, kept past the refresh that follows an approval.
  const [linkedTo, setLinkedTo] = React.useState<LinkedTo | null>(null);
  // The welcome's language: what the person picked; until they do, the default on the row.
  const [pickedLang, setPickedLang] = React.useState<SetupMessageLang | null>(null);

  // Fresh for every registration.
  React.useEffect(() => {
    setCode('');
    setTyped(false);
    setResult(null);
    setNow(Date.now());
    setLink(false);
    setLinkedTo(null);
    setPickedLang(null);
  }, [row?.registrationId]);

  // Prefill with the next free code, unless the person has already typed one.
  React.useEffect(() => {
    if (row && !typed && suggestion.data?.suggestion) setCode(suggestion.data.suggestion);
  }, [row, typed, suggestion.data?.suggestion]);

  const parsed = dealerCodeSchema.safeParse(code);
  const codeProblem =
    !parsed.success && code.trim() !== ''
      ? 'Use the number then the region letter, e.g. 15E.'
      : null;
  const blocked = row?.alreadyClient ?? null;
  // Who it could be added to, asked only for a registration that is already a client.
  const linkQuery = useRegistrationLinkOptionQuery(row?.registrationId, !!blocked && !result);
  const linkOwner = linkQuery.data?.owner ?? null;
  const linking = !!blocked && !!linkOwner && link;
  const canApprove =
    !!row &&
    mayApprove({
      alreadyClient: !!blocked,
      linking,
      codeValid: parsed.success,
      pending: approve.isPending,
    });

  async function submit() {
    if (!row || !canApprove || !parsed.success) return;
    try {
      // The code on the screen, as the person saw it. If somebody else took it meanwhile the
      // server answers 409 and says so.
      const done = await approve.mutateAsync({
        id: row.registrationId,
        code: parsed.data,
        ...(linking && linkOwner ? { linkToUserId: linkOwner.userId } : {}),
        // The language that is on screen, as the person saw it.
        messageLang: chosenMessageLang(pickedLang, row.messageLang),
      });
      if (linking && linkOwner) setLinkedTo({ name: linkOwner.name, codes: linkOwner.codes });
      setResult(done);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'That did not go through.');
    }
  }

  return (
    <Dialog
      open={!!row}
      onClose={onClose}
      title={result ? `${dealerCodeLabel(result.code)} is set up` : 'Approve registration'}
      footerBelow="row"
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => void submit()}
              loading={approve.isPending}
              disabled={!canApprove}
            >
              Approve
            </Button>
          </>
        )
      }
    >
      {row && result ? (
        <ApprovedResult row={row} result={result} linkedTo={linkedTo} />
      ) : row ? (
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 [overflow-wrap:anywhere]">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-medium text-text">{row.name}</p>
              {row.fromCampaign ? <Badge intent="info">From our campaign</Badge> : null}
            </div>
            <p className="mt-0.5 text-xs text-text-subtle">
              {[row.pumpName, `SAP code ${row.sapCode}`, row.siteType].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-0.5 text-xs text-text-subtle">
              {phoneLabel(row.mobile)} · sent {agoLabel(ageSince(row.submittedAt, now))},{' '}
              {istStamp(row.submittedAt, now)}
            </p>
          </div>

          {blocked ? (
            <Callout intent="warning">
              Already a client ({dealerCodeLabel(blocked.code)}).{' '}
              <Link
                className="font-semibold underline"
                to={`/dealers/${blocked.dealerId}`}
                onClick={onClose}
              >
                Open {dealerCodeLabel(blocked.code)}
              </Link>
              .{' '}
              {linkQuery.isLoading
                ? 'Checking whether it can be added to their account…'
                : linkOwner
                  ? null
                  : (linkQuery.data?.reason ?? 'It cannot be added as another outlet from here.')}
            </Callout>
          ) : null}

          {/* ── one person, several outlets ── offered only when the number is an owner we already serve */}
          {blocked && linkOwner ? (
            <Checkbox
              checked={link}
              onChange={(e) => setLink(e.target.checked)}
              label={linkChoiceLabel(linkOwner)}
              hint={LINK_CHOICE_HINT}
              align="start"
            />
          ) : null}

          <div>
            <Label htmlFor={codeId} required>
              Dealer code
            </Label>
            <Input
              id={codeId}
              value={code}
              onChange={(e) => {
                setTyped(true);
                setCode(e.target.value);
              }}
              placeholder="e.g. 15E"
              autoCapitalize="characters"
              autoComplete="off"
              disabled={!!blocked && !linking}
              invalid={!!codeProblem}
            />
            <FieldError message={codeProblem ?? undefined} />
            <p className="mt-1 text-xs text-text-muted">
              {suggestion.data?.suggestion
                ? `Next free code is ${suggestion.data.suggestion}. Change it if this outlet already has one.`
                : suggestion.isError
                  ? 'Could not read the next free code. Type it in.'
                  : 'Looking up the next free code…'}
            </p>
          </div>

          <MessageLangField
            picked={pickedLang}
            fallback={row.messageLang}
            onPick={setPickedLang}
            disabled={approve.isPending}
          />

          <p className="text-xs text-text-muted">
            {linking
              ? 'This makes the outlet and a login for the same owner, with their existing password. No welcome is sent by itself: you get the words to send.'
              : 'This makes the outlet and its owner login from the registration, and sends the WhatsApp welcome. The owner signs in with their mobile number and the password they chose.'}
          </p>
        </form>
      ) : null}
    </Dialog>
  );
}

/** What Approve did: the new outlet, whether the welcome went, and a temporary password if there is one. */
function ApprovedResult({
  row,
  result,
  linkedTo,
}: {
  row: RegistrationRow;
  result: ApproveRegistrationResult;
  /** Set when the outlet was added to an owner we already serve (`lib/outlets.ts`). */
  linkedTo: LinkedTo | null;
}) {
  const toast = useToast();
  const [copied, setCopied] = React.useState(false);
  const welcome = result.welcome;

  async function copyWelcome(text: string) {
    if (await copyText(text)) {
      setCopied(true);
      toast.success('Message copied');
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error('Could not copy. Select the message and copy it by hand.');
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-text">
        <span className="font-medium">{row.name}</span> is now outlet{' '}
        <Link className="font-semibold text-brand underline" to={`/dealers/${result.dealerId}`}>
          {dealerCodeLabel(result.code)}
        </Link>
        . The login for the owner is made.
      </p>
      {linkedTo ? <p className="text-sm text-text">{linkedResultLine(linkedTo, dealerCodeLabel(result.code))}</p> : null}

      {welcome.sent ? (
        <div className="flex items-start gap-2 rounded-md border border-success bg-success-soft p-2.5 text-sm text-success-strong md:text-success">
          <Check width={16} height={16} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            WhatsApp welcome sent to {phoneLabel(row.mobile)}, in {messageLangLabel(result.messageLang)}.
          </span>
        </div>
      ) : (
        <>
          <Callout intent="warning">
            The WhatsApp welcome was not sent. {welcome.reason.replace(/[.\s]+$/, '')}. Send it from
            your phone: it tells them the account is ready and how to sign in.
          </Callout>
          <div>
            <Label htmlFor="welcome-text">
              Message to send to {phoneLabel(row.mobile)}
              <span className="ml-2 text-xs font-normal text-text-subtle">
                in {messageLangLabel(result.messageLang)}
              </span>
            </Label>
            <Textarea
              id="welcome-text"
              rows={6}
              readOnly
              value={welcome.text}
              className="select-text"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* WhatsApp's own link, as the Films page uses: opens the chat with the words ready. */}
            <a
              href={welcome.waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 min-h-11 items-center gap-2 rounded-md bg-success px-4 text-sm font-semibold text-white hover:bg-success/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
            >
              <MessageCircle width={16} height={16} strokeWidth={1.75} aria-hidden />
              Open WhatsApp
            </a>
            <Button
              variant="secondary"
              onClick={() => void copyWelcome(welcome.text)}
              leftIcon={copied ? <Check width={14} height={14} /> : <Copy width={14} height={14} />}
            >
              {copied ? 'Copied' : 'Copy message'}
            </Button>
            {dialHref(row.mobile) ? (
              <a
                href={dialHref(row.mobile) ?? undefined}
                className="inline-flex min-h-11 items-center text-sm text-brand underline md:min-h-0"
              >
                Or call them
              </a>
            ) : null}
          </div>
        </>
      )}

      {result.tempPassword ? (
        <div className="grid gap-1.5 rounded-md border border-border bg-surface-2 p-2.5">
          <Copyable
            label="Temporary password (shown once)"
            value={result.tempPassword}
            mono
            toastLabel="Password copied"
          />
          <p className="text-xs text-text-muted">
            This registration came without a password. Give them this one by phone: they must change
            it at their first sign-in. It is not shown again.
          </p>
        </div>
      ) : linkedTo ? (
        <p className="text-xs text-text-muted">
          Nothing to pass on: the password is the one they already use, and the app shows both outlets.
        </p>
      ) : (
        <p className="text-xs text-text-muted">
          They sign in with their mobile number and the password they chose when they registered.
        </p>
      )}
    </div>
  );
}
