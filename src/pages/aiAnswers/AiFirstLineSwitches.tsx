import * as React from 'react';

import {
  Badge,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  HowThisWorks,
  Input,
  MobileCardList,
  SegmentedControl,
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
  useAiFirstLineDealersQuery,
  useAiFirstLineSwitchQuery,
  useSetAiFirstLineSwitch,
  useSetAiFirstLineWriterSwitch,
  useSetDealerFirstLineMode,
  type AiFirstLineDealerRow,
} from '@/hooks/api/useAiTurns';
import { dealerCodeLabel, type DealerFirstLineMode } from '@dk/shared';

import {
  MODE_HELP,
  MODE_INTENT,
  MODE_OPTIONS,
  SWITCH_POSITIONS,
  SWITCH_POSITION_HELP,
  SWITCH_POSITION_LABEL,
  switchPosition,
  type AiSwitchPosition,
} from './format';

/**
 * The two switches, and they are deliberately not the same kind of control.
 *
 * The GLOBAL one is a LADDER with three rungs — Off, Templates only, Full — and
 * the middle rung is the one this version added. Under v2 the likeliest thing an
 * admin wants to stop at nine at night is THE PROSE, NOT THE SERVICE, and
 * turning the whole first line off to stop a clumsy sentence throws away a
 * working product. "Templates only" is exactly what was live before this version
 * shipped, so it is a known-good place to stand rather than a degraded one.
 *
 * Off still confirms, and only Off, because it is the only rung that stops
 * dealers being answered at all.
 *
 * The PER-DEALER one is an enrolment, walked `OFF → SHADOW → ON` one outlet at
 * a time, so it is a three-way picker with the whole ladder visible.
 *
 * Super-admin only, and the hooks are gated on `useIsSuperAdmin()` as well as by
 * the endpoints, so a plain admin who reaches this file never sends a request.
 */

/** "3 Sep 2026, 14:20" — enough to place a change, without a seconds field. */
function whenLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ModePicker({
  row,
  onChange,
  busy,
}: {
  row: AiFirstLineDealerRow;
  onChange: (mode: DealerFirstLineMode) => void;
  busy: boolean;
}) {
  return (
    <div className={busy ? 'pointer-events-none opacity-60' : undefined}>
      <SegmentedControl<DealerFirstLineMode>
        value={row.mode}
        onChange={onChange}
        options={MODE_OPTIONS.map((m) => ({ value: m, label: m }))}
        aria-label={`First line mode for ${dealerCodeLabel(row.dealerCode)}`}
      />
    </div>
  );
}

/** "Set to SHADOW by someone@mdg, 3 Sep 2026, 14:20", or nothing at all. */
function LastChange({ row }: { row: AiFirstLineDealerRow }) {
  if (!row.changedAt) {
    return <span className="text-text-subtle">Never changed</span>;
  }
  return (
    <span className="text-text-muted">
      {row.changedByEmail ?? 'Unknown'}
      {' · '}
      {whenLabel(row.changedAt)}
    </span>
  );
}

export function AiFirstLineSwitches() {
  const toast = useToast();
  const switchQ = useAiFirstLineSwitchQuery();
  const dealersQ = useAiFirstLineDealersQuery();
  const setSwitch = useSetAiFirstLineSwitch();
  const setWriter = useSetAiFirstLineWriterSwitch();
  const setMode = useSetDealerFirstLineMode();
  const [confirmStop, setConfirmStop] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [pendingDealerId, setPendingDealerId] = React.useState<string | null>(null);

  // Inside the memo, not beside it: `?? []` produces a fresh array identity on
  // every render, so a `rows` computed outside would defeat the memo entirely.
  const items = dealersQ.data?.items;
  const filtered = React.useMemo(() => {
    const rows = items ?? [];
    const q = search.trim().toUpperCase();
    const matched = q
      ? rows.filter((r) => (r.dealerCode ?? '').toUpperCase().includes(q))
      : rows;
    // ENROLLED FIRST. The list is every live dealer — that is the point, so
    // "who is NOT on it?" has an answer — but the handful somebody has switched
    // on are the ones being watched this week, and they must not be somewhere
    // down a hundred-row list of OFF.
    const rank: Record<DealerFirstLineMode, number> = { ON: 0, SHADOW: 1, OFF: 2 };
    return [...matched].sort(
      (a, b) =>
        rank[a.mode] - rank[b.mode] ||
        (a.dealerCode ?? '').localeCompare(b.dealerCode ?? ''),
    );
  }, [items, search]);

  const live = switchQ.data;
  const enabled = live?.enabled ?? false;
  const position = switchPosition(live);
  const switching = setSwitch.isPending || setWriter.isPending;

  /**
   * Move the ladder.
   *
   * The two fields are sent as TWO requests and SEQUENTIALLY, not as one body,
   * and both halves of that are deliberate. Two requests because the backend
   * audits them under two different actions — "somebody stopped the prose" and
   * "somebody stopped the first line" have different blast radii, and an audit
   * log that cannot tell them apart is one nobody can read in an incident.
   * Sequentially because both write the same settings document with `upsert`,
   * and two concurrent upserts of a document that does not exist yet race on the
   * unique `_id`.
   */
  async function applyPosition(next: AiSwitchPosition) {
    if (next === position) return;
    // Off is the one rung that stops dealers being answered at all, so it is the
    // one rung that asks.
    if (next === 'off') {
      setConfirmStop(true);
      return;
    }
    try {
      if (!enabled) await setSwitch.mutateAsync(true);
      await setWriter.mutateAsync(next === 'full');
      toast.success(
        next === 'full'
          ? 'It writes its own replies again'
          : 'It answers with the hand-written sentences only',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not move the switch');
    }
  }

  function applyMode(row: AiFirstLineDealerRow, mode: DealerFirstLineMode) {
    if (mode === row.mode) return;
    setPendingDealerId(row.dealerId);
    setMode.mutate(
      { dealerId: row.dealerId, mode },
      {
        onSuccess: () => {
          toast.success(`${dealerCodeLabel(row.dealerCode)} set to ${mode}`);
          setPendingDealerId(null);
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Could not change the mode');
          setPendingDealerId(null);
        },
      },
    );
  }

  return (
    <div className="grid gap-3">
      <Card>
        <CardHeader
          align="center"
          action={
            <HowThisWorks
              surface="admin-ai-first-line-switches"
              label="The first line"
            />
          }
        >
          <CardTitle>The first line, everywhere</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {switchQ.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  intent={
                    position === 'full'
                      ? 'success'
                      : position === 'templates'
                        ? 'info'
                        : 'danger'
                  }
                >
                  {SWITCH_POSITION_LABEL[position]}
                </Badge>
                <span className="min-w-0 break-words text-sm text-text-muted">
                  {live?.updatedByName || live?.updatedByAdminId ? (
                    <>
                      Last changed by {live?.updatedByName ?? live?.updatedByAdminId}
                      {live?.updatedAt ? ` · ${whenLabel(live.updatedAt)}` : ''}
                    </>
                  ) : (
                    'Never changed'
                  )}
                </span>
              </div>

              {/*
               * The env flag and the database switch are NOT interchangeable and
               * the difference is invisible from a screen: with `envEnabled`
               * false, pressing Start below changes nothing at all until a
               * deploy — and somebody would press it and wait.
               */}
              {live && !live.envEnabled ? (
                <Callout intent="warning">
                  The server is deployed with the first line switched off
                  (<code>AI_FIRSTLINE_ENABLED</code> is false). Nothing here takes
                  effect until that changes and the backend is redeployed.
                </Callout>
              ) : null}

              {/*
               * The SAME trap one rung down, and it is reported for the same
               * reason: with `AI_FIRSTLINE_WRITER_ENABLED` false, moving the
               * switch to Full changes nothing at all — and somebody would move
               * it and wait, then read the prose rate above as a fence problem.
               * Only shown while the service itself is deployed on, so a box
               * with everything off does not stack two warnings saying the same
               * thing.
               */}
              {live && live.envEnabled && !live.envWriterEnabled ? (
                <Callout intent="warning">
                  The server is deployed with the writer switched off
                  (<code>AI_FIRSTLINE_WRITER_ENABLED</code> is false), so Full and
                  Templates only behave identically until that changes and the
                  backend is redeployed.
                </Callout>
              ) : null}

              <div className="grid gap-1.5">
                <div className={switching ? 'pointer-events-none opacity-60' : undefined}>
                  <SegmentedControl<AiSwitchPosition>
                    value={position}
                    onChange={(next) => void applyPosition(next)}
                    options={SWITCH_POSITIONS.map((v) => ({
                      value: v,
                      label: SWITCH_POSITION_LABEL[v],
                    }))}
                    aria-label="How much of the first line runs"
                  />
                </div>
                <p className="min-w-0 break-words text-sm text-text-muted">
                  {SWITCH_POSITION_HELP[position]}
                </p>
                {live ? (
                  <span className="text-xs text-text-subtle">
                    Takes effect within {live.takesEffectWithinSeconds} seconds.
                  </span>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Which outlets it runs for</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1">
            <p className="text-sm text-text-muted">{MODE_HELP.SHADOW}</p>
            <p className="text-xs text-text-subtle">
              Every live dealer is listed. Most read OFF, and that is the default
              for a dealer nobody has decided about.
            </p>
          </div>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by dealer code"
            aria-label="Filter dealers by code"
          />

          {dealersQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-muted">
              No dealer matches that code.
            </p>
          ) : (
            <>
              {/* Desktop table. Its own scroller so a long email never makes the
                  page scroll sideways. */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <THead>
                    <TRow>
                      <TH>Dealer</TH>
                      <TH>Mode</TH>
                      <TH>Last changed</TH>
                    </TRow>
                  </THead>
                  <TBody>
                    {filtered.map((row) => (
                      <TRow key={row.dealerId}>
                        <TD>
                          <span className="font-mono">
                            {dealerCodeLabel(row.dealerCode)}
                          </span>
                        </TD>
                        <TD>
                          <ModePicker
                            row={row}
                            busy={setMode.isPending && pendingDealerId === row.dealerId}
                            onChange={(mode) => applyMode(row, mode)}
                          />
                        </TD>
                        <TD>
                          <span className="text-sm">
                            <LastChange row={row} />
                          </span>
                        </TD>
                      </TRow>
                    ))}
                  </TBody>
                </Table>
              </div>

              <MobileCardList
                cards={filtered.map((row) => ({
                  key: row.dealerId,
                  primary: (
                    <span className="font-mono font-medium">
                      {dealerCodeLabel(row.dealerCode)}
                    </span>
                  ),
                  primaryRight: <Badge intent={MODE_INTENT[row.mode]}>{row.mode}</Badge>,
                  meta: <LastChange row={row} />,
                  // `actions`, not `onClick`: the card holds a control, and a
                  // button inside a button is unreachable on Android.
                  actions: (
                    <ModePicker
                      row={row}
                      busy={setMode.isPending && pendingDealerId === row.dealerId}
                      onChange={(mode) => applyMode(row, mode)}
                    />
                  ),
                  actionsLayout: 'stack',
                }))}
              />
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmStop}
        onCancel={() => setConfirmStop(false)}
        onConfirm={() =>
          setSwitch.mutate(false, {
            onSuccess: () => {
              toast.success('The first line is stopped');
              setConfirmStop(false);
            },
            onError: (err) => {
              toast.error(err instanceof Error ? err.message : 'Could not stop it');
              setConfirmStop(false);
            },
          })
        }
        title="Stop the AI first line?"
        description="Every dealer's tickets go straight to a person again, exactly as they did before this shipped. Nothing is lost; the turn log stays. If the problem is a badly written sentence rather than a wrong one, Templates only stops the writing and keeps the answers."
        confirmLabel="Stop it"
        confirmVariant="danger"
        loading={setSwitch.isPending}
      />
    </div>
  );
}
