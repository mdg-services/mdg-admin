import {
  Check,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ScanSearch,
  ServerCrash,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import * as React from 'react';

import { Badge, Button, Checkbox, Skeleton, Textarea, useToast } from '@/components/ui';
import {
  aiCheckPending,
  useAcknowledgeAiCheck,
  useAiCheck,
  useReportAiMiss,
  useRerunAiCheck,
} from '@/hooks/api/useAiCheck';
import { aiBadge, scopeWords, sinceWords, waitingProblems } from '@/lib/aiCheck';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { AI_UNCHECKED_ID, type AiCheckKind, type AiCheckView, type AiProblem } from '@dk/shared';

/**
 * The AI report check, at the top of a report (ADR 0031).
 *
 * The answer to "can I send this, and did anything look at it?" before the admin
 * reads a single figure. Four looks, and each is meant to be told apart from
 * across the room:
 *
 *  - GREEN, a shield with a tick: the AI checked it and everything adds up — and
 *    it says WHAT it checked, with the figures, because "trust me" builds no
 *    confidence and "sales match the meters: 4,210 L" does.
 *  - RED, a full-width band: the AI found problems. Each one in plain words —
 *    what we saw, why it matters, what to do — with its own "I checked this".
 *    The report goes to nobody, by any route, until every one is ticked.
 *  - BLUE, moving: still checking. Nothing can be sent yet.
 *  - AMBER: the AI could not check it. Try again, or say you checked it yourself.
 */
export function AiCheckPanel({
  kind,
  reportId,
  className,
}: {
  kind: AiCheckKind;
  reportId: string;
  className?: string;
}) {
  const q = useAiCheck(kind, reportId);
  const view = q.data ?? null;
  const what = kind === 'dsr' ? 'report' : 'card';

  if (q.isLoading) {
    return (
      <div className={cn('rounded-lg border border-border bg-surface p-4', className)}>
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>
    );
  }
  if (q.isError || !view) {
    return (
      <div className={cn('rounded-lg border border-border bg-surface p-3 text-sm text-text-muted', className)}>
        The AI check could not be loaded.{' '}
        <button
          type="button"
          onClick={() => void q.refetch()}
          className="min-h-11 font-medium text-brand underline-offset-2 hover:underline md:min-h-0"
        >
          Try again
        </button>
      </div>
    );
  }
  if (view.state === 'OFF') return null;

  if (aiCheckPending(view)) return <Checking view={view} what={what} className={className} />;
  if (view.state === 'COULD_NOT_CHECK') {
    return <CouldNotCheck view={view} kind={kind} what={what} className={className} />;
  }
  if (view.state === 'NEEDS_REVIEW') {
    return <Problems view={view} kind={kind} what={what} className={className} />;
  }
  return <Passed view={view} kind={kind} what={what} className={className} />;
}

/** The small status beside a report's title. */
export function AiCheckBadge({ kind, reportId }: { kind: AiCheckKind; reportId: string }) {
  const q = useAiCheck(kind, reportId);
  const look = aiBadge(q.data);
  if (!look) return null;
  return <Badge intent={look.intent}>{look.label}</Badge>;
}

// ── still checking ──────────────────────────────────────────────────────────

function Checking({ view, what, className }: { view: AiCheckView; what: string; className?: string }) {
  // Re-render each few seconds so "for 40 seconds" counts up while it works.
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const t = setInterval(tick, 5_000);
    return () => clearInterval(t);
  }, []);
  const since = view.startedAt ?? view.queuedAt;
  return (
    <section
      aria-live="polite"
      className={cn('relative overflow-hidden rounded-lg border border-info bg-info-soft p-4', className)}
    >
      {/* A slow sweep across the top edge: it is working, not stuck. */}
      <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-info/15" aria-hidden>
        <div className="h-full w-1/3 animate-[aicheck-sweep_1.6s_ease-in-out_infinite] bg-info" />
      </div>
      <div className="flex items-start gap-3">
        <ScanSearch width={24} height={24} strokeWidth={1.75} className="mt-0.5 shrink-0 text-info-strong md:text-info" aria-hidden />
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-semibold text-info-strong md:text-info">
            The AI is checking this {what}
            <Loader2 width={16} height={16} strokeWidth={2} className="animate-spin" aria-hidden />
          </p>
          <p className="mt-1 text-sm text-text">
            It reads every figure and looks up this outlet’s own data — the days before, the portal’s
            readings, the deliveries — to see that it all adds up. It usually takes two to four minutes.
          </p>
          <p className="mt-1 text-sm font-medium text-text">
            Nothing can be sent to the dealer until it finishes.
            {since ? <span className="font-normal text-text-muted"> Working for {sinceWords(since)}.</span> : null}
          </p>
        </div>
      </div>
      <style>{`@keyframes aicheck-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
@media (prefers-reduced-motion: reduce) { [class*="aicheck-sweep"] { animation: none !important; } }`}</style>
    </section>
  );
}

// ── passed (clear, or every problem ticked) ─────────────────────────────────

function Passed({
  view,
  kind,
  what,
  className,
}: {
  view: AiCheckView;
  kind: AiCheckKind;
  what: string;
  className?: string;
}) {
  const result = view.result;
  const reviewed = view.state === 'REVIEWED';
  const heldElsewhere = (result?.problems ?? []).filter((p) => p.heldByRuleCheck);
  const ticked = (result?.problems ?? []).filter((p) => !p.heldByRuleCheck);
  return (
    <section className={cn('rounded-lg border-2 border-success bg-success-soft p-4', className)}>
      <div className="flex items-start gap-3">
        <ShieldCheck width={28} height={28} strokeWidth={1.75} className="shrink-0 text-success-strong md:text-success" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-success-strong md:text-lg">
            {reviewed
              ? heldElsewhere.length > 0 && ticked.length === 0
                ? `The AI agrees with the correctness check below`
                : `Checked by a person — this ${what} can be sent`
              : `AI checked this ${what} — everything adds up`}
          </p>
          {result?.summary ? <p className="mt-1 text-sm text-text">{result.summary}</p> : null}
          {heldElsewhere.length > 0 ? (
            <p className="mt-1 text-sm font-medium text-text">
              The correctness check further down is still holding this report. Release it there.
            </p>
          ) : null}
        </div>
      </div>

      {result && result.checked.length > 0 ? (
        <div className="mt-3 rounded-md bg-surface/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-subtle">What the AI checked</p>
          <ul className="mt-2 grid gap-2">
            {result.checked.map((c) => (
              <li key={c.title} className="flex items-start gap-2 text-sm">
                <CheckCircle2 width={16} height={16} strokeWidth={2} className="mt-0.5 shrink-0 text-success" aria-hidden />
                <span className="min-w-0">
                  <span className="font-medium text-text">{c.title}.</span>{' '}
                  <span className="text-text-muted">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {reviewed && ticked.length > 0 ? (
        <details className="mt-3 min-w-0">
          <summary className="min-h-11 cursor-pointer select-none py-2 text-sm font-medium text-text">
            What the AI found, and who checked it ({ticked.length})
          </summary>
          <div className="grid gap-2 pb-1">
            {ticked.map((p) => (
              <ProblemCard key={p.id} problem={p} view={view} kind={kind} />
            ))}
          </div>
        </details>
      ) : null}

      <Footer view={view} kind={kind} />
    </section>
  );
}

// ── problems waiting for a person ──────────────────────────────────────────

function Problems({
  view,
  kind,
  what,
  className,
}: {
  view: AiCheckView;
  kind: AiCheckKind;
  what: string;
  className?: string;
}) {
  const result = view.result!;
  const waiting = waitingProblems(view);
  const likelyWrong = waiting.some((p) => p.severity === 'LIKELY_WRONG');
  const others = result.problems.filter((p) => !waiting.includes(p));
  const n = waiting.length;

  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg border-2',
        likelyWrong ? 'border-danger' : 'border-warning',
        className,
      )}
    >
      {/* The band. Full width and solid, so it cannot be scrolled past as one
          more grey card on a page full of them. */}
      <div className={cn('flex items-start gap-3 px-4 py-3 text-white', likelyWrong ? 'bg-danger-strong md:bg-danger' : 'bg-warning-strong md:bg-warning')}>
        <ShieldAlert width={28} height={28} strokeWidth={2} className="shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="text-base font-bold md:text-lg">
            {likelyWrong
              ? `Stop — the AI found ${n === 1 ? 'a problem' : `${n} problems`} in this ${what}`
              : `Check before sending — the AI found ${n === 1 ? 'one thing' : `${n} things`} to look at`}
          </p>
          <p className="mt-0.5 text-sm text-white/95">
            This {what} will not go to the dealer — not from here and not automatically — until a person has
            looked at {n === 1 ? 'it' : 'each one'} and ticked “I checked this”.
          </p>
        </div>
      </div>

      <div className="grid gap-3 bg-surface p-3 md:p-4">
        {result.summary ? <p className="text-sm text-text">{result.summary}</p> : null}
        {waiting.map((p, i) => (
          <ProblemCard key={p.id} problem={p} view={view} kind={kind} number={n > 1 ? i + 1 : undefined} />
        ))}
        {others.map((p) => (
          <ProblemCard key={p.id} problem={p} view={view} kind={kind} />
        ))}

        {result.checked.length > 0 ? (
          <details className="min-w-0 rounded-md border border-border px-3">
            <summary className="min-h-11 cursor-pointer select-none py-2.5 text-sm font-medium text-text">
              What the AI checked and found right ({result.checked.length})
            </summary>
            <ul className="grid gap-2 pb-3">
              {result.checked.map((c) => (
                <li key={c.title} className="flex items-start gap-2 text-sm">
                  <Check width={16} height={16} strokeWidth={2} className="mt-0.5 shrink-0 text-success" aria-hidden />
                  <span className="min-w-0">
                    <span className="font-medium text-text">{c.title}.</span>{' '}
                    <span className="text-text-muted">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {result.dismissed.length > 0 ? (
          <details className="min-w-0 rounded-md border border-border px-3">
            <summary className="min-h-11 cursor-pointer select-none py-2.5 text-sm font-medium text-text">
              The AI looked again at {result.dismissed.length === 1 ? 'one thing' : `${result.dismissed.length} things`} and
              decided {result.dismissed.length === 1 ? 'it is' : 'they are'} fine
            </summary>
            <ul className="grid gap-2 pb-3">
              {result.dismissed.map((d) => (
                <li key={d.title} className="text-sm">
                  <span className="font-medium text-text">{d.title}.</span>{' '}
                  <span className="text-text-muted">{d.reason}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <Footer view={view} kind={kind} />
      </div>
    </section>
  );
}

const SEVERITY_LOOK = {
  LIKELY_WRONG: { label: 'Likely wrong', intent: 'danger' as const, rail: 'border-l-danger' },
  PLEASE_CHECK: { label: 'Please check', intent: 'warning' as const, rail: 'border-l-warning' },
};

function ProblemCard({
  problem,
  view,
  kind,
  number,
}: {
  problem: AiProblem;
  view: AiCheckView;
  kind: AiCheckKind;
  number?: number;
}) {
  const ack = view.acknowledgements.find((a) => a.problemId === problem.id) ?? null;
  const look = SEVERITY_LOOK[problem.severity];
  const where = scopeWords(problem);

  return (
    <article
      className={cn(
        'min-w-0 rounded-md border border-border border-l-4 bg-surface p-3',
        ack ? 'border-l-success opacity-90' : look.rail,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {ack ? <Badge intent="success">Checked ✓</Badge> : <Badge intent={look.intent}>{look.label}</Badge>}
        {where ? <span className="text-xs text-text-subtle">{where}</span> : null}
      </div>
      <h3 className="mt-1.5 text-base font-semibold text-text">
        {number ? `${number}. ` : ''}
        {problem.title}
      </h3>
      <dl className="mt-2 grid gap-2 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-subtle">What we saw</dt>
          <dd className="mt-0.5 text-text">{problem.whatWeSaw}</dd>
        </div>
        {problem.whyItMatters ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-subtle">Why it matters</dt>
            <dd className="mt-0.5 text-text">{problem.whyItMatters}</dd>
          </div>
        ) : null}
        {problem.whatToDo ? (
          <div className="rounded-md bg-info-soft px-2.5 py-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-info-strong md:text-info">What to do</dt>
            <dd className="mt-0.5 font-medium text-text">{problem.whatToDo}</dd>
          </div>
        ) : null}
      </dl>

      {problem.heldByRuleCheck ? (
        <p className="mt-2 text-sm text-text-muted">
          The correctness check further down is holding the report for this. Fix the figure and make the report again,
          or release it there with a reason.
        </p>
      ) : ack ? (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-success-strong md:text-success">
          <Check width={16} height={16} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0">
            Checked by {ack.byName ?? 'an admin'} on {formatDateTime(ack.at)}
            {ack.aiWasRight === false ? ' · marked a false alarm' : ack.aiWasRight ? ' · marked worth checking' : ''}
            {ack.note ? <span className="text-text"> — “{ack.note}”</span> : null}
          </span>
        </p>
      ) : (
        <TickForm kind={kind} reportId={view.reportId} problemIds={[problem.id]} />
      )}
    </article>
  );
}

/**
 * "I checked this". Two steps, so a tick is never one stray tap: the button
 * opens a short form, and the form's own button sends it. The note is optional
 * and is kept with the tick; "remember" makes it a standing note the AI reads on
 * this outlet's next reports, so it does not raise the same thing tomorrow.
 */
function TickForm({
  kind,
  reportId,
  problemIds,
  label = 'I checked this — it is fine',
  myself = false,
}: {
  kind: AiCheckKind;
  reportId: string;
  problemIds: string[];
  label?: string;
  myself?: boolean;
}) {
  const toast = useToast();
  const ack = useAcknowledgeAiCheck(kind, reportId);
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [remember, setRemember] = React.useState(false);
  const [aiWasRight, setAiWasRight] = React.useState<boolean | null>(null);

  async function submit() {
    try {
      await ack.mutateAsync({
        problemIds,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(remember && note.trim() ? { remember: true } : {}),
        ...(aiWasRight !== null ? { aiWasRight } : {}),
      });
      toast.success(myself ? 'Noted. You can send it now.' : 'Ticked.');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save that. Try again.');
    }
  }

  if (!open) {
    return (
      <div className="mt-3">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Check width={14} height={14} strokeWidth={2} aria-hidden />}
          onClick={() => setOpen(true)}
        >
          {label}
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-3 grid gap-2 rounded-md border border-border bg-surface-muted p-3">
      {!myself ? (
        // The two-week review's labelled data: whether this warning was worth a
        // person's time. One tap, optional, and it changes nothing about sending.
        <fieldset className="grid gap-1.5 text-sm">
          <legend className="font-medium text-text">
            Was the AI right to raise this?{' '}
            <span className="font-normal text-text-subtle">(optional — teaches us which warnings matter)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                [true, 'Yes — worth checking'],
                [false, 'No — false alarm'],
              ] as const
            ).map(([value, text]) => (
              <button
                key={text}
                type="button"
                aria-pressed={aiWasRight === value}
                onClick={() => setAiWasRight(aiWasRight === value ? null : value)}
                className={cn(
                  'min-h-11 rounded-full border px-3 text-sm font-medium md:min-h-9',
                  aiWasRight === value
                    ? value
                      ? 'border-success bg-success-soft text-success-strong'
                      : 'border-warning bg-warning-soft text-warning-strong'
                    : 'border-border bg-surface text-text hover:bg-surface-muted',
                )}
              >
                {text}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-text">
          {myself ? 'What did you check?' : 'Why is it fine?'}{' '}
          <span className="font-normal text-text-subtle">(optional — helps whoever reads this later)</span>
        </span>
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={myself ? 'e.g. Compared every figure with the portal.' : 'e.g. The dealer confirmed the tanker came late on 2 Nov.'}
          maxLength={1000}
        />
      </label>
      {!myself ? (
        <Checkbox
          checked={remember}
          disabled={!note.trim()}
          onChange={(e) => setRemember(e.target.checked)}
          label="Tell the AI for this outlet's next reports"
          hint="It reads your note before checking, for up to 90 days, so it does not raise the same thing again."
          align="start"
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={ack.isPending} onClick={() => void submit()}>
          {myself ? 'Yes, I checked it myself' : 'Yes, I checked it'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── could not check ─────────────────────────────────────────────────────────

function CouldNotCheck({
  view,
  kind,
  what,
  className,
}: {
  view: AiCheckView;
  kind: AiCheckKind;
  what: string;
  className?: string;
}) {
  const result = view.result;
  const toast = useToast();
  const rerun = useRerunAiCheck(kind, view.reportId);
  const ruleProblems = waitingProblems(view);
  const uncheckedWaiting = view.waitingOn.includes(AI_UNCHECKED_ID);
  return (
    <section className={cn('rounded-lg border-2 border-warning bg-warning-soft p-4', className)}>
      <div className="flex items-start gap-3">
        <ServerCrash width={26} height={26} strokeWidth={1.75} className="shrink-0 text-warning-strong md:text-warning" aria-hidden />
        <div className="min-w-0">
          <p className="text-base font-semibold text-warning-strong md:text-lg">The AI could not check this {what}</p>
          <p className="mt-1 text-sm text-text">
            {result?.failure ?? 'The check did not finish.'} Until it is checked — by the AI or by you — this {what} will
            not be sent to the dealer.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={rerun.isPending}
              leftIcon={<RefreshCw width={14} height={14} strokeWidth={2} aria-hidden />}
              onClick={() =>
                void rerun.mutateAsync().catch((err) =>
                  toast.error(err instanceof ApiError ? err.message : 'Could not start the check.'),
                )
              }
            >
              Check again
            </Button>
          </div>
          {uncheckedWaiting ? (
            <TickForm
              kind={kind}
              reportId={view.reportId}
              problemIds={[AI_UNCHECKED_ID]}
              label="I checked it myself"
              myself
            />
          ) : null}
        </div>
      </div>
      {ruleProblems.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {ruleProblems.map((p) => (
            <ProblemCard key={p.id} problem={p} view={view} kind={kind} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ── footer: when, how, check again ──────────────────────────────────────────

/**
 * "The AI missed something" — the one signal the two-week review cannot get any
 * other way: what the AI did NOT say. Changes nothing about sending.
 */
function MissedForm({ view, kind, onDone }: { view: AiCheckView; kind: AiCheckKind; onDone: () => void }) {
  const toast = useToast();
  const missed = useReportAiMiss(kind, view.reportId);
  const [note, setNote] = React.useState('');
  return (
    <div className="mt-2 grid gap-2 rounded-md border border-border bg-surface p-3">
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-text">What did the AI miss?</span>
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. The 2 Nov diesel delivery is on the wrong day — the invoice says 1 Nov."
          maxLength={1000}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={note.trim().length < 5}
          loading={missed.isPending}
          onClick={() =>
            void missed
              .mutateAsync(note.trim())
              .then(() => {
                toast.success('Thank you — this is used to make the AI check better.');
                onDone();
              })
              .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Could not save that. Try again.'))
          }
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Footer({ view, kind }: { view: AiCheckView; kind: AiCheckKind }) {
  const toast = useToast();
  const rerun = useRerunAiCheck(kind, view.reportId);
  const [missing, setMissing] = React.useState(false);
  const result = view.result;
  const lookups = result?.lookups ?? [];
  return (
    <>
      {view.missed.length > 0 ? (
        <ul className="mt-3 grid gap-1 text-sm">
          {view.missed.map((m) => (
            <li key={m.at} className="text-text-muted">
              <span className="font-medium text-text">Missed by the AI</span>, reported by {m.byName ?? 'an admin'} on{' '}
              {formatDateTime(m.at)}: “{m.note}”
            </li>
          ))}
        </ul>
      ) : null}
      {missing ? <MissedForm view={view} kind={kind} onDone={() => setMissing(false)} /> : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs text-text-subtle">
        <span className="min-w-0">
          {view.finishedAt ? `Checked ${formatDateTime(view.finishedAt)}` : null}
          {lookups.length > 0
            ? ` · looked at ${lookups.length} ${lookups.length === 1 ? 'thing' : 'things'} in this outlet’s data`
            : null}
        </span>
        <span className="flex flex-wrap items-center gap-1">
          {lookups.length > 0 ? (
            <details className="relative">
              <summary className="min-h-11 cursor-pointer select-none py-2 font-medium md:min-h-0 md:py-1">
                What it looked at
              </summary>
              <ul className="mb-2 grid gap-1 text-text-muted">
                {lookups.map((l, i) => (
                  <li key={`${l.label}-${i}`} className="flex items-center gap-1.5">
                    {l.ok ? (
                      <Check width={12} height={12} strokeWidth={2} className="shrink-0 text-success" aria-hidden />
                    ) : (
                      <XCircle width={12} height={12} strokeWidth={2} className="shrink-0 text-warning" aria-hidden />
                    )}
                    {l.label}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            loading={rerun.isPending}
            leftIcon={<RefreshCw width={12} height={12} strokeWidth={2} aria-hidden />}
            onClick={() =>
              void rerun.mutateAsync().catch((err) =>
                toast.error(err instanceof ApiError ? err.message : 'Could not start the check.'),
              )
            }
          >
            Check again
          </Button>
          {!missing && view.result ? (
            <Button size="sm" variant="ghost" onClick={() => setMissing(true)}>
              The AI missed something
            </Button>
          ) : null}
        </span>
      </div>
    </>
  );
}
