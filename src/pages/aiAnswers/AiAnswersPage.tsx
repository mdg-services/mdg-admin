import { CircleSlash2, MessageSquare, ThumbsDown, ThumbsUp, UserPlus } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  ClampedText,
  EmptyState,
  FilterBar,
  Label,
  MobileCardList,
  Pagination,
  SegmentedControl,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  useToast,
} from '@/components/ui';
import {
  useAiTurnCountsQuery,
  useAiTurnsQuery,
  useReviewAiTurn,
} from '@/hooks/api/useAiTurns';
import { useDealersQuery } from '@/hooks/api/useDealers';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import {
  AI_HANDOFF_REASON_LABEL,
  AI_INTENT_LABEL,
  AI_OUTCOME_LABEL,
  AI_OUTCOME_TONE,
  AI_VERDICT_LABEL,
  aiCostLabel,
  aiReasonTone,
  aiTurnAge,
  aiWithheldAnswer,
  dealerCodeLabel,
} from '@dk/shared';
import type { AiHandoffReason, AiTurn, AiTurnOutcome, AiTurnVerdict } from '@dk/shared';
import type { AiTurnListQuery } from '@dk/shared/schemas';

import { AiFirstLineSwitches } from './AiFirstLineSwitches';
import {
  OUTCOME_OPTIONS,
  REASON_OPTIONS,
  REVIEW_FACETS,
  activeFilterCount,
  facetQuery,
  resolveReviewFacet,
  type AiReviewFacet,
} from './format';

/**
 * Every answer the machine has given, across every dealer, newest first — and
 * the three buttons that say whether it was any good.
 *
 * THIS PAGE IS THE SAFETY CASE. The feature's whole claim is that a machine
 * answering a customer is safe because a person reads what it said; that claim
 * is only true if somebody actually opens this screen. Which is why the default
 * view is `unreviewed` and why the nav item carries an unreviewed COUNT — a page
 * nobody is nudged to open is not a safety case, it is a page.
 *
 * ADMIN, not super-admin, for the reading and the judging. The people who answer
 * the tickets are the people who can tell whether an answer was any good; gating
 * this behind super-admin would mean the verdicts came from whoever had the
 * rights rather than whoever had the context. Only the two SWITCHES at the
 * bottom are super-admin.
 */

const PAGE_SIZE = 20;

/** The three verdicts, as buttons. Order is deliberate: the common one first. */
const VERDICT_BUTTONS: ReadonlyArray<{
  verdict: AiTurnVerdict;
  icon: typeof ThumbsUp;
  variant: 'secondary' | 'danger';
}> = [
  { verdict: 'RIGHT', icon: ThumbsUp, variant: 'secondary' },
  { verdict: 'WRONG', icon: ThumbsDown, variant: 'danger' },
  { verdict: 'SHOULD_HAVE_HANDED_OFF', icon: UserPlus, variant: 'secondary' },
];

function VerdictButtons({
  turn,
  onReview,
  busy,
}: {
  turn: AiTurn;
  onReview: (verdict: AiTurnVerdict) => void;
  busy: boolean;
}) {
  const current = turn.review?.verdict;
  return (
    <>
      {VERDICT_BUTTONS.map(({ verdict, icon: Icon, variant }) => {
        const active = current === verdict;
        return (
          <Button
            key={verdict}
            size="sm"
            // A verdict may be CHANGED — the same admin looking again, or a
            // colleague who knows the dealer — so the current one is shown as
            // pressed rather than locking the row. The breaker reads the same
            // field, so a corrected verdict corrects the breaker too.
            variant={active ? 'primary' : variant}
            aria-pressed={active}
            disabled={busy}
            onClick={() => onReview(verdict)}
            leftIcon={<Icon width={14} height={14} strokeWidth={1.75} />}
          >
            {AI_VERDICT_LABEL[verdict]}
          </Button>
        );
      })}
    </>
  );
}

/** The outcome + reason pair, which is how a turn is read at a glance. */
function OutcomeCell({ turn }: { turn: AiTurn }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge intent={AI_OUTCOME_TONE[turn.outcome]}>
        {AI_OUTCOME_LABEL[turn.outcome]}
      </Badge>
      {turn.reason ? (
        <Badge intent={aiReasonTone(turn.reason)}>
          {AI_HANDOFF_REASON_LABEL[turn.reason]}
        </Badge>
      ) : null}
      {turn.review ? (
        <Badge intent={turn.review.verdict === 'WRONG' ? 'danger' : 'info'}>
          {AI_VERDICT_LABEL[turn.review.verdict]}
        </Badge>
      ) : null}
    </div>
  );
}

/**
 * What the machine said, or — when it composed something and kept it — what it
 * would have said, labelled as such.
 *
 * Labelling matters more than it looks. A shadow turn's answer never reached a
 * dealer, and a reviewer who reads it as something that DID would judge a
 * rehearsal as a live mistake, which is precisely the confusion the `SHADOW`
 * outcome exists to prevent.
 */
function AnswerCell({ turn }: { turn: AiTurn }) {
  const withheld = aiWithheldAnswer(turn);
  if (withheld) {
    return (
      <div className="grid gap-0.5">
        <span className="text-xs font-medium uppercase tracking-wide text-text-subtle">
          Written, not sent
        </span>
        <ClampedText className="text-sm text-text">{withheld}</ClampedText>
      </div>
    );
  }
  if (!turn.answer) {
    return <span className="text-sm text-text-subtle">Nothing was posted</span>;
  }
  return <ClampedText className="text-sm text-text">{turn.answer}</ClampedText>;
}

export function AiAnswersPage() {
  const toast = useToast();
  const isSuperAdmin = useIsSuperAdmin();
  const [searchParams, setSearchParams] = useSearchParams();

  // The facet rides in the URL so a link to "everything this dealer was told"
  // can be pasted into a ticket. Everything else is page state.
  const facet = resolveReviewFacet(searchParams.get('view'));
  const [page, setPage] = React.useState(1);
  const [dealerId, setDealerId] = React.useState('');
  const [reason, setReason] = React.useState<AiHandoffReason | ''>('');
  const [outcome, setOutcome] = React.useState<AiTurnOutcome | ''>('');
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  // Ticks once a minute so the ages advance on their own, the same way the
  // inbox's SLA colours do, without waiting for new data to arrive.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  function setFacet(next: AiReviewFacet) {
    const params = new URLSearchParams(searchParams);
    params.set('view', next);
    setSearchParams(params, { replace: true });
    setPage(1);
  }

  /**
   * The facet's own clauses come LAST, so a facet always wins over the explicit
   * pickers. "Called wrong" plus an outcome of `SUPPRESSED` is a contradiction —
   * a suppressed turn posted nothing to be wrong about — and the honest
   * resolution is the one the operator chose most recently, which is the facet
   * they are standing in.
   */
  const query: AiTurnListQuery = {
    page,
    pageSize: PAGE_SIZE,
    ...(dealerId ? { dealerId } : {}),
    ...(outcome ? { outcome } : {}),
    ...(reason ? { reason } : {}),
    ...facetQuery(facet),
  };

  const turnsQ = useAiTurnsQuery(query);
  const countsQ = useAiTurnCountsQuery();
  const review = useReviewAiTurn();
  // The roster for the dealer picker. One page of 200 covers the whole estate
  // several times over; this is a filter, not a directory.
  const dealersQ = useDealersQuery({ page: 1, pageSize: 200, sort: 'code' });

  const turns = turnsQ.data?.items ?? [];
  const total = turnsQ.data?.total ?? 0;
  const counts = countsQ.data;

  function applyVerdict(turn: AiTurn, verdict: AiTurnVerdict) {
    setPendingId(turn.id);
    review.mutate(
      { id: turn.id, input: { verdict } },
      {
        onSuccess: () => {
          toast.success(`Marked ${AI_VERDICT_LABEL[verdict].toLowerCase()}`);
          setPendingId(null);
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Could not save the verdict');
          setPendingId(null);
        },
      },
    );
  }

  function clearFilters() {
    setDealerId('');
    setOutcome('');
    setReason('');
    setPage(1);
  }

  const filters = (
    <>
      <div className="grid gap-1">
        <Label htmlFor="ai-dealer">Dealer</Label>
        <Select
          id="ai-dealer"
          value={dealerId}
          onChange={(e) => {
            setDealerId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Every dealer</option>
          {(dealersQ.data?.items ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {dealerCodeLabel(d.code)}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="ai-outcome">Outcome</Label>
        <Select
          id="ai-outcome"
          value={outcome}
          onChange={(e) => {
            setOutcome(e.target.value as AiTurnOutcome | '');
            setPage(1);
          }}
        >
          <option value="">Any outcome</option>
          {OUTCOME_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {AI_OUTCOME_LABEL[o]}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="ai-reason">Why it stopped</Label>
        <Select
          id="ai-reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value as AiHandoffReason | '');
            setPage(1);
          }}
        >
          <option value="">Any reason</option>
          {REASON_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {AI_HANDOFF_REASON_LABEL[r]}
            </option>
          ))}
        </Select>
      </div>
    </>
  );

  return (
    <div>
      <PageHeader
        title="AI answers"
        subtitle="Every reply the first line has given a dealer, newest first. Judging one takes a second and is the only thing that makes the feature safe to leave on."
      />

      {/* The breaker's position, stated before the list. "Two of three" is
          something a person can act on; discovering the feature has switched
          itself off is not. */}
      {counts && counts.wrongIn24h > 0 ? (
        // `Callout` has two intents, warning and info, and neither is red — so
        // the tripped case is carried by a badge and by the sentence rather than
        // by a colour this primitive does not have. Which is the right way round
        // anyway: "the first line has switched itself off" is the message, and a
        // red box that says the same thing in fewer words is not clearer.
        <Callout intent="warning">
          {counts.wrongIn24h >= counts.breakerAt ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <Badge intent="danger">Stopped</Badge>
              {`${counts.wrongIn24h} answers have been called wrong in the last 24 hours, so the first line has switched itself off.`}
            </span>
          ) : (
            `${counts.wrongIn24h} of ${counts.breakerAt} answers called wrong in the last 24 hours. At ${counts.breakerAt} the first line switches itself off.`
          )}
        </Callout>
      ) : null}

      <div className="mt-3 grid gap-3">
        <SegmentedControl<AiReviewFacet>
          value={facet}
          onChange={setFacet}
          options={REVIEW_FACETS.map((f) => ({
            value: f.value,
            label:
              f.value === 'unreviewed' && counts
                ? `${f.label} · ${counts.unreviewed}`
                : f.label,
          }))}
          aria-label="Which answers to show"
        />

        <FilterBar
          activeCount={activeFilterCount({ dealerId, outcome, reason })}
          onClear={clearFilters}
          columnsAtMd={3}
        >
          {filters}
        </FilterBar>

        <Card>
          <CardContent padding="none">
            {turnsQ.isLoading ? (
              <div className="grid gap-2 p-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : turns.length === 0 ? (
              <EmptyState
                icon={<MessageSquare width={28} height={28} strokeWidth={1.5} />}
                title={
                  facet === 'unreviewed'
                    ? 'Nothing left to review'
                    : 'No turns match'
                }
                description={
                  facet === 'unreviewed'
                    ? 'Every answer the machine has given has been looked at.'
                    : 'Try a wider filter, or the Everything view.'
                }
              />
            ) : (
              <>
                {/* Desktop: a table, in its own horizontal scroller so a long
                    answer can never make the page body scroll sideways. */}
                <div className="hidden overflow-x-auto md:block">
                  <Table density="compact">
                    <THead>
                      <TRow>
                        <TH>Dealer</TH>
                        <TH>They asked</TH>
                        <TH>It said</TH>
                        <TH>Outcome</TH>
                        <TH>Cost</TH>
                        <TH>Verdict</TH>
                      </TRow>
                    </THead>
                    <TBody>
                      {turns.map((turn) => (
                        <TRow key={turn.id}>
                          <TD>
                            <div className="grid gap-0.5">
                              <Link
                                to={`/inbox?c=${turn.conversationId}`}
                                className="font-mono text-brand hover:underline"
                              >
                                {dealerCodeLabel(turn.dealerCode)}
                              </Link>
                              <span className="text-xs text-text-subtle">
                                {aiTurnAge(turn.createdAt, now)}
                                {turn.intent ? ` · ${AI_INTENT_LABEL[turn.intent]}` : ''}
                              </span>
                            </div>
                          </TD>
                          <TD>
                            <div className="max-w-[22rem]">
                              <ClampedText className="text-sm text-text-muted">
                                {turn.question ?? '—'}
                              </ClampedText>
                            </div>
                          </TD>
                          <TD>
                            <div className="max-w-[24rem]">
                              <AnswerCell turn={turn} />
                            </div>
                          </TD>
                          <TD>
                            <OutcomeCell turn={turn} />
                          </TD>
                          <TD>
                            <span className="tabular-nums text-sm">
                              {aiCostLabel(turn.estPaise)}
                            </span>
                          </TD>
                          <TD>
                            <div className="flex flex-wrap gap-1">
                              <VerdictButtons
                                turn={turn}
                                busy={review.isPending && pendingId === turn.id}
                                onReview={(v) => applyVerdict(turn, v)}
                              />
                            </div>
                          </TD>
                        </TRow>
                      ))}
                    </TBody>
                  </Table>
                </div>

                {/* Below md: cards, never a sideways-scrolling table. */}
                <MobileCardList
                  variant="rows"
                  cards={turns.map((turn) => ({
                    key: turn.id,
                    primary: (
                      <Link
                        to={`/inbox?c=${turn.conversationId}`}
                        className="font-mono font-medium text-brand"
                      >
                        {dealerCodeLabel(turn.dealerCode)}
                      </Link>
                    ),
                    primaryRight: <OutcomeCell turn={turn} />,
                    primaryRightWidth: 'clamp',
                    secondary: turn.question ? `“${turn.question}”` : undefined,
                    kv: [
                      { label: 'It said', value: <AnswerCell turn={turn} /> },
                      {
                        label: 'Cost',
                        value: aiCostLabel(turn.estPaise),
                        numeric: true,
                      },
                    ],
                    meta: (
                      <>
                        {aiTurnAge(turn.createdAt, now)}
                        {turn.intent ? ` · ${AI_INTENT_LABEL[turn.intent]}` : ''}
                      </>
                    ),
                    actions: (
                      <VerdictButtons
                        turn={turn}
                        busy={review.isPending && pendingId === turn.id}
                        onReview={(v) => applyVerdict(turn, v)}
                      />
                    ),
                    actionsLayout: 'wrap',
                  }))}
                />

                <div className="border-t border-border">
                  <Pagination
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={total}
                    onPageChange={setPage}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {isSuperAdmin ? (
          <AiFirstLineSwitches />
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-text-subtle">
            <CircleSlash2 width={13} height={13} strokeWidth={1.75} />
            Turning the first line on or off is a super-admin control.
          </p>
        )}
      </div>
    </div>
  );
}
