import type { ServiceRunWithSteps } from '@/types/serviceRun';

export interface CreditDodFailureCopy {
  /** One plain-language sentence: what went wrong. */
  title: string;
  /**
   * What to do next, written for a super-admin — may name the server, the
   * scraper or engineering.
   */
  hint: string;
  /**
   * What to do next, written for a plain admin: no internals, no logs, no
   * "contact engineering". Falls back to {@link CreditDodFailureCopy.hint}
   * when the super-admin wording is already safe to show anyone.
   */
  adminHint?: string;
}

/** The standard "we'll handle it" close for failures an admin can't act on. */
const CONTACT_MDG = 'Please retry. If it keeps happening, contact the MDG team.';

const UNEXPECTED_COPY: CreditDodFailureCopy = {
  title: 'An unexpected error occurred during the scrape.',
  hint: 'Open the failure screenshot below and check the server logs.',
  adminHint: CONTACT_MDG,
};

/**
 * Plain-language copy for each `credit-dod-monitoring` failure code. The code
 * comes off the run's top-level `failureCode` (see
 * {@link describeCreditDodFailure}).
 */
export const CODE_COPY: Record<string, CreditDodFailureCopy> = {
  LOGIN_PAGE_UNREACHABLE: {
    title: "Couldn't reach the SDMS login page.",
    hint: "SDMS may be down or the server can't reach it. Retry; if it persists, check server connectivity.",
    adminHint:
      'SDMS may be temporarily down. Please retry in a few minutes; if it keeps happening, contact the MDG team.',
  },
  LOGIN_REJECTED: {
    title: 'SDMS rejected the login.',
    hint: "The dealer's SDMS username/password is wrong, or the account is locked. Fix the credentials in the SDMS section and retry.",
  },
  LOGIN_CAPTCHA_EXHAUSTED: {
    title: "Couldn't read the login captcha.",
    hint: 'Usually temporary — retry the run. If it keeps happening, the captcha style may have changed.',
    adminHint: `Usually temporary. ${CONTACT_MDG}`,
  },
  LOGIN_CHALLENGE_EXHAUSTED: {
    title: "SDMS kept refusing the login's security verification.",
    hint:
      "SDMS now asks an arithmetic question ('3 x 2 = ?') instead of a picture captcha. We read it and answered it " +
      'correctly every time and the portal still refused, which is usually a portal-side wobble. Retry; if it ' +
      "persists, check the run's attempt diagnostics — the question and the answer we sent are recorded there.",
    adminHint: `SDMS didn't accept our sign-in checks this time. ${CONTACT_MDG}`,
  },
  LOGIN_CHALLENGE_NOT_FOUND: {
    title: 'SDMS changed its login page — the security verification is gone.',
    hint:
      'This needs a scraper update, not a retry: the login page showed no question we could answer and no captcha ' +
      "image, or nowhere to type the answer. The failure diagnostics carry what the page WAS showing. (SDMS " +
      'replaced its image captcha with a math question once already; this is the code that says it has changed again.)',
    adminHint: 'This one needs a fix at our end — please contact the MDG team.',
  },
  LOGIN_CHALLENGE_UNAVAILABLE: {
    title: "SDMS didn't show its security question this time.",
    hint: "The login page loaded but the security-verification block never rendered — a portal-side blip, not a changed form. Nothing was submitted, and the run is retried automatically in about 20 minutes.",
    adminHint:
      'SDMS was having a moment and did not show us its security question. Nothing to do — we retry automatically shortly.',
  },
  OCR_SIDECAR_UNAVAILABLE: {
    title: "The captcha reader isn't available on the server.",
    hint: 'This needs engineering — the OCR sidecar (Python venv) is missing or broken. See mdg-backend/ocr/README.md.',
    adminHint:
      'This one needs a fix at our end — please contact the MDG team.',
  },
  DASHBOARD_UNREACHABLE: {
    title: "Logged in, but the SDMS dashboard didn't load.",
    hint: 'Retry; if it persists, SDMS may have changed.',
    adminHint: CONTACT_MDG,
  },
  ELEDGER_LINK_MISSING: {
    title: "SDMS's menu changed — the Credit Monitoring / PAD link wasn't found.",
    hint: 'This needs a scraper update (menu IDs changed).',
    adminHint:
      'This one needs a fix at our end — please contact the MDG team.',
  },
  SESSION_EXPIRED: {
    title: 'The SDMS session expired mid-run.',
    hint: 'Retry — this usually happens when the captcha took many attempts.',
    adminHint: 'Please retry — this usually clears on the next attempt.',
  },
  ELEDGER_HANDOFF_FAILED: {
    title: "SDMS wouldn't open the eledger page for this login.",
    hint:
      "A known IndianOil-side flake: the eledger app is load-balanced across several servers and the handoff " +
      "occasionally lands on one that doesn't hold our session, which answers with its (missing) error page. " +
      'The run already retried with a freshly-issued link and still got it. Retry; if it persists for hours, ' +
      'SDMS itself is degraded.',
    adminHint:
      "SDMS didn't open the report page for us this time — that's on their side, not ours. Please retry in a few minutes.",
  },
  SDMS_CREDENTIALS_MISSING: {
    title: "This dealer has no SDMS login saved.",
    hint: "Add the dealer's IndianOil SDMS username and password in the SDMS section, then run again. Until then every scheduled run will fail the same way.",
    adminHint:
      "We don't have this dealer's IndianOil login on file yet. Please add it in the dealer's SDMS section, or contact the MDG team.",
  },
  ACCOUNT_COOLDOWN: {
    title: "Paused: SDMS keeps rejecting this dealer's login.",
    hint:
      "The account breaker tripped after consecutive rejected logins, so we've stopped trying in order to protect " +
      "the dealer's IndianOil account from being locked out. Check the SDMS username/password for this dealer; " +
      'runs resume automatically once the cooldown expires.',
    adminHint:
      "We've paused this dealer's reports for a short while because SDMS kept rejecting the login — this protects " +
      'the account from being locked. Please check the SDMS username and password, then contact the MDG team if they look right.',
  },
  CREDIT_MONITORING_FAILED: {
    title: "Couldn't read the Credit Monitoring page.",
    hint: 'The page loaded but did not contain the expected figures — this usually means SDMS changed its layout and the parser needs an update.',
    adminHint: `SDMS returned something we didn't recognise. ${CONTACT_MDG}`,
  },
  PAD_NAV_FAILED: {
    title: "Couldn't open the PAD Statement page.",
    hint: 'Portal was slow or changed. Retry.',
    adminHint: `SDMS was slow to respond. ${CONTACT_MDG}`,
  },
  RETRIVEDATA_HTTP: {
    title: 'SDMS returned an error while fetching the ledger.',
    hint: 'A portal-side issue. Retry.',
    adminHint: `This came from SDMS, not from us. ${CONTACT_MDG}`,
  },
  RETRIVEDATA_EMPTY: {
    title: 'SDMS returned no ledger rows.',
    hint: 'Portal issue or the date window has no data. Retry.',
    adminHint: `SDMS sent back no transactions for this period. ${CONTACT_MDG}`,
  },
  BROWSER_LAUNCH_FAILED: {
    title: "The browser couldn't start on the server.",
    hint: "This needs engineering — Playwright/Chromium isn't installed.",
    adminHint:
      'This one needs a fix at our end — please contact the MDG team.',
  },
  CAPTURE_TIMEOUT: {
    title: 'The run took too long and was stopped.',
    hint: 'The portal was slow or hung. Retry.',
    adminHint: `SDMS was unusually slow. ${CONTACT_MDG}`,
  },
  UNEXPECTED: UNEXPECTED_COPY,
  UNKNOWN: UNEXPECTED_COPY,
};

/** Fallback for any code we don't recognise. */
const DEFAULT_COPY: CreditDodFailureCopy = {
  title: 'The run failed.',
  hint: 'Open the failure screenshot below and check the server logs. If it persists, contact engineering.',
  adminHint: CONTACT_MDG,
};

export interface CreditDodFailureInfo {
  /** Resolved failure code, or `null` if none could be found. */
  code: string | null;
  /** The phase/step the run failed at, or `null`. */
  phase: string | null;
  /** Plain-language copy for the resolved code (never null). */
  copy: CreditDodFailureCopy;
  /** Raw error message (from `run.error` or the error step). */
  message: string | null;
}

/** The last step marked as an error, if any. */
function findErrorStep(run: ServiceRunWithSteps) {
  const steps = run.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    if (step && step.status === 'error') return step;
  }
  return undefined;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Resolve the failure code + phase for a failed `credit-dod-monitoring` run.
 *
 * Priority for the code: the run's top-level `failureCode` (the only one a
 * plain admin is served), then the error step's `meta.code`, then a `[CODE]`
 * token parsed out of `run.error.message`. Priority for the phase: the run's
 * top-level `failurePhase`, then `meta.phase`, then the error step's `name`.
 */
export function describeCreditDodFailure(
  run: ServiceRunWithSteps,
): CreditDodFailureInfo {
  const errorStep = findErrorStep(run);
  const meta = errorStep?.meta as Record<string, unknown> | undefined;

  const message =
    asString(run.error?.message) ??
    asString(errorStep?.error?.message) ??
    asString(errorStep?.message);

  // 1. Prefer the top-level code the API serialises for every role.
  let code = asString(run.failureCode);

  // 2. Fall back to the structured code on the error step's meta.
  if (!code) code = asString(meta?.code);

  // 3. Last resort: parse `[CODE]` out of the error message.
  if (!code && message) {
    const match = message.match(/\[([A-Z0-9_]+)\]/);
    if (match) code = match[1] ?? null;
  }

  // Phase: prefer the top-level value the API serialises for every role, then
  // meta.phase, then the error step's name.
  const phase =
    asString(run.failurePhase) ??
    asString(meta?.phase) ??
    asString(errorStep?.name);

  const known = code ? CODE_COPY[code] : undefined;
  // An unrecognised code can still carry a server-written hint.
  const serverHint = asString(run.failureHint);
  const copy: CreditDodFailureCopy =
    known ??
    (serverHint
      ? { title: DEFAULT_COPY.title, hint: serverHint, adminHint: serverHint }
      : DEFAULT_COPY);

  return { code, phase, copy, message };
}
