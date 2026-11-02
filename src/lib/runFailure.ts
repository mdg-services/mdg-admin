import type { ServiceRun } from '@dk/shared';

/**
 * Plain-language copy for a failed run, keyed on the run's `failureCode`.
 *
 * The narrow cousin of `creditDodFailure.ts`: that file owns the SDMS scrape's
 * long list of codes and its own diagnostics panel, this one covers the codes
 * any service can raise and feeds the generic "this run didn't finish" notice.
 * Both read the same top-level `failureCode`, which the API serialises for every
 * role precisely so a plain admin — who never receives `steps` — still gets told
 * what happened rather than a shrug.
 */
export interface RunFailureCopy {
  /** One plain-language line: what went wrong. */
  title: string;
  /** What to do next. Overridden by the server's own message when there is one. */
  hint: string;
  /**
   * False when this is the catch-all wording, i.e. the run carried no code we
   * recognise. Callers with somewhere better to send the admin (a toast that
   * would otherwise point at Run history) use it to decide whether saying more
   * here is actually saying anything.
   */
  known: boolean;
}

/** The standard close for a failure the admin can't act on themselves. */
const CONTACT_MDG = 'Please retry. If it keeps happening, contact the MDG team.';

const GENERIC: RunFailureCopy = {
  title: "This run didn't finish.",
  hint: CONTACT_MDG,
  known: false,
};

const CODE_COPY: Record<string, Omit<RunFailureCopy, 'known'>> = {
  /**
   * Raised by the DSR when the day's IRAS shift data could not be obtained —
   * never collected, the portal refused, or the pipeline was busy. The report is
   * computed FROM that snapshot, so without it there is nothing to report: the
   * run fails rather than quietly producing nothing.
   */
  INSUFFICIENT_DATA: {
    title: 'Insufficient Data',
    hint:
      "The shift data this report is built from could not be collected for that day, so the report couldn't be " +
      `produced. ${CONTACT_MDG}`,
  },

  /**
   * Written by the server's stale-run sweep, not by a plugin: this run's process
   * died — a restart, a deploy, an out-of-memory kill — while the run was still
   * going, so nothing ever recorded an outcome for it.
   *
   * Deliberately does NOT close with "contact the MDG team". A restart is
   * routine, nothing was lost, and the schedule picks the day up by itself;
   * sending an admin to raise it as an incident would be asking them to report
   * the weather.
   */
  RUN_ABANDONED: {
    title: "This run didn't finish.",
    hint:
      'The server restarted while it was still running, so it stopped part-way. Nothing was saved from it and ' +
      'nothing was lost. The next scheduled run will pick the day up — press Run now if you need it sooner.',
  },

  /**
   * The calibration claim's two portal pipelines (ADR 0029) — the Bihar weights
   * and measures site ("eMaaptaul") and IndianOil's Calibration Claims pages.
   *
   * Plain words, because a plain admin reads these in a toast. Each says what
   * happened to the CLAIM — above all whether anything reached IndianOil — and
   * what to press next. `UNEXPECTED` is left out on purpose: it is the catch-all
   * every portal service shares, and the generic wording above is already right
   * for it; naming it here would relabel every other service's unknown failure.
   *
   * `LOGIN_REJECTED` and `LOGIN_NO_RESPONSE` are left out for the same reason, and
   * it matters more: the SDMS pipelines (TT density, inspection, water ingress, RO
   * supply, credit and DOD, and the claim's own IndianOil side) and IRAS raise them
   * too, so an eMaaptaul sentence on them would tell an admin that the Bihar login
   * failed when it was IndianOil's, and point at a card that service does not have.
   * The claim's eMaaptaul refusal comes as `WEMMIS_LOGIN_REJECTED` (or
   * `LOGIN_REFUSED_UNCLEAR`), codes no other service uses, and has its own words
   * below. `LOGIN_CAPTCHA_UNSOLVED` is eMaaptaul's alone (SDMS and IRAS say
   * `LOGIN_CAPTCHA_EXHAUSTED`), so its wording is true wherever it shows.
   */
  SITE_UNREACHABLE: {
    title: 'The Bihar weights and measures site did not open.',
    hint: 'The site may be down. Try again in a little while.',
  },
  // One code for every way the site turns the saved login down (a wrong user ID or
  // password, a locked account, an answer in words nobody could read): the claim's
  // runner throws it for all three, so the sentence has to be true for each.
  WEMMIS_LOGIN_REJECTED: {
    title: 'The eMaaptaul login was refused.',
    hint:
      'The user ID or password is wrong, the account is locked, or the site answered in words MDG could not ' +
      'read. MDG stopped rather than try again and risk locking the account. Ask the owner for the login ' +
      'again, or type it in the eMaaptaul login card.',
  },
  LOGIN_REFUSED_UNCLEAR: {
    title: 'The eMaaptaul site turned the login down.',
    hint:
      'It answered in words MDG does not recognise, so the login is treated as refused and MDG stopped rather ' +
      'than lock the account. Ask the owner for the login again, or type it in the eMaaptaul login card.',
  },
  LOGIN_CAPTCHA_UNSOLVED: {
    title: 'The picture code on the eMaaptaul sign-in could not be read.',
    hint: 'Try again. If a person is asked to type the code, it shows at the top of the Calibration claim pane.',
  },
  // A plain Run now on an outlet with no open claim starts this year's; this is
  // when it cannot. The server's message opens with this title (no full stop, as
  // INSUFFICIENT_DATA's does), so the hint shown is its reason: the year already
  // has a claim, the service is paused, the outlet is not with IndianOil.
  CLAIM_NOT_STARTED: {
    title: 'The claim could not be started',
    hint: 'Open the Data Vault tab, choose Calibration claim, and start the claim for the year you need there.',
  },
  ACCOUNT_LOCKED: {
    title: 'The eMaaptaul account is locked.',
    hint:
      'The owner can reset the password with the one-time code, or have the weights and measures office unlock ' +
      'it. Until then, upload the papers by hand.',
  },
  MOBILE_NOT_REGISTERED: {
    title: 'That mobile number is not registered on eMaaptaul.',
    hint: 'Ask the owner which number the eMaaptaul login was made with, or ask for the login itself.',
  },
  OTP_NOT_SENT: {
    title: 'The site did not send the one-time code.',
    hint: 'Start the reset again in a little while.',
  },
  OTP_TIMEOUT: {
    title: 'The one-time code was not typed in time.',
    hint: 'It only lasts two minutes. Ask the owner to be ready at the phone, then start the reset again.',
  },
  OTP_REJECTED: {
    title: 'The one-time code was wrong.',
    hint: 'Start the reset again and type the code from the newest message.',
  },
  RESET_NO_USER_CHOSEN: {
    title: 'The owner did not choose which login is the pump’s.',
    hint: 'Several logins use that mobile number. Start the reset again and ask the owner to pick the pump’s.',
  },
  RESET_FAILED: {
    title: 'The eMaaptaul password could not be reset.',
    hint: 'Try again. If it keeps failing, upload the papers by hand.',
  },
  RECEIPTS_PAGE_NOT_FOUND: {
    title: 'The page with the papers on eMaaptaul was not found.',
    hint: 'The site may have changed. Upload the papers by hand for now, and tell the MDG team.',
  },
  NO_VENDOR_IDS: {
    title: 'No pump was found under this eMaaptaul login.',
    hint: 'The login may belong to another business. Check the user ID with the owner.',
  },
  CERTIFICATE_DOWNLOAD_FAILED: {
    title: 'The certificate could not be downloaded.',
    hint: 'Try again. If it keeps failing, upload the certificate by hand.',
  },
  RECEIPT_NOT_FOUND: {
    title: 'The receipt for this certificate was not found.',
    hint: 'Upload the receipt by hand, or ask the owner to send it.',
  },
  SESSION_EXPIRED: {
    title: 'The portal signed us out part-way.',
    hint: 'Try again. It usually works the second time.',
  },
  CAPTURE_TIMEOUT: {
    title: 'The run took too long and was stopped.',
    hint: 'The portal was slow. Try again.',
  },
  BROWSER_LAUNCH_FAILED: {
    title: 'The robot’s browser could not start on the server.',
    hint: 'This needs a fix on our side. Please contact the MDG team.',
  },
  CLAIMS_LINK_NOT_FOUND: {
    title: 'The Calibration Claims link was not found on IndianOil’s portal.',
    hint: 'Nothing was changed. The portal’s menu may have changed — please contact the MDG team.',
  },
  CLAIMS_PAGE_UNEXPECTED: {
    title: 'IndianOil’s Calibration Claims page did not look as expected.',
    hint: 'Nothing was changed. Please contact the MDG team.',
  },
  DEALER_CODE_MISMATCH: {
    title: 'The portal is signed in to a different outlet.',
    hint: 'The dealer code on its page does not match this outlet. Check the SDMS login saved for it.',
  },
  CLAIM_TYPE_NOT_FOUND: {
    title: 'The yearly calibration claim was not on the portal’s list.',
    hint: 'Nothing was changed. Please contact the MDG team.',
  },
  FINANCIAL_YEAR_NOT_OFFERED: {
    title: 'IndianOil does not offer this financial year for a claim.',
    hint: 'Check the year the claim was started for. An older year may be closed on the portal.',
  },
  CLAIM_ALREADY_EXISTS: {
    title: 'IndianOil already has a claim for this year.',
    hint:
      'Nothing was typed. Look at that claim on the portal; if it is this one, mark it as filed by hand from the ' +
      'claim’s menu.',
  },
  DU_TABLE_UNREADABLE: {
    title: 'The list of dispensing units on the portal could not be read.',
    hint: 'Nothing was changed. Try again.',
  },
  DU_MISMATCH: {
    title: 'The units on the portal do not match the claim.',
    hint:
      'Compare them with the certificate. Use Corrections to leave out a unit that should not be claimed, then ' +
      'try again.',
  },
  FORMATION_UNREADABLE: {
    title: 'The claim form on the portal could not be read.',
    hint: 'Nothing was submitted. Please contact the MDG team.',
  },
  FORMATION_ROWS_MISMATCH: {
    title: 'The portal’s nozzle rows do not match the plan.',
    hint: 'Nothing was submitted. Check the units and their nozzles, then try again.',
  },
  FIELD_DID_NOT_STICK: {
    title: 'The portal did not keep a value that was typed in.',
    hint: 'Nothing was submitted. Try again; if it keeps happening, contact the MDG team.',
  },
  VALIDATION_REJECTED: {
    title: 'The portal refused the claim’s figures.',
    hint: 'Check them against the certificate and the receipt, fix any with Corrections, then try again.',
  },
  UPLOAD_FIELD_NOT_FOUND: {
    title: 'The portal’s upload box was not found.',
    hint: 'The page may have changed. Please contact the MDG team.',
  },
  UPLOAD_REJECTED: {
    title: 'The portal refused one of the papers.',
    hint: 'Replace that paper with a clearer copy, then try again.',
  },
  VERIFY_REJECTED: {
    title: 'The portal refused the claim at its last check.',
    hint: 'Nothing was finalized. Check the papers and the figures, then try again.',
  },
  FINALIZE_SUMMARY_MISMATCH: {
    title: 'The portal’s totals did not match the plan, so it was not finalized.',
    hint: 'Nothing was finalized. Compare the portal’s totals with the plan, then try again.',
  },
  FINALIZE_REJECTED: {
    title: 'The portal refused to finalize the claim.',
    hint: 'Look at the claim on the portal before trying again.',
  },
  DRAFT_NOT_FOUND: {
    title: 'The saved claim was not found on the portal.',
    hint: 'Look under View Claims on IndianOil. If it was filed by hand, mark it as filed from the claim’s menu.',
  },
};

/**
 * The failure headline and next step for a run.
 *
 * The server's own message wins as the hint when it carries one: for a known
 * code it is the same sentence written with the actual date and reason in it,
 * which is strictly more useful than the generic wording here.
 */
export function describeRunFailure(
  run: Pick<ServiceRun, 'failureCode' | 'error'>,
): RunFailureCopy {
  const code = run.failureCode?.trim();
  const copy = code ? CODE_COPY[code] : undefined;
  if (!copy) return GENERIC;

  const message = run.error?.message?.trim();
  // The message opens with the headline ("Insufficient Data — …"); the hint
  // should not repeat it, so show only what follows.
  const detail = message
    ?.replace(new RegExp(`^\\s*${escapeRegExp(copy.title)}\\s*[—-]\\s*`, 'i'), '')
    .trim();
  return {
    ...copy,
    hint: detail && detail !== message ? capitalise(detail) : copy.hint,
    known: true,
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
