import type { ServiceRunWithSteps } from '@/types/serviceRun';

export interface CreditDodFailureCopy {
  /** One plain-language sentence: what went wrong. */
  title: string;
  /** What the operator should do next. */
  hint: string;
}

const UNEXPECTED_COPY: CreditDodFailureCopy = {
  title: 'An unexpected error occurred during the scrape.',
  hint: 'Open the failure screenshot below and check the server logs.',
};

/**
 * Plain-language copy for each `credit-dod-monitoring` failure code. The code
 * comes off the error step's `meta.code` (see {@link describeCreditDodFailure}).
 */
export const CODE_COPY: Record<string, CreditDodFailureCopy> = {
  LOGIN_PAGE_UNREACHABLE: {
    title: "Couldn't reach the SDMS login page.",
    hint: "SDMS may be down or the server can't reach it. Retry; if it persists, check server connectivity.",
  },
  LOGIN_REJECTED: {
    title: 'SDMS rejected the login.',
    hint: "The dealer's SDMS username/password is wrong, or the account is locked. Fix the credentials in the SDMS section and retry.",
  },
  LOGIN_CAPTCHA_EXHAUSTED: {
    title: "Couldn't read the login captcha.",
    hint: 'Usually temporary — retry the run. If it keeps happening, the captcha style may have changed.',
  },
  OCR_SIDECAR_UNAVAILABLE: {
    title: "The captcha reader isn't available on the server.",
    hint: 'This needs engineering — the OCR sidecar (Python venv) is missing or broken. See mdg-backend/ocr/README.md.',
  },
  DASHBOARD_UNREACHABLE: {
    title: "Logged in, but the SDMS dashboard didn't load.",
    hint: 'Retry; if it persists, SDMS may have changed.',
  },
  ELEDGER_LINK_MISSING: {
    title: "SDMS's menu changed — the Credit Monitoring / PAD link wasn't found.",
    hint: 'This needs a scraper update (menu IDs changed).',
  },
  SESSION_EXPIRED: {
    title: 'The SDMS session expired mid-run.',
    hint: 'Retry — this usually happens when the captcha took many attempts.',
  },
  CREDIT_MONITORING_FAILED: {
    title: "Couldn't read the Credit Monitoring page.",
    hint: 'Portal was slow or changed. Retry; if it persists, needs a scraper update.',
  },
  PAD_NAV_FAILED: {
    title: "Couldn't open the PAD Statement page.",
    hint: 'Portal was slow or changed. Retry.',
  },
  RETRIVEDATA_HTTP: {
    title: 'SDMS returned an error while fetching the ledger.',
    hint: 'A portal-side issue. Retry.',
  },
  RETRIVEDATA_EMPTY: {
    title: 'SDMS returned no ledger rows.',
    hint: 'Portal issue or the date window has no data. Retry.',
  },
  BROWSER_LAUNCH_FAILED: {
    title: "The browser couldn't start on the server.",
    hint: 'This needs engineering — Playwright/Chromium isn\'t installed.',
  },
  CAPTURE_TIMEOUT: {
    title: 'The run took too long and was stopped.',
    hint: 'The portal was slow or hung. Retry.',
  },
  UNEXPECTED: UNEXPECTED_COPY,
  UNKNOWN: UNEXPECTED_COPY,
};

/** Fallback for any code we don't recognise. */
const DEFAULT_COPY: CreditDodFailureCopy = {
  title: 'The run failed.',
  hint: 'Open the failure screenshot below and check the server logs. If it persists, contact engineering.',
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
 * Priority for the code: the error step's `meta.code`, then a `[CODE]` token
 * parsed out of `run.error.message`. Priority for the phase: `meta.phase`, then
 * the error step's `name`.
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

  // 1. Prefer the structured code from the error step's meta.
  let code = asString(meta?.code);

  // 2. Fall back to parsing `[CODE]` out of the error message.
  if (!code && message) {
    const match = message.match(/\[([A-Z0-9_]+)\]/);
    if (match) code = match[1] ?? null;
  }

  // Phase: prefer meta.phase, else the error step's name.
  const phase = asString(meta?.phase) ?? asString(errorStep?.name);

  const copy = (code && CODE_COPY[code]) || DEFAULT_COPY;

  return { code, phase, copy, message };
}
