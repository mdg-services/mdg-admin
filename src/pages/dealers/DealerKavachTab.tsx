import {
  AlertCircle,
  BellOff,
  BellRing,
  ClipboardCheck,
  Pause,
  Play,
  RotateCw,
  ShieldCheck,
} from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  ClampedText,
  Dialog,
  EmptyState,
  Select,
  Skeleton,
  useToast,
} from '@/components/ui';
import {
  useInitiateKavachProgramme,
  useKavachItemsQuery,
  useKavachProgrammeQuery,
  useSetKavachItemPaused,
  useSetKavachSosCompliance,
  useUpdateKavachProgramme,
} from '@/hooks/api/useKavach';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import {
  CADENCE_BUCKET_LABEL,
  CADENCE_BUCKET_ORDER,
  operationalIntent,
  scoreDisclosureParts,
  workQueueRowFromItem,
} from '@/lib/kavach';
import {
  dealerCodeLabel,
  type Dealer,
  type KavachCadenceBucket,
  type KavachItem,
} from '@dk/shared';

import { VerifyTaskDrawer } from '../kavach/VerifyTaskDrawer';

import { InitiateKavachForm } from './kavach/InitiateKavachForm';
import { KavachItemRow } from './kavach/KavachItemRow';

interface Props {
  dealer: Dealer;
}

/** 00:00–23:00 IST, as a fixed reminder-hour option list. */
const REMINDER_HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: `${String(h).padStart(2, '0')}:00 IST`,
}));

/**
 * What this tab is for, and what pausing does.
 *
 * Held as one node because it is rendered twice — as a folded disclosure below
 * md and as the open Callout at md — and two copies of a paragraph is how the
 * two widths start saying different things. The pause consequence used to live
 * only in a `title`, which no touch gesture reveals, so it is said once here
 * rather than on all 45 rows.
 */
const TASKS_TAB_NOTE = (
  <>
    Tasks are added, hidden or re-pointed for this outlet on its{' '}
    <span className="font-medium">Kavach tasks</span> tab. Verify a single task
    from its row here, or open the work queue to work through many across every
    dealer in one pass. Pausing a task takes it out of this dealer&apos;s score
    and out of the work queue until it is resumed.
  </>
);

/**
 * The dealer's Kavach panel: SETUP and STANDING, not a working queue.
 *
 * Certifying tasks happens in the cross-dealer work queue, where an admin faces
 * roughly ten verifications per dealer per day and closes them in one pass.
 * Doing it here, dealer by dealer, is the shape that does not scale past eight
 * outlets — so this screen deliberately has no verify control on it.
 */
export function DealerKavachTab({ dealer }: Props) {
  const toast = useToast();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [enableDealerFacingOpen, setEnableDealerFacingOpen] = React.useState(false);
  const [verifying, setVerifying] = React.useState<KavachItem | null>(null);

  const programmeQ = useKavachProgrammeQuery(dealer.id);
  const itemsQ = useKavachItemsQuery(dealer.id);

  const initiate = useInitiateKavachProgramme(dealer.id);
  const updateProgramme = useUpdateKavachProgramme(dealer.id);
  const setPaused = useSetKavachItemPaused(dealer.id);
  const setSos = useSetKavachSosCompliance(dealer.id);

  async function withBusy(id: string, fn: () => Promise<unknown>, successMsg: string) {
    setBusyId(id);
    try {
      await fn();
      toast.success(successMsg);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  if (programmeQ.isLoading) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="mb-3 h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (programmeQ.isError) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load programme"
        description={
          programmeQ.error instanceof ApiError
            ? programmeQ.error.message
            : 'Please try again.'
        }
        cta={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RotateCw width={16} height={16} strokeWidth={1.75} />}
            onClick={() => void programmeQ.refetch()}
          >
            Retry
          </Button>
        }
      />
    );
  }

  // No programme yet → show the initiate form.
  if (!programmeQ.data) {
    return (
      <InitiateKavachForm
        dealerCode={dealer.code}
        loading={initiate.isPending}
        onSubmit={async (values) => {
          try {
            await initiate.mutateAsync(values);
            toast.success('Kavach programme initiated');
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Failed to initiate');
          }
        }}
      />
    );
  }

  const programme = programmeQ.data;
  const isPaused = programme.status === 'PAUSED';
  const dealerFacing = programme.dealerFacingEnabled === true;
  const items = itemsQ.data ?? [];

  const grouped = new Map<KavachCadenceBucket, KavachItem[]>();
  for (const item of items) {
    const arr = grouped.get(item.cadenceBucket) ?? [];
    arr.push(item);
    grouped.set(item.cadenceBucket, arr);
  }
  const orderedBuckets = CADENCE_BUCKET_ORDER.filter((b) => grouped.has(b));

  const score = programme.score;
  // The admin's copy always carries both published figures: `programmeToPublic`
  // drops them only on the DEALER's copy, when `kavachScoreIsPublishable` says
  // MDG has not stood behind the number yet. The fallback is unreachable from
  // this screen and exists so the chip below can never be sized off a NaN.
  const pct = Math.round(score.overallPct ?? 0);
  const disclosure = scoreDisclosureParts({
    scored: score.scored,
    overallPct: score.overallPct,
    notYetVerifiedCount: score.notYetVerifiedCount,
    heldCount: score.heldCount,
  });

  async function setDealerFacing(enabled: boolean) {
    await withBusy(
      'dealer-facing',
      () => updateProgramme.mutateAsync({ dealerFacingEnabled: enabled }),
      enabled
        ? 'This dealer will now receive their daily Kavach list'
        : 'Kavach messages to this dealer are off',
    );
    setEnableDealerFacingOpen(false);
  }

  return (
    <div className="grid gap-3 md:gap-4">
      {/* Score header */}
      <Card>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* The icon rail is 40px below md, not 48px. It sits beside a score
                and a wrapping disclosure line in ~300px of card, so every pixel
                it takes is one the sentence has to wrap around. Desktop keeps
                the 48px badge. */}
            <div className="flex items-center gap-3 md:gap-4">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand md:h-12 md:w-12">
                {/* Sized in CSS rather than by the usual `width`/`height`
                    props, because this one glyph has to change size at md and
                    an attribute cannot carry a breakpoint. A class beats a
                    presentational attribute, so lucide's own 24px default is
                    overridden at both widths. */}
                <ShieldCheck
                  strokeWidth={1.75}
                  className="h-5 w-5 md:h-6 md:w-6"
                />
              </span>
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  {/* The percentage never travels alone: a bare number hides how
                      much of this dealer nobody has examined yet. */}
                  <span className="text-2xl font-semibold tracking-tight text-text md:text-3xl">
                    {disclosure[0]}
                  </span>
                  {/* Each of these is a flex item carrying its OWN leading
                      "· ", so at 360px the row wraps and the line under the
                      score starts "· 40 never checked" — a separator with
                      nothing before it, which reads as a figure that failed to
                      render. Below md they move to a line of their own (see
                      just under this row) where the separators sit between the
                      parts instead of in front of them. */}
                  {disclosure.slice(1).map((part) => (
                    <span
                      key={part}
                      className="hidden text-sm font-medium text-text-muted md:inline"
                    >
                      · {part}
                    </span>
                  ))}
                  {/* A green "operational" chip beside "Not scored yet" would
                      re-assert exactly the judgement the headline just declined
                      to make. */}
                  {score.scored ? (
                    <Badge intent={operationalIntent(pct)}>operational</Badge>
                  ) : null}
                  {isPaused ? <Badge intent="warning">Paused</Badge> : null}
                </div>
                {/* The phone half of the line above. One string, with a
                    non-breaking space gluing every separator to the word in
                    front of it, so however this wraps no line can begin with a
                    middot. */}
                {disclosure.length > 1 ? (
                  <p className="text-sm font-medium text-text-muted md:hidden">
                    {disclosure.slice(1).join('\u00a0· ')}
                  </p>
                ) : null}
                <p className="text-sm text-text-muted">
                  <span className="font-mono">{dealerCodeLabel(dealer.code)}</span>
                  {' · baseline '}
                  {programme.outlet.monthYear}
                </p>
                <p className="text-xs text-text-subtle">
                  {score.scored && score.totalPoints !== undefined
                    ? `${score.validPoints} / ${score.totalPoints} points compliant`
                    : 'Nothing verified yet, so there is nothing to score against'}
                  {score.notYetVerifiedCount > 0
                    ? `\u00a0· ${score.notYetVerifiedPoints} points sitting behind ${score.notYetVerifiedCount} task${
                        score.notYetVerifiedCount === 1 ? '' : 's'
                      } nobody has checked`
                    : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* `h-9 w-auto` used to sit on the Select and did nothing at all:
                  `cn` is plain clsx, and Tailwind emits `.h-9` before `.h-11`
                  and `.w-auto` before `.w-full`, so the primitive's own classes
                  won both. The width now lives where it can be honoured — the
                  field fills its row on a phone, and is a fixed 14rem at md. */}
              <div className="flex w-full items-center gap-1.5 md:w-auto">
                <label htmlFor="kavach-digest-hour" className="shrink-0 text-xs text-text-muted">
                  Digest time
                </label>
                <Select
                  id="kavach-digest-hour"
                  className="md:w-56"
                  value={programme.reminderHour ?? ''}
                  disabled={updateProgramme.isPending}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // Placeholder (global default) → no-op; only send a concrete hour.
                    if (raw === '') return;
                    void withBusy(
                      'programme',
                      () => updateProgramme.mutateAsync({ reminderHour: Number(raw) }),
                      'Digest time updated',
                    );
                  }}
                >
                  <option value="">Default (08:00 IST)</option>
                  {REMINDER_HOUR_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full md:w-auto"
                disabled={busyId === 'programme'}
                leftIcon={
                  isPaused ? (
                    <Play width={16} height={16} strokeWidth={1.75} />
                  ) : (
                    <Pause width={16} height={16} strokeWidth={1.75} />
                  )
                }
                onClick={() =>
                  withBusy(
                    'programme',
                    () =>
                      updateProgramme.mutateAsync({
                        status: isPaused ? 'ACTIVE' : 'PAUSED',
                      }),
                    isPaused ? 'Programme resumed' : 'Programme paused',
                  )
                }
              >
                {isPaused ? 'Resume' : 'Pause programme'}
              </Button>
              {/* A link, not a Button: the queue is a route, and the whole point
                  of this panel is that certifying happens over there. It has to
                  be painted like a `Button` by hand, so it copies the primitive
                  exactly — `rounded-md` and `font-semibold`, not the `rounded-sm`
                  / `font-medium` it used to carry, which made it visibly a
                  different shape from the Pause button sitting beside it.
                  `whitespace-nowrap` because a link at natural width can break
                  a phrase mid-way; full width below md so the two controls stack
                  as two equal rows instead of a ragged pair. */}
              <Link
                to={`/kavach?dealerId=${dealer.id}`}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-brand px-4 text-sm font-semibold text-text-inverse hover:bg-brand-hover md:h-9 md:min-h-0 md:w-auto"
              >
                <ClipboardCheck width={16} height={16} strokeWidth={1.75} />
                Open work queue
              </Link>
            </div>
          </div>

          {/* Per-bucket sub-scores (admin-only) */}
          {Object.keys(score.byBucket).length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
              {CADENCE_BUCKET_ORDER.filter((b) => score.byBucket[b] != null).map((b) => (
                <Badge key={b} intent="neutral" className="gap-1">
                  <span className="text-text-muted">{CADENCE_BUCKET_LABEL[b]}</span>
                  <span className="font-semibold">
                    {Math.round(score.byBucket[b] as number)}%
                  </span>
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* The gate. Nothing reaches this dealer until an admin turns it on. */}
      <Card>
        <CardContent>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span
                className={
                  dealerFacing
                    ? 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success-soft text-success'
                    : 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-muted'
                }
              >
                {dealerFacing ? (
                  <BellRing width={20} height={20} strokeWidth={1.75} />
                ) : (
                  <BellOff width={20} height={20} strokeWidth={1.75} />
                )}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-text">
                    Dealer-facing messages
                  </p>
                  <Badge intent={dealerFacing ? 'success' : 'neutral'}>
                    {dealerFacing ? 'On' : 'Off'}
                  </Badge>
                </div>
                {/* `max-w-2xl` is 672px and does nothing at 360px, so the "off"
                    copy — 253 characters — ran to eight lines and pushed "Turn
                    messages on" below the fold on the card whose whole purpose
                    is that button. Two lines on a phone, with the rest a tap
                    away: the clause this copy exists for ("…so their first
                    message is not a figure about work nobody has done yet") is
                    in the half a bare clamp threw away. Every word from md. */}
                <ClampedText className="mt-1 text-sm text-text-muted md:max-w-2xl">
                  {dealerFacing
                    ? `This dealer receives their daily Kavach list and can be shown their score card.${
                        programme.dealerFacingEnabledAt
                          ? ` Switched on ${formatDate(programme.dealerFacingEnabledAt)}.`
                          : ''
                      }`
                    : 'While this is off the dealer receives nothing at all — no daily message, no score card. Leave it off until MDG has actually verified this outlet, so their first message is not a figure about work nobody has done yet.'}
                </ClampedText>
              </div>
            </div>
            <div className="shrink-0">
              {dealerFacing ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busyId === 'dealer-facing'}
                  loading={busyId === 'dealer-facing'}
                  leftIcon={<BellOff width={14} height={14} strokeWidth={1.75} />}
                  onClick={() => void setDealerFacing(false)}
                >
                  Turn messages off
                </Button>
              ) : (
                <Button
                  size="sm"
                  leftIcon={<BellRing width={14} height={14} strokeWidth={1.75} />}
                  onClick={() => setEnableDealerFacingOpen(true)}
                >
                  Turn messages on
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* This paragraph never changes and never goes away, and by the time it
          has been read once it is costing ~90px of a 740px screen on every
          later visit — with the score card and the messages card above it, the
          first actual task started around y=700. So below md it folds into a
          one-line disclosure the admin opens when they want it, and from md up
          it is the Callout it has always been.

          Written twice rather than as one node inside a `<details>` with a
          `md:` display rule: `<details>` hides its body with the browser's own
          content-visibility, which no `md:` class can reopen, so a desktop
          reader would get a collapsed summary instead of the paragraph. The
          copy lives in `TASKS_TAB_NOTE` so the two cannot drift. */}
      <details className="rounded-md border border-info bg-info-soft px-3 text-xs text-info md:hidden">
        {/* Block, not flex: a flex <summary> loses its native disclosure
            triangle, and that triangle is the only cue the line opens. */}
        <summary className="min-h-11 cursor-pointer select-none py-3 font-medium">
          How this tab works
        </summary>
        <p className="pb-3">{TASKS_TAB_NOTE}</p>
      </details>
      <Callout intent="info" className="hidden md:flex">
        {TASKS_TAB_NOTE}
      </Callout>

      {/* Items grouped by bucket */}
      <div
        className={isPaused ? 'pointer-events-none select-none opacity-60' : undefined}
        aria-disabled={isPaused || undefined}
      >
        {itemsQ.isLoading ? (
          <Card>
            <CardContent>
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ) : itemsQ.isError ? (
          <EmptyState
            icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
            title="Could not load tasks"
            description={
              itemsQ.error instanceof ApiError
                ? itemsQ.error.message
                : 'Something went wrong while loading the tracked tasks.'
            }
            cta={
              <Button
                leftIcon={<RotateCw width={16} height={16} strokeWidth={1.75} />}
                onClick={() => void itemsQ.refetch()}
              >
                Retry
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck width={28} height={28} strokeWidth={1.75} />}
            title="No tasks yet"
            description="This programme tracks nothing. Add tasks — or unhide catalog ones — on the Kavach work list tab."
          />
        ) : (
          <div className="grid gap-3 md:gap-4">
            {orderedBuckets.map((bucket) => {
              const bucketItems = grouped.get(bucket) ?? [];
              return (
                <Card key={bucket}>
                  <CardContent padding="none" className="md:p-4">
                    <div className="flex items-center justify-between px-3 py-2 md:px-4 md:py-3">
                      <p className="text-sm font-semibold text-text">
                        {CADENCE_BUCKET_LABEL[bucket]}
                      </p>
                      <span className="text-xs text-text-subtle">
                        {bucketItems.length}{' '}
                        {bucketItems.length === 1 ? 'task' : 'tasks'}
                      </span>
                    </div>
                    <div>
                      {bucketItems.map((item) => (
                        <KavachItemRow
                          key={item.id}
                          item={item}
                          busy={busyId === item.id}
                          onTogglePause={(i) =>
                            withBusy(
                              i.id,
                              () =>
                                setPaused.mutateAsync({
                                  itemId: i.id,
                                  body: { paused: !i.paused },
                                }),
                              i.paused ? 'Task resumed' : 'Task paused',
                            )
                          }
                          onToggleSos={(i) =>
                            withBusy(
                              i.id,
                              () =>
                                setSos.mutateAsync({
                                  itemId: i.id,
                                  body: { compliant: i.status === 'SOS_FLAGGED' },
                                }),
                              i.status === 'SOS_FLAGGED'
                                ? 'SOS flag cleared'
                                : 'SOS flagged',
                            )
                          }
                          onVerify={(i) => setVerifying(i)}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={enableDealerFacingOpen}
        onClose={() => setEnableDealerFacingOpen(false)}
        title="Start messaging this dealer"
        description={dealerCodeLabel(dealer.code)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setEnableDealerFacingOpen(false)}
            >
              Not yet
            </Button>
            <Button
              loading={busyId === 'dealer-facing'}
              onClick={() => void setDealerFacing(true)}
            >
              Turn messages on
            </Button>
          </>
        }
      >
        <div className="grid gap-3 text-sm text-text-muted">
          <p>
            From the next digest at{' '}
            <span className="font-medium text-text">
              {String(programme.reminderHour ?? 8).padStart(2, '0')}:00 IST
            </span>{' '}
            this dealer starts receiving a daily list of what is outstanding, and
            their score becomes something they can be shown.
          </p>
          {score.notYetVerifiedCount > 0 ? (
            <Callout intent="warning">
              {score.notYetVerifiedCount} task
              {score.notYetVerifiedCount === 1 ? ' has' : 's have'} never been
              checked by anyone at MDG. Turn this on and the first thing this
              dealer hears about them is that they are outstanding.
            </Callout>
          ) : null}
          <p>You can switch it off again at any time.</p>
        </div>
      </Dialog>

      {/*
        The same drawer the cross-dealer queue opens, adapted from the item in
        hand. `hasNext` is false: there is no queue order to advance through
        here, and offering "Save & next" without one would move an admin to a
        task they never chose.
      */}
      <VerifyTaskDrawer
        open={verifying !== null}
        row={verifying ? workQueueRowFromItem(verifying, dealer.code) : null}
        hasNext={false}
        onNext={() => undefined}
        onClose={() => setVerifying(null)}
        onHandled={() => {
          // The panel's list and the header score both move on a verify, so
          // refetch rather than patch: the score is recomputed server-side and
          // guessing it here is how a screen starts disagreeing with its own data.
          void itemsQ.refetch();
          void programmeQ.refetch();
          setVerifying(null);
        }}
      />
    </div>
  );
}
