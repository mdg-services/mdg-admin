import { AlertCircle, Ban, Flag, Phone } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  Dialog,
  Drawer,
  EmptyState,
  Input,
  KeyValueList,
  Label,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  useAssistSessionQuery,
  useCreateAssistBlock,
  useUpdateAssistFollowup,
} from '@/hooks/api/useAssist';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatDuration } from '@/lib/format';
import { ASSIST_FOLLOWUP_STATUSES } from '@dk/shared';
import type {
  AssistFollowupStatus,
  AssistRecordingSegmentView,
  AssistSessionDetail,
  AssistTurn,
  AssistTurnTrace,
} from '@dk/shared';

import {
  channelLabel,
  costSplitOf,
  docLabel,
  endReasonText,
  flagReasonText,
  followupLabel,
  formatPaise,
  guardStageText,
  langLabel,
  pageLabel,
  sessionStatusLabel,
} from './assistFormat';
import { CallPlayer } from './CallPlayer';

/**
 * One conversation, opened up.
 *
 * The person reading this is deciding whether to ring a stranger back or to
 * turn them away, so the panel is ordered the way that decision is made: what
 * kind of visit it was, what was actually said, who they are and what we owe
 * them, then the recording, and only then the engineering detail.
 *
 * The mobile number appears exactly once, in the lead panel, where it is the
 * thing being acted on. It is deliberately not in the drawer title, not in any
 * toast, and not in the URL — see the note on `LeadPanel`.
 */

export interface SessionDrawerProps {
  /** The session to show. `null` keeps the drawer closed and the query idle. */
  sessionId: string | null;
  onClose: () => void;
}

const BLOCK_DURATIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Until I lift it' },
  { value: '7', label: 'For 7 days' },
  { value: '30', label: 'For 30 days' },
  { value: '90', label: 'For 90 days' },
];

/** `3:04 pm` — the transcript only ever needs the time within the visit. */
function clockOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function SessionDrawer({ sessionId, onClose }: SessionDrawerProps) {
  const detailQ = useAssistSessionQuery(sessionId ?? undefined);
  const detail = detailQ.data;
  const [blockOpen, setBlockOpen] = React.useState(false);
  const [activeSegment, setActiveSegment] =
    React.useState<AssistRecordingSegmentView | null>(null);

  const followup = useFollowupDraft(sessionId, detail);

  // A closed drawer must not leave the last call's highlight behind.
  React.useEffect(() => {
    if (!sessionId) setActiveSegment(null);
  }, [sessionId]);

  const title = detail
    ? `${channelLabel(detail.channel)} · ${formatDateTime(detail.startedAt)}`
    : 'Conversation';
  const description = detail
    ? [
        formatDuration(detail.durationMs),
        langLabel(detail.lang),
        `${detail.turnCount} ${detail.turnCount === 1 ? 'turn' : 'turns'}`,
      ].join(' · ')
    : undefined;

  return (
    <Drawer
      open={!!sessionId}
      onClose={onClose}
      width="lg"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {/* The one write this panel does, promoted into the pinned footer on
              a phone. Below md the note `Textarea` opens the keyboard, the
              layout viewport shrinks under it, and the real Save ends up
              somewhere below the fold — while the only button permanently on
              screen was Close, which discards what was just typed. The footer
              is an `ActionRow below="stack"`, so the last child in the DOM is
              the one on top under the thumb. */}
          {detail ? (
            <Button
              className="md:hidden"
              disabled={!followup.dirty}
              loading={followup.saving}
              onClick={() => void followup.onSave()}
            >
              Save follow-up
            </Button>
          ) : null}
        </>
      }
    >
      {detailQ.isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : detailQ.isError || !detail ? (
        <EmptyState
          icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
          title="Could not load this conversation"
          description={
            detailQ.error instanceof ApiError
              ? detailQ.error.message
              : 'Please try again.'
          }
          cta={
            <Button variant="secondary" size="sm" onClick={() => void detailQ.refetch()}>
              Retry
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5">
          <HeaderStrip detail={detail} onBlock={() => setBlockOpen(true)} />

          <Section title="What was said">
            <Transcript turns={detail.turns} activeSegment={activeSegment} />
          </Section>

          <Section title="Who they are">
            <LeadPanel detail={detail} followup={followup} />
          </Section>

          {detail.recording.length > 0 ? (
            // Pinned to the bottom of the sheet below md. Play-along was
            // unusable otherwise: the player is the third block down, so while
            // the controls were on screen the `ring-2 ring-brand` line being
            // spoken had scrolled off above — and scrolling up to read it took
            // the pause button away. `md:static` restores the desktop flow
            // exactly.
            <Section
              title="Recording"
              className="sticky bottom-0 z-[var(--z-sticky)] -mx-4 border-t border-border bg-surface px-4 pb-1 pt-2 md:static md:mx-0 md:border-t-0 md:px-0 md:pb-0 md:pt-0"
              titleClassName="sr-only md:not-sr-only md:mb-2"
            >
              <CallPlayer
                segments={detail.recording}
                onActiveSegmentChange={setActiveSegment}
              />
            </Section>
          ) : null}

          {detail.trace.length > 0 ? <TraceSection detail={detail} /> : null}
        </div>
      )}

      {detail ? (
        <BlockDialog
          open={blockOpen}
          onClose={() => setBlockOpen(false)}
          detail={detail}
        />
      ) : null}
    </Drawer>
  );
}

/* ─────────────────────────────── Layout ──────────────────────────────────── */

function Section({
  title,
  className,
  titleClassName,
  children,
}: {
  title: string;
  className?: string;
  /** For the one section that pins itself: `sr-only md:not-sr-only` keeps the
   *  heading for a screen reader while giving the 24px back to the transcript
   *  it is sitting on top of. */
  titleClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={className}>
      <h3
        className={cn(
          'mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted',
          titleClassName,
        )}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * The strip under the drawer title: what state the visit is in, why it stopped,
 * what it cost, why it was flagged — and the Block button, which is the one
 * destructive thing this panel can do.
 */
function HeaderStrip({
  detail,
  onBlock,
}: {
  detail: AssistSessionDetail;
  onBlock: () => void;
}) {
  const ended = endReasonText(detail.endReason);
  const split = costSplitOf(detail);
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge intent={detail.status === 'escalated' ? 'warning' : 'neutral'}>
            {sessionStatusLabel(detail.status)}
          </Badge>
          <Badge intent="info">{followupLabel(detail.followupStatus)}</Badge>
          {detail.blocked ? <Badge intent="danger">Blocked</Badge> : null}
        </div>
        {detail.blocked ? (
          <span className="text-xs text-text-muted">
            Already blocked — lift it from the Blocked tab.
          </span>
        ) : (
          <Button
            variant="danger"
            size="sm"
            onClick={onBlock}
            leftIcon={<Ban width={14} height={14} strokeWidth={1.75} />}
          >
            Block
          </Button>
        )}
      </div>

      <p className="mt-2 text-xs text-text-muted">
        Started {formatDateTime(detail.startedAt)}
        {ended ? ` · stopped because ${ended}` : null} · cost{' '}
        {formatPaise(detail.estPaise)}
      </p>

      {/* The bill said twice over, because the two halves behave nothing alike:
          speech is charged per character spoken and is nearly all of it, the
          model is charged per token and is a rounding error. When the daily cap
          trips, this is the line that says whether to shorten the answers or to
          turn speech off. The list only has room for the total. */}
      {split ? (
        <p className="mt-1 text-xs text-text-subtle">
          Voice (ElevenLabs) {formatPaise(split.voicePaise)} · AI (Google){' '}
          {formatPaise(split.vertexPaise)}
        </p>
      ) : null}

      {detail.flags.length > 0 ? (
        <ul className="mt-2 grid gap-1">
          {detail.flags.map((f) => (
            <li
              key={`${f.kind}-${f.at}`}
              className="flex items-start gap-1.5 text-xs text-warning"
            >
              <Flag width={12} height={12} strokeWidth={2} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{flagReasonText(f)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────── Transcript ──────────────────────────────── */

/**
 * Whether this turn is the one currently coming out of the player.
 *
 * Matched on the S3 key first: it is the only value both sides genuinely share.
 * The sequence number is the fallback, for a manifest written before the key
 * was recorded on the turn.
 */
function isActiveTurn(
  turn: AssistTurn,
  segment: AssistRecordingSegmentView | null,
): boolean {
  if (!segment) return false;
  if (turn.audioKey && segment.key) return turn.audioKey === segment.key;
  return turn.seq === segment.seq && turn.role === segment.role;
}

function Transcript({
  turns,
  activeSegment,
}: {
  turns: AssistTurn[];
  activeSegment: AssistRecordingSegmentView | null;
}) {
  if (turns.length === 0) {
    return (
      <p className="rounded-md border border-border bg-surface-2 p-3 text-sm text-text-muted">
        Nothing was said. The visitor opened the assistant and left.
      </p>
    );
  }
  return (
    <ol className="grid gap-3">
      {turns.map((turn) => (
        <TurnBubble
          key={`${turn.seq}-${turn.role}`}
          turn={turn}
          active={isActiveTurn(turn, activeSegment)}
        />
      ))}
    </ol>
  );
}

function TurnBubble({ turn, active }: { turn: AssistTurn; active: boolean }) {
  const ref = React.useRef<HTMLLIElement>(null);

  /* Follow the player. The ring says which line is being spoken, but nothing
     used to bring it back into view, so on a 640px screen the highlight spent
     most of the call scrolled off above the sheet. `block: 'nearest'` moves the
     drawer body by the least it can — enough to show the line, never enough to
     jump the reader somewhere else. */
  React.useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [active]);

  if (turn.role === 'system') {
    return (
      <li ref={ref} className="text-center text-xs text-text-subtle">
        {turn.text} · {clockOf(turn.at)}
      </li>
    );
  }
  const visitor = turn.role === 'visitor';
  return (
    <li ref={ref} className={cn('flex', visitor ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg border p-2.5',
          visitor
            ? 'border-border bg-surface-2'
            : 'border-brand-soft bg-brand-soft',
          // The line being played gets a ring, not a different fill — the fill
          // already carries who is speaking, and one channel per meaning.
          active ? 'ring-2 ring-brand' : null,
        )}
      >
        <p className="whitespace-pre-wrap break-words text-sm text-text">{turn.text}</p>

        {turn.guardStage ? (
          <div className="mt-1.5">
            <Badge intent="warning">
              we did not answer this — {guardStageText(turn.guardStage)}
            </Badge>
            {turn.guardNote ? (
              <p className="mt-1 break-words text-xs text-text-muted">{turn.guardNote}</p>
            ) : null}
          </div>
        ) : null}

        {turn.citations && turn.citations.length > 0 ? (
          <ul className="mt-1.5 flex min-w-0 flex-wrap gap-1">
            {turn.citations.map((c) => (
              // The chip prints the section's HUMAN title, not its id. The
              // whole point of showing a super-admin a citation is "which part
              // of which guideline did this answer come from", and that
              // sentence used to live in a `title` — invisible on touch. The id
              // and the match score stay on the tooltip and in the debug panel,
              // where a developer is already looking.
              // `min-w-0 max-w-full break-words`: `c.section`/`c.sectionTitle`
              // are server-supplied free text, and one long name made the whole
              // drawer body scroll sideways rather than wrapping in the chip.
              <li
                key={c.chunkId}
                title={`${c.section} · match ${c.score.toFixed(2)}`}
                className="min-w-0 max-w-full break-words rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-text-muted"
              >
                {docLabel(c.docId)} · {c.sectionTitle || c.section} ·{' '}
                {pageLabel(c.pageFrom, c.pageTo)}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-1 text-[11px] tabular-nums text-text-subtle">
          {clockOf(turn.at)}
          {turn.audioMs ? ` · ${formatDuration(turn.audioMs)} spoken` : null}
        </p>
      </div>
    </li>
  );
}

/* ─────────────────────────────── Lead panel ──────────────────────────────── */

export interface FollowupDraft {
  status: AssistFollowupStatus;
  setStatus: (next: AssistFollowupStatus) => void;
  note: string;
  setNote: (next: string) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => Promise<void>;
}

/**
 * The follow-up being edited, held one level above the panel that shows it.
 *
 * It lives up here for one reason: on a phone the button that saves it has to
 * be in the drawer's pinned footer, and the footer is a sibling of the body —
 * it cannot reach into `LeadPanel`'s state. Both the inline button and the
 * footer button now drive the same draft.
 *
 * Seeded once per conversation opened, keyed on the id rather than on the
 * object: the detail is replaced on every refetch and on every save, and
 * re-seeding from those would wipe a note being typed. Closing the drawer
 * clears the key, so reopening starts from what the server holds.
 */
function useFollowupDraft(
  sessionId: string | null,
  detail: AssistSessionDetail | undefined,
): FollowupDraft {
  const toast = useToast();
  const save = useUpdateAssistFollowup();
  const [status, setStatus] = React.useState<AssistFollowupStatus>('new');
  const [note, setNote] = React.useState('');

  const seededRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!sessionId) {
      seededRef.current = null;
      return;
    }
    if (!detail || seededRef.current === detail.id) return;
    seededRef.current = detail.id;
    setStatus(detail.followupStatus);
    setNote(detail.followupNote ?? '');
  }, [sessionId, detail]);

  const dirty =
    !!detail &&
    (status !== detail.followupStatus || note !== (detail.followupNote ?? ''));

  const onSave = React.useCallback(async () => {
    if (!detail) return;
    try {
      await save.mutateAsync({
        id: detail.id,
        input: { followupStatus: status, note: note.trim() || undefined },
      });
      toast.success('Follow-up saved');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not save the follow-up',
      );
    }
  }, [detail, note, save, status, toast]);

  return {
    status,
    setStatus,
    note,
    setNote,
    dirty,
    saving: save.isPending,
    onSave,
  };
}

/**
 * The name, place and number the visitor volunteered, and what we have done
 * about it.
 *
 * This is the ONE place on the whole console that prints a mobile number. It is
 * printed here because ringing it is the job; it is printed nowhere else —
 * not in the drawer title, not in a toast, not in a query string — because
 * every one of those places is somewhere the number gets read, screenshotted or
 * pasted by someone who did not need it.
 */
function LeadPanel({
  detail,
  followup,
}: {
  detail: AssistSessionDetail;
  followup: FollowupDraft;
}) {
  const lead = detail.lead;

  return (
    <div className="grid gap-3 rounded-md border border-border bg-surface p-3">
      <dl className="grid gap-2 sm:grid-cols-3">
        <Field label="Name" value={lead.name} />
        <Field label="Place" value={lead.place} />
        <div className="min-w-0">
          <dt className="text-xs text-text-muted">Mobile</dt>
          <dd className="mt-0.5 flex flex-wrap items-center gap-2">
            {lead.mobile ? (
              <>
                <a
                  href={`tel:+91${lead.mobile}`}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-medium tabular-nums text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
                >
                  <Phone width={14} height={14} strokeWidth={1.75} aria-hidden />
                  {lead.mobile}
                </a>
                <Badge intent={lead.mobileConfirmed ? 'success' : 'warning'}>
                  {lead.mobileConfirmed ? 'Read back and confirmed' : 'Not confirmed'}
                </Badge>
              </>
            ) : (
              <span className="text-sm text-text-subtle">Not given</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-start">
        <div className="space-y-1.5">
          <Label htmlFor="assist-followup">Follow-up</Label>
          <Select
            id="assist-followup"
            value={followup.status}
            onChange={(e) => followup.setStatus(e.target.value as AssistFollowupStatus)}
          >
            {ASSIST_FOLLOWUP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {followupLabel(s)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assist-note">Note</Label>
          <Textarea
            id="assist-note"
            rows={3}
            maxLength={1000}
            value={followup.note}
            placeholder="What happened when we rang — kept short, the team reads this on a phone."
            onChange={(e) => followup.setNote(e.target.value)}
          />
        </div>
      </div>

      {/* Hidden below md, where the footer carries it instead — two live Save
          buttons for one draft is one too many. */}
      <div className="hidden items-center gap-3 md:flex">
        <Button
          onClick={() => void followup.onSave()}
          loading={followup.saving}
          disabled={!followup.dirty}
        >
          Save follow-up
        </Button>
        {!followup.dirty ? (
          <span className="text-sm text-text-muted">No unsaved changes.</span>
        ) : null}
      </div>
      <p className="text-sm text-text-muted md:hidden">
        {followup.dirty
          ? 'Unsaved. “Save follow-up” is pinned at the bottom of the screen.'
          : 'No unsaved changes.'}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-muted">{label}</dt>
      {/* Wraps below md, truncates at md: in the three-column desktop row a
          wrapped name sets the row height, but on a phone a clipped name in a
          panel whose whole job is "who do I ring" is just a lost name. */}
      <dd className="mt-0.5 break-words text-sm text-text md:truncate">
        {value || <span className="text-text-subtle">Not given</span>}
      </dd>
    </div>
  );
}

/* ─────────────────────────────── Trace ───────────────────────────────────── */

/** `heard 320ms · embed 41ms · …` — the stages that reported a number. */
function timingsText(t: AssistTurnTrace): string {
  const timings: Array<[string, number | undefined]> = [
    ['heard', t.timings.sttMs],
    ['embed', t.timings.embedMs],
    ['search', t.timings.searchMs],
    ['answer', t.timings.llmMs],
    ['spoken', t.timings.ttsMs],
    ['total', t.timings.totalMs],
  ];
  return timings
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k} ${Math.round(v as number)}ms`)
    .join(' · ');
}

function retrievedText(t: AssistTurnTrace): string {
  if (t.retrieved.length === 0) return '—';
  return t.retrieved.map((r) => `${r.chunkId} (${r.score.toFixed(2)})`).join(', ');
}

/**
 * The per-turn engineering detail, collapsed.
 *
 * ADR 0009 §9 is explicit that this exists to make the first weeks debuggable
 * and is expected to be switched off. The callout says so on the screen, so
 * nobody builds a habit around a panel that is going to disappear.
 *
 * Two shapes, for the usual reason: five columns of comma-joined chunk ids in
 * the ~272px this panel gets at 360px lands every column at 40-60px, which
 * scrolls but cannot be read. Below md each turn becomes a stacked block
 * instead. The desktop table is left exactly as it was — it is a panel with a
 * stated expiry date, and re-densifying it through the shared `Table` would be
 * a visible change to the one viewport where it already works.
 */
function TraceSection({ detail }: { detail: AssistSessionDetail }) {
  return (
    <details className="rounded-md border border-border bg-surface">
      {/* `min-h-11` below md: 12px of line box plus 24px of padding is a 40px
          target, and this summary is the only way into the panel. */}
      <summary className="flex min-h-11 cursor-pointer select-none items-center px-3 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0 md:py-2">
        Debugging detail ({detail.trace.length}{' '}
        {detail.trace.length === 1 ? 'turn' : 'turns'})
      </summary>
      <div className="border-t border-border p-3">
        <Callout intent="info" className="mb-3">
          This is temporary debugging detail, recorded only while tracing is
          switched on. It gets turned off once the assistant is boring, and this
          panel goes with it — do not build a routine around it.
        </Callout>

        <div className="hidden w-full overflow-x-auto overscroll-x-contain md:block">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-surface-2 text-text-muted">
              <tr>
                <th className="h-8 px-2 text-left font-semibold">Turn</th>
                <th className="h-8 px-2 text-left font-semibold">Stage timings</th>
                <th className="h-8 px-2 text-left font-semibold">Passages retrieved</th>
                <th className="h-8 px-2 text-left font-semibold">Guards hit</th>
                <th className="h-8 px-2 text-right font-semibold">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {detail.trace.map((t) => (
                <tr key={t.seq} className="border-t border-border align-top">
                  <td className="px-2 py-2 tabular-nums text-text">
                    #{t.seq}
                    <span className="block text-text-subtle">{t.chatModel}</span>
                    <span className="block text-text-subtle">{t.guardModel}</span>
                  </td>
                  <td className="px-2 py-2 text-text-muted">{timingsText(t)}</td>
                  <td className="px-2 py-2 text-text-muted">{retrievedText(t)}</td>
                  <td className="px-2 py-2 text-text-muted">
                    {t.rulesHit.length === 0 ? '—' : t.rulesHit.join(', ')}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-text-muted">
                    {t.tokensIn ?? 0} in / {t.tokensOut ?? 0} out
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 md:hidden">
          {detail.trace.map((t) => (
            <div key={t.seq} className="rounded-md border border-border p-3">
              <p className="mb-1 text-xs font-semibold tabular-nums text-text">
                Turn #{t.seq}
              </p>
              <KeyValueList
                items={[
                  {
                    key: 'models',
                    label: 'Models',
                    value: `${t.chatModel} · ${t.guardModel}`,
                    mono: true,
                    block: true,
                  },
                  {
                    key: 'timings',
                    label: 'Stage timings',
                    value: timingsText(t),
                    block: true,
                  },
                  {
                    key: 'retrieved',
                    label: 'Passages retrieved',
                    value: retrievedText(t),
                    mono: true,
                    block: true,
                  },
                  {
                    key: 'guards',
                    label: 'Guards hit',
                    value: t.rulesHit.length === 0 ? '—' : t.rulesHit.join(', '),
                    block: true,
                  },
                  {
                    key: 'tokens',
                    label: 'Tokens',
                    value: `${t.tokensIn ?? 0} in / ${t.tokensOut ?? 0} out`,
                    numeric: true,
                  },
                ]}
              />
            </div>
          ))}
        </div>

        {/* `break-words`: a WebView user-agent string is a run of tokens CSS
            will not break on its own, and the drawer body picks up a sideways
            scroll the moment one is wider than the panel. */}
        <p className="mt-2 break-words text-xs text-text-subtle">
          Fingerprint {detail.fingerprint.slice(0, 12)}…
          {detail.ipPrefix ? ` · network ${detail.ipPrefix}` : null}
          {detail.userAgent ? ` · ${detail.userAgent}` : null}
        </p>
      </div>
    </details>
  );
}

/* ─────────────────────────────── Block dialog ────────────────────────────── */

/**
 * Blocking is placed on the session, never on a typed number: the server reads
 * the fingerprint off it. That is why there is no number field here — and why
 * a block can never be reversed back into a phone number.
 */
function BlockDialog({
  open,
  onClose,
  detail,
}: {
  open: boolean;
  onClose: () => void;
  detail: AssistSessionDetail;
}) {
  const toast = useToast();
  const block = useCreateAssistBlock();
  const [reason, setReason] = React.useState('');
  const [days, setDays] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setReason('');
      setDays('');
    }
  }, [open]);

  async function submit() {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error('Say why they are being blocked.');
      return;
    }
    try {
      await block.mutateAsync({
        sessionId: detail.id,
        reason: trimmed,
        expiresInDays: days ? Number(days) : undefined,
      });
      // Deliberately no number, no name: a toast is read over shoulders.
      toast.success('Blocked. They will get the callback form instead.');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not block');
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Block this visitor"
      description={
        detail.lead.mobile
          ? 'Blocks the number behind this conversation. They will still see the site; the assistant just stops answering and offers the callback form instead.'
          : 'Blocks the network this conversation came from — that can cover other people on the same connection. They will still see the site; the assistant just stops answering.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={block.isPending}>
            Block
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="assist-block-reason" required>
            Why
          </Label>
          <Input
            id="assist-block-reason"
            value={reason}
            maxLength={300}
            placeholder="e.g. abusive on every call since Tuesday"
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assist-block-days">How long</Label>
          <Select
            id="assist-block-days"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          >
            {BLOCK_DURATIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Dialog>
  );
}
