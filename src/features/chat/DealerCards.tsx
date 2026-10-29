import { Camera, Check, Clock, Eye, Lock } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import {
  GST_STATES,
  OIL_COMPANIES,
  OIL_COMPANY_NAMES,
  PORTAL_NAMES,
  isCompanyPortal,
  type Message,
  type OilCompanyId,
  type OutletSetupAdmin,
  type PortalId,
  type PortalLoginState,
  type SetupBilling,
  type SetupCardKind,
  type SetupStage,
} from '@dk/shared';

import {
  GST_STATE_HI,
  dealerWord,
  istToday,
  longDay,
  rupees,
  shortDay,
  type DealerLang,
} from './dealerView';

/**
 * WHAT THE DEALER SEES UNDER AN MDG MESSAGE, drawn read-only in the inbox.
 *
 * The dealer's app draws a request's buttons, the portal login box and the setup
 * cards (company, bill details, the bill) inside MDG's bubble. The inbox used to
 * reduce each to a one-line label, so an admin could not tell what the dealer was
 * actually being shown — three company buttons or a tick, an empty form or saved
 * details. These copy the app's cards (`mdg-client/src/features/setup/*`,
 * `PortalLoginBox`, the ask footer in `MessageBubble`) mark for mark, drawn from
 * what the inbox knows about the outlet.
 *
 * Nothing here can be pressed or typed into: they are pictures of the dealer's
 * screen. Buttons are spans and boxes are empty, so a click lands on the bubble
 * (and its menu) as before.
 */

/** What the thread knows about the outlet, for the cards. Provided by MessageList. */
export interface DealerViewValue {
  lang: DealerLang;
  /** The outlet's setup. `undefined` while loading; `null` for an outlet with none (not onboarding v2). */
  setup: OutletSetupAdmin | null | undefined;
  /** The outlet's portal logins. `undefined` while loading or not asked for. */
  portalLogins: PortalLoginState[] | undefined;
  /** The portal logins could not be fetched: each block says so instead of spinning. */
  portalLoginsFailed: boolean;
  /** The thread's primary member is an owner: the cards are the editable ones. A manager sees them read-only. */
  canEdit: boolean;
  /** A group thread (the manager's, with the owners in it): dealer-side bubbles carry their sender's name. */
  group: boolean;
}

export const DealerViewContext = React.createContext<DealerViewValue>({
  lang: 'hi',
  setup: undefined,
  portalLogins: undefined,
  portalLoginsFailed: false,
  canEdit: true,
  group: false,
});

const PREVIEW_TITLE = 'What the dealer sees. Only they can use it, in their app.';

/** A button in the dealer's look that does nothing here. */
function FakeButton({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span aria-hidden className={cn('cursor-default select-none', className)}>
      {children}
    </span>
  );
}

const PRIMARY_BUTTON =
  'flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-wa-accent px-3 text-[15px] font-medium text-white';
const SECONDARY_BUTTON =
  'flex h-11 w-full items-center justify-center rounded-lg border border-wa-divider bg-wa-chip px-3 text-[15px] font-medium text-wa-bubble-text';
const LINK_BUTTON =
  'flex min-h-11 shrink-0 items-center rounded-md px-2 text-[14px] font-medium text-wa-accent-strong';
const FIELD_BOX =
  'block h-11 w-full rounded-md border border-wa-divider bg-wa-in px-2.5 text-[16px] leading-[2.6rem] text-wa-meta';

function Block({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-md bg-wa-row-active px-2.5 py-2', className)}>{children}</div>;
}

function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-[13px] leading-snug text-wa-meta', className)}>{children}</p>;
}

function CardBox({ kind, children }: { kind: string; children: React.ReactNode }) {
  return (
    <div data-setup-card={kind} title={PREVIEW_TITLE} className="mt-1 flex flex-col gap-1.5">
      {children}
    </div>
  );
}

function FieldPreview({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <span className="mb-0.5 block text-[12px] leading-tight text-wa-meta">{label}</span>
      <span className={cn(FIELD_BOX, value && 'truncate text-wa-bubble-text')}>{value ?? ''}</span>
    </div>
  );
}

// ── A request MDG posted (`message.ask`) ───────────────────────────────────

/**
 * Where a request stands, as far as the inbox can tell. `open` and `sent` come
 * from the outlet's open requests. A request that is no longer open was either
 * received or withdrawn — the inbox is not told which — so it draws nothing
 * under the words (`none`), as does every older post of the same request.
 */
export type AskPreviewPhase = 'open' | 'sent' | 'none';

/** The request's title and day, on the pale inset above the words. */
export function AskHeader({ ask }: { ask: NonNullable<Message['ask']> }) {
  return (
    <div data-ask-ref={ask.ref} className="mb-1 rounded-md bg-wa-row-active px-2.5 py-2">
      <p className="break-words text-[14px] font-medium leading-snug">{ask.title}</p>
      {ask.periodLabel ? (
        <p className="text-[13px] leading-snug text-wa-meta">{ask.periodLabel}</p>
      ) : null}
    </div>
  );
}

/** Under a request: its two buttons while it is the dealer's turn, a line once answered. */
export function AskFooterPreview({
  ask,
  phase,
  lang,
}: {
  ask: NonNullable<Message['ask']>;
  phase: AskPreviewPhase;
  lang: DealerLang;
}) {
  if (phase === 'none') return null;
  if (phase === 'sent') {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 px-0.5 text-[13px] text-wa-meta">
        <Clock width={14} strokeWidth={2} className="shrink-0" aria-hidden />
        {dealerWord(lang, 'askSent')}
      </p>
    );
  }
  return (
    <div title={PREVIEW_TITLE} className="mt-1.5 flex flex-col gap-1.5">
      <FakeButton className={PRIMARY_BUTTON}>
        <Camera width={18} strokeWidth={2} className="shrink-0" aria-hidden />
        {dealerWord(lang, 'askSendPhoto')}
      </FakeButton>
      <FakeButton className={SECONDARY_BUTTON}>
        {dealerWord(lang, ask.acceptsFile ? 'askChooseFile' : 'askChooseGallery')}
      </FakeButton>
    </div>
  );
}

// ── The portal login box (`message.portalLogin`) ───────────────────────────

function StatusChip({
  status,
  notNeeded,
  lang,
}: {
  status: PortalLoginState['status'];
  notNeeded: boolean;
  lang: DealerLang;
}) {
  if (notNeeded) {
    return (
      <span className="rounded-full bg-black/[0.08] px-2 py-0.5 text-[12px] font-medium leading-tight text-wa-meta">
        {dealerWord(lang, 'portalNotNeeded')}
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-medium leading-tight text-wa-bubble-text">
        <Check width={13} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden />
        {dealerWord(lang, 'portalSaved')}
      </span>
    );
  }
  if (status === 'refused') {
    return (
      <span className="rounded-full bg-wa-notice px-2 py-0.5 text-[12px] font-medium leading-tight text-wa-bubble-text">
        {dealerWord(lang, 'portalRefused')}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-black/[0.08] px-2 py-0.5 text-[12px] font-medium leading-tight text-wa-meta">
      {dealerWord(lang, 'portalNeeded')}
    </span>
  );
}

function PortalRowPreview({
  portal,
  state,
  canEdit,
  failed,
  lang,
}: {
  portal: PortalId;
  state: PortalLoginState | undefined;
  canEdit: boolean;
  failed: boolean;
  lang: DealerLang;
}) {
  const name = PORTAL_NAMES[portal];
  const notNeeded = !!state && state.needed === false && state.status !== 'saved';
  const formOpen = !!state && !notNeeded && canEdit && state.status !== 'saved';
  const savedDate = state?.savedAt ? shortDay(state.savedAt, lang) : '';
  return (
    <div data-portal={portal} className="rounded-md bg-wa-row-active px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="flex min-w-0 items-center gap-1.5 break-words text-[14px] font-medium leading-snug">
          <Lock width={14} strokeWidth={2} className="shrink-0 text-wa-meta" aria-hidden />
          {isCompanyPortal(portal) ? name : dealerWord(lang, 'portalTitle', { portal: name })}
        </p>
        {state ? (
          <StatusChip status={state.status} notNeeded={notNeeded} lang={lang} />
        ) : failed ? null : (
          <Spinner size={14} />
        )}
      </div>

      {!state && failed ? (
        <p className="mt-1 text-[13px] leading-snug text-wa-meta">
          {dealerWord(lang, 'askStateFailed')}
        </p>
      ) : null}

      {state && !canEdit && !notNeeded && state.status !== 'saved' ? (
        <p className="mt-1 text-[13px] leading-snug text-wa-meta">
          {dealerWord(lang, 'portalOwnerFills')}
        </p>
      ) : null}

      {state && state.status === 'saved' ? (
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <div className="min-w-0 text-[13px] leading-snug text-wa-meta">
            <span className="break-words">
              {savedDate
                ? dealerWord(lang, 'portalSavedOn', { date: savedDate })
                : dealerWord(lang, 'portalSaved')}
            </span>
            {state.savedBy === 'mdg' ? (
              <span className="block break-words">{dealerWord(lang, 'filledByMdg')}</span>
            ) : null}
          </div>
          {canEdit ? (
            <FakeButton className={LINK_BUTTON}>{dealerWord(lang, 'portalChange')}</FakeButton>
          ) : null}
        </div>
      ) : null}

      {formOpen ? (
        <div className="mt-2 flex flex-col gap-2">
          <FieldPreview label={dealerWord(lang, 'portalUserId')} />
          <div>
            <span className="mb-0.5 block text-[12px] leading-tight text-wa-meta">
              {dealerWord(lang, 'portalPassword')}
            </span>
            <span className={cn(FIELD_BOX, 'relative pr-11')}>
              <span className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-wa-meta">
                <Eye width={18} strokeWidth={1.75} aria-hidden />
              </span>
            </span>
          </div>
          {/* The app's Save stays dimmed until both boxes have something in them. */}
          <FakeButton className={cn(PRIMARY_BUTTON, 'opacity-60')}>
            <Lock width={16} strokeWidth={2} className="shrink-0" aria-hidden />
            {dealerWord(lang, 'portalSave')}
          </FakeButton>
          <p className="text-[12px] leading-snug text-wa-meta">
            {dealerWord(lang, 'portalKeptSafe')}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The login box: one block per portal the message asked for, each showing that
 * login as it stands now. An outlet that needs a company portal (BPCL, HPCL) is
 * shown only those — the app hides the SDMS and IRAS rows on such a pump.
 */
export function PortalLoginPreview({
  portals,
  states,
  failed,
  canEdit,
  lang,
}: {
  portals: readonly PortalId[];
  states: PortalLoginState[] | undefined;
  failed: boolean;
  canEdit: boolean;
  lang: DealerLang;
}) {
  const companyPump = !!states?.some((p) => isCompanyPortal(p.portal) && p.needed);
  const shown = companyPump ? portals.filter(isCompanyPortal) : portals;
  if (shown.length === 0) return null;
  return (
    <div data-portal-login title={PREVIEW_TITLE} className="mt-1 flex flex-col gap-1.5">
      {shown.map((portal) => (
        <PortalRowPreview
          key={portal}
          portal={portal}
          state={states?.find((p) => p.portal === portal)}
          canEdit={canEdit}
          failed={failed}
          lang={lang}
        />
      ))}
    </div>
  );
}

// ── The setup cards (`message.setupCard`) ──────────────────────────────────

/**
 * Which kinds draw something under their words. `welcome` is only words and
 * `logins` is the login box (carried separately); `services` is retired.
 */
export function setupCardHasBody(card: SetupCardKind): boolean {
  return card === 'company' || card === 'billing' || card === 'payment' || card === 'started';
}

/** The retired "which services?" question: the app draws no such message at all. */
export function isRetiredSetupCard(message: Pick<Message, 'setupCard'>): boolean {
  return message.setupCard?.card === 'services';
}

/** The stages an outlet is still on its way in. Past them (live, lost) the app draws no card. */
const OPEN_STAGES: readonly SetupStage[] = [
  'sign_in',
  'company',
  'billing',
  'payment',
  'logins',
  'setup',
  'watch',
];

function companyLabel(company: OilCompanyId, lang: DealerLang): string {
  const n = OIL_COMPANY_NAMES[company];
  return `${n[lang]} (${n.short})`;
}

function stateLabel(code: string, lang: DealerLang): string {
  const en = GST_STATES[code] ?? code;
  if (lang !== 'hi') return en;
  const hi = GST_STATE_HI[code];
  return hi ? `${hi} (${en})` : en;
}

function CompanyCardPreview({
  setup,
  canEdit,
  lang,
}: {
  setup: OutletSetupAdmin;
  canEdit: boolean;
  lang: DealerLang;
}) {
  const saved = setup.company;
  const open = setup.stage !== 'watch' && setup.stage !== 'live' && setup.stage !== 'lost';
  const canChange = canEdit && open;
  if (!(canChange && !saved)) {
    if (!saved) {
      return canEdit ? null : (
        <CardBox kind="company">
          <Note>{dealerWord(lang, 'ownerFills')}</Note>
        </CardBox>
      );
    }
    return (
      <CardBox kind="company">
        <Block>
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 break-words text-[14px] font-medium leading-snug">
              <Check width={14} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden />
              {companyLabel(saved, lang)}
            </p>
            {canChange ? (
              <FakeButton className={LINK_BUTTON}>{dealerWord(lang, 'change')}</FakeButton>
            ) : null}
          </div>
          {setup.doneBy.company?.by === 'mdg' ? (
            <Note>{dealerWord(lang, 'filledByMdg')}</Note>
          ) : null}
          {!open ? <Note>{dealerWord(lang, 'companyLocked')}</Note> : null}
        </Block>
      </CardBox>
    );
  }
  return (
    <CardBox kind="company">
      <p className="text-[14px] font-medium leading-snug">{dealerWord(lang, 'companyQuestion')}</p>
      <div className="flex flex-col gap-1.5">
        {OIL_COMPANIES.map((company) => {
          const names = OIL_COMPANY_NAMES[company];
          return (
            <FakeButton
              key={company}
              className="flex min-h-14 w-full items-center justify-between gap-2 rounded-lg border-2 border-wa-divider bg-wa-in px-3 py-1.5 text-left text-wa-bubble-text"
            >
              <span className="min-w-0">
                <span className="block break-words text-[16px] font-medium leading-snug">
                  {names[lang]}
                </span>
                <span className="block text-[12px] leading-tight text-wa-meta">{names.short}</span>
              </span>
            </FakeButton>
          );
        })}
      </div>
    </CardBox>
  );
}

function SavedBillingLines({ billing, lang }: { billing: SetupBilling; lang: DealerLang }) {
  return (
    <div className="mt-1 flex flex-col gap-0.5 text-[14px] leading-snug">
      <p className="break-words font-medium">{billing.name}</p>
      <p className="break-words">{billing.address}</p>
      <p>{stateLabel(billing.stateCode, lang)}</p>
      <p className="tracking-wide">{billing.gstin ?? dealerWord(lang, 'noGstGiven')}</p>
    </div>
  );
}

function BillingCardPreview({
  setup,
  canEdit,
  lang,
}: {
  setup: OutletSetupAdmin;
  canEdit: boolean;
  lang: DealerLang;
}) {
  const saved = setup.billing;
  const locked = setup.payment.state === 'paid';
  const canChange = canEdit && !locked;

  if (setup.stage === 'company' && !saved) {
    return (
      <CardBox kind="billing">
        <Note>{dealerWord(lang, 'companyFirst')}</Note>
      </CardBox>
    );
  }
  if (!(canChange && !saved)) {
    if (!saved) {
      return (
        <CardBox kind="billing">
          <Note>{dealerWord(lang, 'ownerFills')}</Note>
        </CardBox>
      );
    }
    return (
      <CardBox kind="billing">
        <Block>
          <p className="flex items-center gap-1.5 text-[14px] font-medium leading-snug">
            <Check width={14} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden />
            {dealerWord(lang, 'billSaved')}
          </p>
          <SavedBillingLines billing={saved} lang={lang} />
          {setup.doneBy.billing?.by === 'mdg' ? (
            <Note className="mt-0.5">{dealerWord(lang, 'filledByMdg')}</Note>
          ) : null}
          <div className="mt-0.5 flex items-center justify-between gap-2">
            {locked ? <Note>{dealerWord(lang, 'billLocked')}</Note> : <span />}
            {canChange ? (
              <FakeButton className={LINK_BUTTON}>{dealerWord(lang, 'change')}</FakeButton>
            ) : null}
          </div>
        </Block>
      </CardBox>
    );
  }
  // The empty form. The app starts the name from the pump's registered name,
  // which the inbox does not hold, so that box is drawn empty here.
  return (
    <CardBox kind="billing">
      <div className="flex flex-col gap-2">
        <FieldPreview label={dealerWord(lang, 'billName')} />
        <FieldPreview label={dealerWord(lang, 'billAddress')} />
        <FieldPreview
          label={dealerWord(lang, 'billState')}
          value={dealerWord(lang, 'billStatePick')}
        />
        <div>
          <FieldPreview label={dealerWord(lang, 'billGstin')} />
          <p className="mt-0.5 text-[13px] leading-snug text-wa-meta">
            {dealerWord(lang, 'gstinHelp')}
          </p>
          <span className="mt-0.5 flex min-h-11 items-center gap-2.5 text-[14px] leading-snug">
            <span
              aria-hidden
              className="h-5 w-5 shrink-0 rounded-[3px] border-2 border-wa-meta bg-wa-in"
            />
            {dealerWord(lang, 'billNoGst')}
          </span>
        </div>
        <FakeButton className={PRIMARY_BUTTON}>{dealerWord(lang, 'billSave')}</FakeButton>
      </div>
    </CardBox>
  );
}

function PaymentCardPreview({ setup, lang }: { setup: OutletSetupAdmin; lang: DealerLang }) {
  const { state, amountPaise, dueOn, paidOn, paymentId } = setup.payment;
  if (state === 'paid') {
    const on = longDay(paidOn, lang);
    return (
      <CardBox kind="payment">
        <Block>
          <p className="flex items-center gap-1.5 text-[14px] font-medium leading-snug">
            <Check width={14} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden />
            {dealerWord(lang, 'payPaid')}
          </p>
          {on ? (
            <p className="text-[13px] leading-snug text-wa-meta">
              {dealerWord(lang, 'payPaidOn', { date: on })}
            </p>
          ) : null}
          {paymentId ? (
            <span className="mt-1 inline-block text-[14px] font-medium text-wa-bubble-text underline decoration-wa-meta underline-offset-2">
              {dealerWord(lang, 'viewReceipt')}
            </span>
          ) : null}
        </Block>
      </CardBox>
    );
  }
  if (state === 'sent' && amountPaise !== null) {
    const due = longDay(dueOn, lang);
    const overdue = /^\d{4}-\d{2}-\d{2}$/.test(dueOn ?? '') && (dueOn as string) < istToday();
    return (
      <CardBox kind="payment">
        <Block>
          <p className="text-[14px] font-medium leading-snug">
            {due
              ? dealerWord(lang, 'billLine', { amount: rupees(amountPaise), date: due })
              : dealerWord(lang, 'billLineNoDate', { amount: rupees(amountPaise) })}
          </p>
          {overdue ? (
            <p className="text-[13px] font-medium leading-snug text-danger">
              {dealerWord(lang, 'billOverdue')}
            </p>
          ) : null}
        </Block>
      </CardBox>
    );
  }
  return (
    <CardBox kind="payment">
      <Block>
        <p className="text-[14px] leading-snug">{dealerWord(lang, 'payPreparing')}</p>
      </Block>
    </CardBox>
  );
}

/**
 * The card inside an MDG setup message, drawn from the outlet's setup as it is
 * NOW — exactly as the app does: a message cannot change, so the card is never
 * what it said when it was posted. An outlet with no setup, or one already live
 * or lost, draws nothing and the message is just its words.
 */
export function SetupCardPreview({
  card,
  setup,
  canEdit,
  lang,
}: {
  card: SetupCardKind;
  setup: OutletSetupAdmin | null | undefined;
  canEdit: boolean;
  lang: DealerLang;
}) {
  if (!setupCardHasBody(card)) return null;
  if (setup === undefined) {
    return (
      <div className="mt-1 flex items-center gap-2 text-wa-meta" role="status">
        <Spinner size={14} />
      </div>
    );
  }
  if (!setup || !OPEN_STAGES.includes(setup.stage)) return null;
  switch (card) {
    case 'company':
      return <CompanyCardPreview setup={setup} canEdit={canEdit} lang={lang} />;
    case 'billing':
      return <BillingCardPreview setup={setup} canEdit={canEdit} lang={lang} />;
    case 'payment':
      return <PaymentCardPreview setup={setup} lang={lang} />;
    case 'started':
      return (
        <CardBox kind="started">
          <Block>
            <p className="flex items-center gap-1.5 text-[14px] font-medium leading-snug">
              <Check width={14} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden />
              {dealerWord(lang, 'started')}
            </p>
          </Block>
        </CardBox>
      );
    default:
      return null;
  }
}
