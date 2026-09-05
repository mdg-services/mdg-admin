import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  DownloadCloud,
  Share2,
  ShieldCheck,
  Truck,
  XCircle,
} from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  MobileCardList,
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
  useCollectRoSupplyStatus,
  useRoSupplyCard,
  useRoSupplyStatus,
} from '@/hooks/api/useRoSupplyStatus';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { shareSavedImage } from '@/lib/shareCard';
import { StatTile, StatTileRow, StatTileSkeletons } from '@/pages/dataVault/StatTile';
import {
  roSupplyConditionCopy,
  roSupplyHeadlineLabel,
  type RoComplianceRow,
} from '@dk/shared';

import { useRoSupplyRunWatcher } from './roSupply/useRoSupplyRunWatcher';
import type { DealerVaultPaneProps } from './types';

/**
 * A dealer's RO supply status: whether SAP is currently blocking supply to their
 * outlet, and the RDB/SDMS compliance conditions that can cause a block.
 *
 * THE ONE DESIGN RULE HERE: three states, not two. Blocked, unblocked, and
 * "the portal said something we could not read" are all rendered differently.
 * The temptation is to treat unknown as fine — it makes the panel calmer — and
 * that is exactly the failure this pane exists to prevent, because the portal
 * has been rebuilt under us before and an unrecognised sentence is the first
 * symptom. A grey "we do not know" sends someone to look; a green "all good"
 * does not.
 */
export function DealerRoSupplyStatusPane({ dealer }: DealerVaultPaneProps) {
  // Which shape to BUILD, not just which to show: a table and a card stack are
  // the same rows twice, and building the hidden one costs a phone real work.
  const isMd = useMediaQuery('(min-width: 768px)');
  const toast = useToast();
  const summaryQ = useRoSupplyStatus(dealer.id);
  const collect = useCollectRoSupplyStatus(dealer.id);
  // The check answers 202 and then drives the portal for about a minute, so the
  // pane watches the run and refreshes when it actually lands rather than
  // promising a refresh at the moment of the click.
  const runWatch = useRoSupplyRunWatcher(dealer.id);
  const busy = collect.isPending || runWatch.busy;

  function runCapture() {
    collect.mutate(undefined, {
      onSuccess: (res) => {
        runWatch.watch(res.runId);
        toast.success('Checking — the portal takes about a minute. This section will refresh.');
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Could not start the check'),
    });
  }

  /**
   * The picture comes from the SERVER, not from this page.
   *
   * The dealer it is meant for is on WhatsApp, not in the admin, and the card
   * has to be drawable by whatever is awake. Once the server can draw it, having
   * this page draw its own would mean two renderers of one card quietly drifting
   * apart — so this asks for the file rather than making one.
   */
  const card = useRoSupplyCard(dealer.id);
  const onShare = React.useCallback(async () => {
    try {
      const urls = await card.mutateAsync();
      const res = await shareSavedImage(urls);
      if (res.outcome === 'downloaded') toast.success('Image saved to your Downloads.');
      else if (res.outcome === 'failed') {
        toast.error(res.reason ?? 'The image could not be saved.');
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'The image could not be prepared.',
      );
    }
  }, [card, toast]);

  const shareButton = (
    <Button
      variant="secondary"
      size="sm"
      loading={card.isPending}
      leftIcon={<Share2 width={15} height={15} strokeWidth={1.75} />}
      onClick={() => void onShare()}
    >
      Share with dealer
    </Button>
  );

  const captureButton = (
    <Button
      variant="secondary"
      size="sm"
      loading={busy}
      leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
      onClick={runCapture}
    >
      Check now
    </Button>
  );

  if (summaryQ.isLoading) {
    return (
      <div className="grid gap-3 md:gap-4">
        <StatTileSkeletons count={3} />
        <Card>
          <CardContent className="grid gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (summaryQ.isError) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load the RO supply status"
        description={
          summaryQ.error instanceof ApiError ? summaryQ.error.message : 'Please try again.'
        }
        cta={captureButton}
      />
    );
  }

  const summary = summaryQ.data!;
  const neverCaptured = !summary.capturedAt;
  const failed = summary.status === 'FAILED' || !!summary.failureReason;
  const clearCount = summary.rows.filter((r) => r.mark === 'YES').length;
  // STALE, not broken: the figures below are real, they are just older than the
  // two-hourly rhythm implies because the checks since have been failing. That
  // is a different message from "this has never worked", and the difference is
  // the whole reason `lastFailure` is carried on the summary.
  const staleSince =
    failed && summary.rows.length > 0 && summary.lastFailure ? summary.lastFailure.at : null;

  return (
    <div className="grid gap-3 md:gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text">RO supply status</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            {summary.roCode ? `Outlet ${summary.roCode} · ` : ''}Last checked{' '}
            {summary.capturedAt ? formatDateTime(summary.capturedAt) : 'never'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Only offered once there is something to send. Sharing an empty card
              would put a picture of nothing in front of a dealer. */}
          {summary.capturedAt ? shareButton : null}
          {captureButton}
        </div>
      </div>

      {failed ? (
        <Card className="border-danger/40 bg-danger-soft/40">
          <CardContent className="flex items-start gap-3">
            <AlertCircle
              width={18}
              height={18}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-danger"
            />
            <div>
              <p className="text-sm font-semibold text-text">
                {staleSince
                  ? `The last check failed — showing what we saw at ${formatDateTime(summary.capturedAt!)}`
                  : 'The latest check did not complete'}
              </p>
              <p className="text-sm text-text-muted">
                {summary.failureReason ??
                  'The portal could not be read. Anything captured earlier is kept below.'}
              </p>
              {staleSince ? (
                <p className="mt-0.5 text-xs text-text-subtle">
                  Last failed attempt {formatDateTime(staleSince)}.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {neverCaptured && summary.rows.length === 0 && !summary.headline ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Truck width={28} height={28} strokeWidth={1.75} />}
              title="Supply status not checked yet"
              description="Once the RO Supply Status service runs for this dealer, whether their outlet can be supplied — and what is holding it up — appears here."
              cta={captureButton}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <SupplyBanner blocked={summary.blocked} headline={summary.headline} />

          <StatTileRow>
            <StatTile
              label="Conditions clear"
              value={clearCount}
              tone="neutral"
              icon={<ShieldCheck width={16} height={16} strokeWidth={1.75} />}
              hint={`of ${summary.rows.length} checked`}
            />
            <StatTile
              label="Conditions failing"
              value={summary.failingCount}
              tone={summary.failingCount > 0 ? 'danger' : 'success'}
              icon={<XCircle width={16} height={16} strokeWidth={1.75} />}
              hint={
                summary.failingCount > 0
                  ? 'These can block supply'
                  : 'Nothing outstanding'
              }
            />
            {/* Shown only when it is non-zero. An "unreadable" tile permanently
                reading 0 trains people to ignore it, and this number is the
                pane's own alarm: it means the portal changed and the marks below
                may be wrong. */}
            {summary.unknownCount > 0 ? (
              <StatTile
                label="Could not read"
                value={summary.unknownCount}
                tone="warning"
                icon={<CircleHelp width={16} height={16} strokeWidth={1.75} />}
                hint="Check the portal directly"
              />
            ) : null}
          </StatTileRow>

          <Card>
            {/* `padding="none"`, not `className="p-0"`: `cn` is clsx and Tailwind
                emits `.p-4` after `.p-0`, so the p-0 never applied. */}
            <CardContent padding="none" className="md:p-4">
              <CardHeader
                align="center"
                padding="comfortable"
                action={
                  summary.rows.length > 0 ? (
                    <Badge
                      intent={summary.failingCount > 0 ? 'danger' : 'success'}
                      className="tabular-nums"
                    >
                      {clearCount} of {summary.rows.length} clear
                    </Badge>
                  ) : undefined
                }
              >
                <p className="text-base font-semibold text-text">
                  Compliance status in RDB/SDMS
                </p>
                <p className="text-sm text-text-muted">
                  {summary.failingCount > 0
                    ? 'Any ONE of these left unmet is enough for IndianOil to stop this outlet buying fuel.'
                    : 'The conditions the portal checks before it will allow supply.'}
                </p>
              </CardHeader>

              {summary.rows.length === 0 ? (
                <EmptyState
                  icon={<ShieldCheck width={28} height={28} strokeWidth={1.75} />}
                  title="No compliance rows were read"
                  description="The last check reached the screen but found no compliance table. If this persists, the portal has likely changed shape."
                />
              ) : isMd ? (
                <div className="hidden md:block">
                  <Table>
                    <THead>
                      <TRow>
                        <TH>Condition</TH>
                        <TH className="text-right">Status</TH>
                      </TRow>
                    </THead>
                    <TBody>
                      {summary.rows.map((row, i) => (
                        <TRow key={`${row.description}-${i}`}>
                          <TD>
                            {row.description}
                            {/* Only on a failing row. On a clear one it would be
                                advice about a problem the dealer does not have. */}
                            {row.mark === 'NO' && roSupplyConditionCopy(row.description)?.actionEn ? (
                              <span className="mt-0.5 block text-xs text-text-muted">
                                {roSupplyConditionCopy(row.description)!.actionEn}
                              </span>
                            ) : null}
                          </TD>
                          <TD className="whitespace-nowrap text-right">
                            <MarkPill row={row} />
                          </TD>
                        </TRow>
                      ))}
                    </TBody>
                  </Table>
                </div>
              ) : (
                <MobileCardList
                  variant="rows"
                  cards={summary.rows.map((row, i) => ({
                    key: `${row.description}-${i}`,
                    primary: (
                      <span className="block font-medium text-text">{row.description}</span>
                    ),
                    primaryRight: <MarkPill row={row} />,
                    meta:
                      row.mark === 'NO' && roSupplyConditionCopy(row.description)?.actionEn ? (
                        <span>{roSupplyConditionCopy(row.description)!.actionEn}</span>
                      ) : undefined,
                  }))}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * The headline: the one thing someone opened this pane to find out.
 *
 * Three tones, deliberately — see the pane's own header comment. The unknown
 * state quotes the portal verbatim rather than paraphrasing, because the exact
 * sentence is what an engineer needs in order to teach the parser to read it.
 */
function SupplyBanner({
  blocked,
  headline,
}: {
  blocked: boolean | null;
  headline: string | null;
}) {
  const label = roSupplyHeadlineLabel({ blocked, headline });

  if (blocked === true) {
    return (
      <Card className="border-danger/40 bg-danger-soft/40">
        <CardContent className="flex items-start gap-3">
          <XCircle
            width={20}
            height={20}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-danger"
          />
          <div className="min-w-0">
            <p className="text-base font-semibold text-text">{label}</p>
            <p className="text-sm text-text-muted">
              This outlet cannot be supplied until the failing conditions below are cleared.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (blocked === false) {
    return (
      <Card className="border-success/40 bg-success-soft/40">
        <CardContent className="flex items-start gap-3">
          <CheckCircle2
            width={20}
            height={20}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-success"
          />
          <div className="min-w-0">
            <p className="text-base font-semibold text-text">{label}</p>
            <p className="text-sm text-text-muted">
              The portal is not holding supply to this outlet.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-warning/40 bg-warning-soft/40">
      <CardContent className="flex items-start gap-3">
        <CircleHelp
          width={20}
          height={20}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0 text-warning"
        />
        <div className="min-w-0">
          <p className="text-base font-semibold text-text">Supply status unclear</p>
          <p className="break-words text-sm text-text-muted">
            {headline
              ? `${label}. That is not wording we recognise, so it has not been read as blocked or unblocked — check the portal directly.`
              : 'The check reached the screen but found no supply sentence on it, so nothing has been read as blocked or unblocked — check the portal directly.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** One row's tick, cross, or honest shrug. */
function MarkPill({ row }: { row: RoComplianceRow }) {
  if (row.mark === 'YES') {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-success">
        <CheckCircle2 width={15} height={15} strokeWidth={2} />
        Clear
      </span>
    );
  }
  if (row.mark === 'NO') {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-danger">
        <XCircle width={15} height={15} strokeWidth={2} />
        Not clear
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-warning"
      // The raw evidence, on hover, so an engineer diagnosing a wrong read does
      // not have to open the database to see what the cell actually offered.
      title={row.rawMark ?? 'The portal cell carried nothing we could read'}
    >
      <CircleHelp width={15} height={15} strokeWidth={2} />
      Unreadable
    </span>
  );
}
