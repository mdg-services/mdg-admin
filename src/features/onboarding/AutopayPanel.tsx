import { Check, Copy, MessageCircle } from 'lucide-react';
import * as React from 'react';

import {
  ActionRow,
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  Copyable,
  Label,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import { DealerReceivesBox } from '@/features/payments/DealerReceivesBox';
import { useAutopayOverview, useRefreshAutopay, useStartAutopay } from '@/hooks/api/useAutopay';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import {
  AUTOPAY_STATE_INTENT,
  AUTOPAY_STATE_LABEL,
  canStopAutopay,
  endedByDetail,
  followUpLine,
  modeBadge,
  moneyBackLine,
  monthsTakenLine,
  needsFollowUp,
  newestEndedFirst,
  refreshOutcome,
  sentToLine,
  startConfirmWords,
  startedToast,
  stateHint,
  statusFacts,
} from '@/lib/autopay';
import {
  approvalExpiryLine,
  autopayIsRunning,
  payLinkInsteadFacts,
  refundAskedAt,
  refundAskedLine,
  setUpAutopayAction,
} from '@/lib/billingRelease';
import { upfrontLine } from '@/lib/billingRelease2';
import { copyText } from '@/lib/clipboard';
import { istTodayYmd } from '@/lib/format';
import { istStamp } from '@/lib/intake';
import {
  AUTOPAY_ENDED_BY_LABELS,
  AUTOPAY_STOP_REASON_LABELS,
  type AdminAutopay,
  type StartAutopayResult,
} from '@dk/shared';

import {
  FollowUpDialog,
  MoneyBackDialog,
  PayLinkInsteadDialog,
  StopAutopayDialog,
  errorText,
} from './AutopayDialogs';

/** Ended ones shown before "Show older". */
const SHOWN = 3;

/**
 * An outlet's monthly autopay, on the Setup card beside its bill: whether it is on,
 * what it takes and when, the approval link while the owner has yet to approve, the
 * words to send by hand right after it is set up, and every autopay that ended with
 * the call that followed it.
 *
 * It only shows and asks. Whether it can be set up, and every state it is in, is
 * the server's answer (`useAutopayOverview`); a button is offered only where the
 * server would accept the press.
 *
 * The WhatsApp words are the overview's own (`approvalWords`) for as long as an
 * approval waits, so Copy and Open WhatsApp work at any time, not only right after
 * "Set up autopay". The answer to that press still carries them and is the fallback
 * for a server that does not send them yet.
 */
export function AutopayPanel({ dealerId, code }: { dealerId: string; code: string }) {
  const toast = useToast();
  const overview = useAutopayOverview(dealerId);
  const start = useStartAutopay();
  const refresh = useRefreshAutopay();
  const [asking, setAsking] = React.useState(false);
  const [stopping, setStopping] = React.useState(false);
  const [callFor, setCallFor] = React.useState<AdminAutopay | null>(null);
  const [started, setStarted] = React.useState<StartAutopayResult | null>(null);
  const [givingBack, setGivingBack] = React.useState(false);
  const [swapping, setSwapping] = React.useState(false);
  const isSuper = useIsSuperAdmin();

  const data = overview.data;
  const current = data?.current ?? null;
  const today = istTodayYmd();
  // The server says whether it can be started; an autopay already running is never started again.
  const canStart = !!data?.canStart && !current;
  const canStop = !!current && canStopAutopay(current);
  // The owner stopped autopay and asked for the first month back: a call, then a super-admin's refund.
  const asked = refundAskedAt(data);
  // "Send a pay link instead" works from what the press needs, not from a live autopay:
  // an approval that ran out unused has none (it is the newest ended one).
  const payLink = data?.canPayLinkInstead ? payLinkInsteadFacts(data, Date.now()) : null;

  async function doStart() {
    try {
      const result = await start.mutateAsync(dealerId);
      setStarted(result);
      setAsking(false);
      toast.success(startedToast(result.autopay.sentTo));
    } catch (err) {
      setAsking(false);
      toast.error(errorText(err));
    }
  }

  async function doRefresh(a: AdminAutopay) {
    try {
      const after = await refresh.mutateAsync(a.id);
      const text = refreshOutcome(a.state, after.state);
      if (after.state !== a.state) toast.success(text);
      else toast.info(text);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <section aria-label="Autopay" className="grid gap-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-xs font-medium uppercase tracking-wide text-text-subtle">Autopay</h3>
        {current ? (
          <>
            <Badge intent={AUTOPAY_STATE_INTENT[current.state]}>
              {AUTOPAY_STATE_LABEL[current.state]}
            </Badge>
            <Badge intent={modeBadge(current.mode).intent}>{modeBadge(current.mode).text}</Badge>
          </>
        ) : data ? (
          <Badge intent="neutral">{AUTOPAY_STATE_LABEL.off}</Badge>
        ) : null}
      </div>

      {overview.isPending ? (
        <div className="grid gap-2" aria-busy="true">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-8 w-40" />
        </div>
      ) : overview.isError || !data ? (
        <Callout intent="warning" onRetry={() => void overview.refetch()}>
          Autopay could not be loaded.
          {overview.error instanceof Error && overview.error.message
            ? ` ${overview.error.message}`
            : ''}
        </Callout>
      ) : (
        <>
          {current ? (
            <CurrentBlock
              current={current}
              today={today}
              words={
                data.approvalWords ??
                (started && started.autopay.id === current.id
                  ? { text: started.whatsappText, waLink: started.waLink }
                  : null)
              }
            />
          ) : null}

          {canStart || current || payLink ? (
            <ActionRow below="wrap" align="start">
              {canStart ? (
                <Button size="sm" onClick={() => setAsking(true)}>
                  Set up autopay
                </Button>
              ) : null}
              {payLink ? (
                <Button size="sm" variant="secondary" onClick={() => setSwapping(true)}>
                  Send a pay link instead
                </Button>
              ) : null}
              {canStop ? (
                <Button size="sm" variant="secondary" onClick={() => setStopping(true)}>
                  Stop autopay
                </Button>
              ) : null}
              {current ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void doRefresh(current)}
                  loading={refresh.isPending}
                >
                  Check with Razorpay
                </Button>
              ) : null}
            </ActionRow>
          ) : null}

          {/* Why it cannot be set up now, in the server's words. Said only when nothing is
              running: with one running, the status above already says why. */}
          {!canStart && !current ? (
            <p className="text-sm text-text-muted">
              {data.cannotStartReason ?? 'Autopay cannot be set up for this outlet right now.'}
            </p>
          ) : null}

          {/* The first-month money-back: what it is now, and the one press that keeps
              the promise (stop autopay, refund the first bill). Super-admins only. */}
          {asked ? (
            <Callout intent="warning">
              {refundAskedLine(asked, today)}{' '}
              {data.firstMonth?.canMoneyBack
                ? isSuper
                  ? 'Ring them first, then give it back.'
                  : 'Ring them. A super-admin gives the money back.'
                : ''}
            </Callout>
          ) : null}
          {moneyBackLine(data.firstMonth, today) || (asked && data.firstMonth?.canMoneyBack) ? (
            <div className="flex flex-wrap items-center gap-2">
              {moneyBackLine(data.firstMonth, today) ? (
                <p className="text-sm text-text-muted">{moneyBackLine(data.firstMonth, today)}</p>
              ) : null}
              {data.firstMonth?.canMoneyBack && isSuper ? (
                // The owner has asked for it: this is the press that keeps the promise.
                <Button
                  size="sm"
                  variant={asked ? 'primary' : 'secondary'}
                  onClick={() => setGivingBack(true)}
                >
                  Give the first month back
                </Button>
              ) : null}
            </div>
          ) : null}

          {data.history.length > 0 ? <History list={data.history} onCallDone={setCallFor} /> : null}

          <ConfirmDialog
            open={asking}
            onCancel={() => setAsking(false)}
            onConfirm={() => void doStart()}
            loading={start.isPending}
            title="Set up autopay"
            description={
              <div className="grid gap-3">
                <p>{startConfirmWords(data, today)}</p>
                <DealerReceivesBox
                  action={setUpAutopayAction({
                    paidThrough: data.paidThrough,
                    firstBillUnpaid:
                      data.firstMonth?.status === 'due' || data.firstMonth?.status === 'processing',
                    amountPaise: data.monthlyPricePaise,
                    today,
                  })}
                />
              </div>
            }
            confirmLabel="Set up autopay"
            size="md"
          />
        </>
      )}

      {stopping && current ? (
        <StopAutopayDialog autopay={current} code={code} onClose={() => setStopping(false)} />
      ) : null}
      {callFor ? (
        <FollowUpDialog autopay={callFor} code={code} onClose={() => setCallFor(null)} />
      ) : null}
      {swapping && payLink ? (
        <PayLinkInsteadDialog
          dealerId={dealerId}
          code={code}
          amountPaise={payLink.amountPaise}
          approvalExpiresAt={payLink.approvalExpiresAt}
          ranOut={payLink.ranOut}
          onClose={() => setSwapping(false)}
        />
      ) : null}
      {givingBack && data?.firstMonth ? (
        <MoneyBackDialog
          dealerId={dealerId}
          code={code}
          firstMonth={data.firstMonth}
          autopayRunning={autopayIsRunning(current)}
          onClose={() => setGivingBack(false)}
        />
      ) : null}
    </section>
  );
}

/** The autopay that is running: its facts, what it waits on, and the way for the owner to approve. */
function CurrentBlock({
  current,
  today,
  words,
}: {
  current: AdminAutopay;
  today: string;
  /** The approval words, while one waits: for a person to copy or open in WhatsApp at any time. */
  words: { text: string; waLink: string | null } | null;
}) {
  const hint = stateHint(current.state);
  const sentTo = current.state === 'setting_up' ? sentToLine(current.sentTo) : null;
  // A special first month taken at approval: "₹1 first month, then ₹3,540 from 30 Nov".
  // While the approval waits the status line above already says it ("₹1 at approval, then ...").
  const upfront = current.state === 'setting_up' ? null : upfrontLine(current, today);
  // When the link stops working: said while it waits, so nobody is left guessing how long it has.
  const expiry = current.state === 'setting_up' ? approvalExpiryLine(current.approvalExpiresAt, Date.now()) : null;
  return (
    <div className="grid gap-3">
      <p className="select-text text-sm text-text [overflow-wrap:anywhere]">
        {statusFacts(current, today).join(' · ')}
      </p>
      {upfront ? <p className="select-text text-sm font-medium text-text">{upfront}</p> : null}

      {current.state === 'failing' && hint ? <Callout intent="warning">{hint}</Callout> : null}
      {current.state === 'setting_up' && hint ? (
        <p className="text-xs text-text-muted">{hint}</p>
      ) : null}

      {current.state === 'setting_up' ? (
        <div className="grid gap-2">
          {current.approvalUrl ? (
            <Copyable
              label="Approval link"
              value={current.approvalUrl}
              mono
              toastLabel="Approval link copied"
            />
          ) : (
            <p className="text-sm text-text-muted">Razorpay has not given an approval link yet.</p>
          )}
          {sentTo ? <p className="text-xs text-text-muted">{sentTo}</p> : null}
          {expiry ? <p className="text-xs text-text-muted">{expiry}</p> : null}
        </div>
      ) : null}

      {words && current.state === 'setting_up' ? (
        <AutopayWords text={words.text} waLink={words.waLink} />
      ) : null}
    </div>
  );
}

/**
 * The approval message as words, for a person to send from their own phone: the
 * message in the outlet's language, WhatsApp's own link that opens the chat with it
 * ready (`wa.me`), and Copy. Nothing here records that it was sent.
 */
function AutopayWords({ text, waLink }: { text: string; waLink: string | null }) {
  const toast = useToast();
  const textId = React.useId();
  const [copied, setCopied] = React.useState(false);

  async function copyWords() {
    if (await copyText(text)) {
      setCopied(true);
      toast.success('Words copied');
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error('Could not copy. Select the words and copy them by hand.');
    }
  }

  return (
    <div className="grid gap-2 rounded-md border border-border bg-surface-2 p-3">
      <div>
        <Label htmlFor={textId}>Words to send on WhatsApp</Label>
        <Textarea id={textId} rows={6} readOnly value={text} className="select-text" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {waLink ? (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 min-h-11 items-center gap-2 rounded-md bg-success px-4 text-sm font-semibold text-white hover:bg-success/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
          >
            <MessageCircle width={16} height={16} strokeWidth={1.75} aria-hidden />
            Open WhatsApp
          </a>
        ) : null}
        <Button
          variant="secondary"
          onClick={() => void copyWords()}
          leftIcon={copied ? <Check width={14} height={14} /> : <Copy width={14} height={14} />}
        >
          {copied ? 'Copied' : 'Copy words'}
        </Button>
      </div>
      {!waLink ? (
        <p className="text-xs text-text-muted">
          There is no phone number for a WhatsApp link. Copy the words and send them yourself.
        </p>
      ) : null}
    </div>
  );
}

/** Autopays that ended, newest first, each with the call that followed it (or the button to log it). */
function History({
  list,
  onCallDone,
}: {
  list: AdminAutopay[];
  onCallDone: (a: AdminAutopay) => void;
}) {
  const [all, setAll] = React.useState(false);
  const ended = newestEndedFirst(list);
  const shown = all ? ended : ended.slice(0, SHOWN);
  return (
    <div className="grid gap-1.5 border-t border-border pt-3">
      <h4 className="text-xs font-medium uppercase tracking-wide text-text-subtle">Ended</h4>
      <ol className="grid gap-3">
        {shown.map((a) => (
          <EndedRow key={a.id} autopay={a} onCallDone={onCallDone} />
        ))}
      </ol>
      {ended.length > SHOWN ? (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer' : `Show ${ended.length - SHOWN} older`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function EndedRow({
  autopay: a,
  onCallDone,
}: {
  autopay: AdminAutopay;
  onCallDone: (a: AdminAutopay) => void;
}) {
  const how = a.endedBy ? AUTOPAY_ENDED_BY_LABELS[a.endedBy] : 'Ended';
  const who = endedByDetail(a.endedBy, a.endedByName);
  const when = istStamp(a.endedAt);
  const why = a.stopReason ? AUTOPAY_STOP_REASON_LABELS[a.stopReason] : null;
  return (
    <li className="grid min-w-0 gap-0.5 text-sm [overflow-wrap:anywhere]">
      <span className="select-text text-text">
        {how}
        {who ? ` · ${who}` : ''}
        {when ? <span className="text-text-muted">{` · ${when}`}</span> : null}
      </span>
      {why ? <span className="select-text text-xs text-text-muted">{why}</span> : null}
      {a.stopNote ? (
        <span className="select-text text-xs text-text-muted">{a.stopNote}</span>
      ) : null}
      {a.chargedCount > 0 ? (
        <span className="text-xs text-text-subtle">{monthsTakenLine(a.chargedCount)}</span>
      ) : null}
      {a.followUp ? (
        <span className="mt-0.5 grid gap-0.5 border-l-2 border-border pl-2">
          <span className="select-text text-xs text-text">
            {followUpLine(a.followUp, istStamp(a.followUp.doneAt))}
          </span>
          <span className="select-text text-xs text-text-muted">{a.followUp.note}</span>
        </span>
      ) : null}
      {needsFollowUp(a) ? (
        <span className="mt-1">
          <Button size="sm" variant="secondary" onClick={() => onCallDone(a)}>
            Mark call done
          </Button>
        </span>
      ) : null}
    </li>
  );
}
