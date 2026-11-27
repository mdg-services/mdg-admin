import { formatDate, formatYmd } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import {
  formatPaise,
  GST_STATES,
  OIL_COMPANIES,
  type DealerStatus,
  type OilCompanyId,
  type PlannerOilCompany,
  type PlannerStage,
  type PlannerView,
} from '@dk/shared';

/*
 * New Pump Guide (ADR 0058) as the team app shows it.
 *
 * A planner is a person who is planning to open a petrol pump and pays ₹199 + GST
 * a month for the rule-book chat. On the server they are an ordinary dealer record
 * with status PLANNING, so every admin screen that lists dealers could show one.
 * The words and checks here keep those screens telling a planner apart from a
 * running outlet in the same way.
 */

/** The one name every badge uses, so the list, the inbox and the dealer page agree. */
export const PLANNER_BADGE_LABEL = 'Kavach Shuruaat';

/** A planner record, before the pump opens and it switches to Dealer Kavach. */
export function isPlannerStatus(status: DealerStatus | string | null | undefined): boolean {
  return status === 'PLANNING';
}

/**
 * Whether a dealer code is a planner's (P1, P2, …).
 *
 * The inbox's conversation rows carry the dealer's code but not its status, and
 * planners have their own code series that outlets never use (outlets are 1E,
 * 2E, …). On switching to Dealer Kavach the record gets a normal outlet code, so
 * the badge goes away by itself at the same moment.
 */
export function isPlannerCode(code: string | null | undefined): boolean {
  return /^P\d+$/i.test(code?.trim() ?? '');
}

export const PLANNER_STAGE_LABELS: Readonly<Record<PlannerStage, string>> = {
  exploring: 'Just exploring',
  applied: 'Applied to the oil company',
  selected: 'Selected, pump not built yet',
  building: 'Building the pump',
};

export const PLANNER_OIL_COMPANY_LABELS: Readonly<Record<PlannerOilCompany, string>> = {
  iocl: 'Indian Oil (IOCL)',
  bpcl: 'Bharat Petroleum (BPCL)',
  hpcl: 'Hindustan Petroleum (HPCL)',
  other: 'Another company',
  undecided: 'Not decided yet',
};

/** "Haryana (06)", or the bare code when the list does not know it. */
export function plannerStateLabel(stateCode: string | null | undefined): string {
  if (!stateCode) return '-';
  const name = GST_STATES[stateCode];
  return name ? `${name} (${stateCode})` : stateCode;
}

export interface PlanStateWords {
  /** Short words for the badge. Always says the state, so colour is never the only clue. */
  label: string;
  intent: Intent;
  /** One or two plain sentences: what it means for the person right now. */
  detail: string;
}

/**
 * The plan's state in words an account manager can repeat on the phone.
 *
 * Order matters: a switched account is no longer a planner at all; a paid month
 * still running wins over a stopped autopay (they keep their answers until the
 * month ends); only then do "closed", "stopped", "waiting", "ended" and "no bill"
 * apply.
 */
export function planStateWords(view: PlannerView): PlanStateWords {
  const until = view.paidThrough ? formatYmd(view.paidThrough) : null;
  const amount = formatPaise(view.bill.amountPaise || view.priceTotalPaise);
  // How a fresh bill reaches the person depends on the server's in-app resend switch
  // (BILL_RESEND_IN_APP): with it on, writing in the chat sends one by itself (once a
  // day at most) and the phone apps show the button; with it off, only the app opened
  // in a web browser has the button, and nothing goes out by itself. The team reads
  // this to tell the person what to do, so it must say what really happens.
  const comeBack = view.resendInApp
    ? 'When the person writes in the chat, a fresh bill goes on WhatsApp and SMS by itself (at most once a day), or they can tap "Get the payment details again" in the app.'
    : 'Nothing goes out by itself while the in-app resend is switched off, and the phone apps show no button: the person can ask for the payment details again from the app opened in a web browser.';
  const freshLink = view.resendInApp
    ? 'The person can tap "Start again" in the app for fresh payment details on WhatsApp and SMS.'
    : 'The phone apps show no button while the in-app resend is switched off: the person can tap "Start again" in the app opened in a web browser.';

  if (view.convertedAt) {
    return {
      label: 'Switched to Dealer Kavach',
      intent: 'info',
      detail: `Switched on ${formatDate(view.convertedAt)}. Kavach Shuruaat has stopped for this account.`,
    };
  }
  if (view.active) {
    if (view.bill.state === 'stopped') {
      return {
        label: 'Paid · autopay stopped',
        intent: 'warning',
        detail: `Answers continue until ${until ?? 'the end of the paid month'}. After that they stop unless the person starts again.`,
      };
    }
    return {
      label: 'Paid',
      intent: 'success',
      detail: view.bill.autopay
        ? `Paid through ${until ?? '-'}. Autopay is on, so the next month is charged by itself.`
        : `Paid through ${until ?? '-'}. There is no autopay, so the next month needs a new payment.`,
    };
  }
  // ADR 0058 §13.3: a bill left unpaid for 7 days is closed by the daily job (the
  // payment row cancelled, the waiting autopay approval stopped). Nothing is owed
  // now; a fresh bill goes out when the person comes back, so the team need not chase.
  if (view.bill.state === 'closed') {
    return {
      label: 'Closed unpaid (7 days)',
      intent: 'warning',
      detail: `${
        until ? `The paid month ended on ${until}. The renewal bill` : 'The first bill'
      } was not paid within 7 days, so it was closed. Nothing is owed now. ${comeBack}`,
    };
  }
  if (view.bill.state === 'stopped') {
    return {
      label: 'Stopped',
      intent: 'danger',
      detail: until
        ? `Autopay was stopped and access ended on ${until}. ${freshLink}`
        : `Autopay was stopped before the first payment. ${freshLink}`,
    };
  }
  if (view.bill.state === 'sent') {
    return {
      label: 'Waiting for payment',
      intent: 'warning',
      detail: until
        ? `The paid month ended on ${until}. A payment link for ${amount} was sent on WhatsApp and SMS. No answers until it is paid.`
        : `A payment link for ${amount} was sent on WhatsApp and SMS. No answers until it is paid.`,
    };
  }
  if (until) {
    return {
      label: 'Ended',
      intent: 'danger',
      detail: `The paid month ended on ${until}. No answers until the next payment.`,
    };
  }
  return {
    label: 'No bill yet',
    intent: 'neutral',
    detail: 'No payment link has gone out yet, so the chat is not answering.',
  };
}

// ── Switch to Dealer Kavach ──────────────────────────────────────────────────

/** What the admin types to switch a planner over. Strings, as the form holds them. */
export interface ConvertFormValues {
  sapCode: string;
  pumpName: string;
  siteType: '' | 'A' | 'B';
  oilCompany: '' | OilCompanyId;
}

export type ConvertFormErrors = Partial<Record<keyof ConvertFormValues, string>>;

/** The body POST /v1/admin/planners/:dealerId/convert takes (plannerConvertSchema). */
export interface ConvertBody {
  sapCode: string;
  pumpName: string;
  siteType: 'A' | 'B';
  oilCompany: OilCompanyId;
}

/**
 * The form's starting values. The oil company is carried over only when the
 * person had picked one of the three a running pump can be with; "other" and
 * "not decided" were answers for the planning stage and must be chosen afresh.
 */
export function convertFormDefaults(oilCompany: PlannerOilCompany | null | undefined): ConvertFormValues {
  const known = (OIL_COMPANIES as readonly string[]).includes(oilCompany ?? '');
  return {
    sapCode: '',
    pumpName: '',
    siteType: '',
    oilCompany: known ? (oilCompany as OilCompanyId) : '',
  };
}

/**
 * Check the form the way the server's plannerConvertSchema will, but with a
 * sentence per field, so a mistake is fixed before the request instead of
 * coming back as a bare 400.
 */
export function validateConvertForm(
  v: ConvertFormValues,
): { ok: true; body: ConvertBody } | { ok: false; errors: ConvertFormErrors } {
  const errors: ConvertFormErrors = {};
  const sapCode = v.sapCode.trim();
  const pumpName = v.pumpName.trim();
  if (!sapCode) errors.sapCode = 'Enter the SAP code the oil company gave this pump.';
  else if (sapCode.length > 60) errors.sapCode = 'A SAP code is at most 60 characters.';
  if (!pumpName) errors.pumpName = "Enter the pump's name as it is on its board.";
  else if (pumpName.length > 160) errors.pumpName = 'The name is at most 160 characters.';
  if (v.siteType !== 'A' && v.siteType !== 'B') errors.siteType = 'Choose the site type, A or B.';
  if (!v.oilCompany) errors.oilCompany = 'Choose the oil company the pump sells for.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: {
      sapCode,
      pumpName,
      siteType: v.siteType as 'A' | 'B',
      oilCompany: v.oilCompany as OilCompanyId,
    },
  };
}

/**
 * The sentence to show when the switch is refused.
 *
 * A 409 is the server saying no for a reason a person can act on (the SAP code
 * already belongs to a client, or the account is no longer a planner). Its own
 * message is that sentence, so it is shown as is; a 409 with no message still
 * gets a sentence rather than a code.
 */
export function convertErrorSentence(err: { status?: number; message?: string } | null | undefined): string {
  if (err?.status === 409) {
    const msg = err.message?.trim();
    return msg || 'This pump could not be switched: its SAP code is already with another client, or the account has already switched.';
  }
  if (err?.status === 403) return 'Only a super admin can switch an account to Dealer Kavach.';
  if (err?.status === 404) return 'This Kavach Shuruaat account was not found. Reload the page and try again.';
  return 'The switch did not go through. Reload the page to see where it stands, then try again.';
}
