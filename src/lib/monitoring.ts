/**
 * Where the team app writes down what went wrong, for the voice recorder first.
 *
 * The dealer app sends these reports to its error-reporting service. The team app
 * has no such service yet, so this file keeps the same two calls (`addCrumb`,
 * `reportIssue`) and writes the report to the browser console, with the last few
 * steps that led up to it. Code that reports stays the same as the dealer app's,
 * and connecting a real service later means changing only this file.
 *
 * Nothing here may throw: it runs at the moment something is already going wrong.
 */

type Level = 'fatal' | 'error' | 'warning' | 'info';

interface Issue {
  /** Short, stable, easy to search for (`mic.blocked`). */
  name: string;
  level?: Level;
  /** The few facts worth filtering on. */
  tags?: Record<string, string | number | boolean | undefined>;
  /** The full detail, read once the report is open. */
  extra?: Record<string, unknown>;
  error?: unknown;
}

interface Crumb {
  at: number;
  message: string;
  data?: Record<string, unknown>;
}

/** The steps kept for the next report. Enough to see how a press went, no more. */
const MAX_CRUMBS = 20;
const crumbs: Crumb[] = [];

/** Note a step in a flow. Cheap: it only appends to a short list. */
export function addCrumb(message: string, data?: Record<string, unknown>): void {
  try {
    crumbs.push({ at: Date.now(), message, data });
    if (crumbs.length > MAX_CRUMBS) crumbs.shift();
  } catch {
    /* never let a note break the flow it describes */
  }
}

/**
 * Report something that went wrong. A refused or failed microphone is a handled
 * path, not a crash, so nothing would ever show it unless it is reported here.
 */
export function reportIssue(issue: Issue): void {
  try {
    const { name, level = 'error', tags, extra, error } = issue;
    const log = level === 'info' ? console.info : console.warn;
    log(`[${name}]`, { level, tags, extra, error, steps: [...crumbs] });
  } catch {
    /* a console that throws has nothing to tell us */
  }
}
