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
