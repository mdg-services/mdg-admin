import { Ban, Check, RotateCcw, SkipForward, UserRound, X } from 'lucide-react';
import * as React from 'react';

import { Button, Callout, EmptyState, Skeleton, useToast } from '@/components/ui';
import {
  useApproveKavachCheck,
  useExcuseKavachCheck,
  useKavachCheckQuery,
  useKavachReviewChecksQuery,
  useMarkKavachDataCheck,
  usePrefetchKavachCheck,
  useSendBackKavachCheck,
  useTellOwnerKavachCheck,
} from '@/hooks/api/useKavach';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { progressWords, runProgress, runQueue, withSkipped } from '@/lib/kavachWords';
import type { KavachCheckDetail } from '@dk/shared';

import { CheckDetailColumn } from './CheckDetailColumn';
import { CheckPhotos, useKavachViewer } from './CheckPhotos';
import { type BarAction, KavachActionBar } from './KavachActionBar';
import { AskAgainDialog, ExcuseDialog, MarkDataDialog, TellOwnerDialog } from './ReviewDialogs';

type Dialog = 'ask' | 'owner' | 'excuse' | 'done' | 'not_done' | null;

const ICON = { width: 16, height: 16, strokeWidth: 1.75 } as const;

/**
 * A run through one group of checks, one at a time: the photo on the left, our
 * data and the words on the right, and a bar under both to decide. After each
 * decision the next check opens by itself; when the group is empty the run
 * hands back to the caller.
 *
 * The run keeps its own list of what it decided and what the admin skipped, so
 * the server refreshing the group in the background (another admin's work, a
 * new upload) never reshuffles the check on screen.
 */
export function ReviewRun({
  code,
  dealerId,
  startId,
  title,
  onExit,
  onFinished,
}: {
  /** One point across every outlet… */
  code?: string;
  /** …or one outlet across every point. */
  dealerId?: string;
  /** Open this check first (the dealer page's list). */
  startId?: string;
  /** "Update DSR before 10 am" / "Outlet 1E". */
  title: string;
  onExit: () => void;
  /** The group has nothing left. `decided` is how many were dealt with in this run. */
  onFinished: (decided: number) => void;
}) {
  const toast = useToast();
  const rowsQ = useKavachReviewChecksQuery({ code, dealerId, state: 'sent' });
  const [decided, setDecided] = React.useState<ReadonlySet<string>>(() => new Set());
  const [skipped, setSkipped] = React.useState<string[]>([]);
  const [dialog, setDialog] = React.useState<Dialog>(null);
  // The check a dialog was opened for: if the run moves on under it, the dialog closes.
  const [dialogFor, setDialogFor] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const viewer = useKavachViewer();
  const prefetch = usePrefetchKavachCheck();

  // The first check the admin opened stays first only until it is decided or skipped.
  const queue = React.useMemo(
    () => runQueue(rowsQ.data ?? [], decided, skipped, startId),
    [rowsQ.data, decided, skipped, startId],
  );
  const currentId = queue[0];
  const detailQ = useKavachCheckQuery(currentId);
  const detail = detailQ.data && detailQ.data.id === currentId ? detailQ.data : undefined;

  const openDialog = React.useCallback(
    (d: Dialog) => {
      setDialogFor(currentId ?? null);
      setDialog(d);
    },
    [currentId],
  );
  React.useEffect(() => {
    if (dialog !== null && dialogFor !== null && currentId !== dialogFor) {
      setDialog(null);
      toast.info('The check you were looking at has moved on, so nothing was sent. The next one is open.');
    }
  }, [currentId, dialog, dialogFor, toast]);

  React.useEffect(() => prefetch(queue[1]), [queue, prefetch]);
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Nothing left, and something was done here: say so and go back.
  const finishedRef = React.useRef(false);
  React.useEffect(() => {
    if (finishedRef.current) return;
    if (rowsQ.data !== undefined && queue.length === 0 && decided.size > 0) {
      finishedRef.current = true;
      onFinished(decided.size);
    }
  }, [rowsQ.data, queue.length, decided.size, onFinished]);

  const approve = useApproveKavachCheck();
  const sendBack = useSendBackKavachCheck();
  const tellOwner = useTellOwnerKavachCheck();
  const excuse = useExcuseKavachCheck();
  const markData = useMarkKavachDataCheck();
  const busy =
    approve.isPending ||
    sendBack.isPending ||
    tellOwner.isPending ||
    excuse.isPending ||
    markData.isPending;

  const markDecided = React.useCallback((id: string) => {
    setDecided((prev) => new Set(prev).add(id));
  }, []);

  // Read at the moment of use, so `decide` does not change with every refetch.
  const refetchRef = React.useRef({ detail: detailQ.refetch, rows: rowsQ.refetch });
  refetchRef.current = { detail: detailQ.refetch, rows: rowsQ.refetch };

  /** Run one decision; on success the check is out of the run, on a 409 it is read again. */
  const decide = React.useCallback(
    function decide<T>(
      mutate: (vars: T, o: { onSuccess: () => void; onError: (e: unknown) => void }) => void,
      vars: T,
      id: string,
      done: string,
      then: 'decided' | 'skip' = 'decided',
    ) {
      mutate(vars, {
        onSuccess: () => {
          setDialog(null);
          // Telling the owner leaves the check open, so it only steps aside for now.
          if (then === 'skip') setSkipped((s) => withSkipped(s, id));
          else markDecided(id);
          toast.success(done);
        },
        onError: (e) => {
          setDialog(null);
          if (e instanceof ApiError && e.status === 409) {
            toast.info('Someone else moved this check, or the outlet sent a newer photo. It is loaded again.');
            void refetchRef.current.detail();
            void refetchRef.current.rows();
            return;
          }
          toast.error(e instanceof Error ? e.message : 'That did not go through. Try again.');
        },
      });
    },
    [markDecided, toast],
  );

  const label = detail ? `${detail.task.titleEn}, ${detail.dealerCode}` : '';
  const submittedAt = detail?.submission?.at ?? null;
  const isData = detail?.how === 'data' && !detail.submission;
  const decidable =
    !!detail && (detail.state === 'sent' || (detail.how === 'data' && detail.state !== 'excused'));

  const skip = React.useCallback(() => {
    if (!currentId) return;
    if (queue.length <= 1) {
      toast.info('This is the last one in the list. Nothing more to skip to.');
      return;
    }
    setSkipped((s) => withSkipped(s, currentId));
  }, [currentId, queue.length, toast]);

  const actions = React.useMemo<BarAction[]>(() => {
    if (!detail) return [];
    const skipAction: BarAction = {
      id: 'skip',
      label: 'Skip',
      icon: <SkipForward {...ICON} />,
      keys: ['arrowright'],
      keyHint: '→',
      onSelect: skip,
    };
    const excuseAction: BarAction = {
      id: 'excuse',
      label: 'Excuse',
      icon: <Ban {...ICON} />,
      keys: ['e'],
      keyHint: 'E',
      onSelect: () => openDialog('excuse'),
    };
    if (!decidable) return [{ ...skipAction, label: 'Next', primary: true }];
    if (isData) {
      return [
        {
          id: 'done',
          label: 'Mark done',
          icon: <Check {...ICON} />,
          keys: ['d'],
          keyHint: 'D',
          primary: true,
          onSelect: () => openDialog('done'),
          disabled: detail.state === 'done',
        },
        {
          id: 'not-done',
          label: 'Not done',
          icon: <X {...ICON} />,
          keys: ['n'],
          keyHint: 'N',
          onSelect: () => openDialog('not_done'),
        },
        excuseAction,
        skipAction,
      ];
    }
    return [
      {
        id: 'approve',
        label: 'Approve',
        icon: <Check {...ICON} />,
        keys: ['a'],
        keyHint: 'A',
        primary: true,
        onSelect: () =>
          decide(
            approve.mutate,
            { id: detail.id, submittedAt },
            detail.id,
            `Approved: ${label}`,
          ),
      },
      {
        id: 'ask',
        label: 'Ask again',
        icon: <RotateCcw {...ICON} />,
        keys: ['s'],
        keyHint: 'S',
        onSelect: () => openDialog('ask'),
      },
      {
        id: 'owner',
        label: 'Tell owner',
        icon: <UserRound {...ICON} />,
        keys: ['o'],
        keyHint: 'O',
        onSelect: () => openDialog('owner'),
        disabled: !detail.ownerOnApp,
        disabledReason: 'No owner of this outlet is on the app yet.',
      },
      excuseAction,
      skipAction,
    ];
  }, [detail, decidable, isData, skip, submittedAt, label, decide, approve.mutate, openDialog]);

  if (rowsQ.isLoading || (currentId && detailQ.isLoading && !detail)) {
    return (
      <div className="grid gap-4 md:grid-cols-[3fr_2fr]" aria-busy>
        <Skeleton className="h-72 w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (rowsQ.isError) {
    return (
      <Callout onRetry={() => void rowsQ.refetch()}>The checks could not be loaded.</Callout>
    );
  }

  if (!currentId && decided.size > 0) {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <p className="text-sm text-text-muted" aria-live="polite">All checked. Closing the run…</p>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!currentId) {
    return (
      <EmptyState
        icon={<Check width={28} height={28} strokeWidth={1.5} className="text-success" aria-hidden />}
        title="Nothing to check right now"
        description={`Nothing is waiting for you in ${title}.`}
        cta={<Button variant="secondary" onClick={onExit}>Back to Kavach</Button>}
      />
    );
  }

  if (detailQ.isError && !detail) {
    return (
      <Callout onRetry={() => void detailQ.refetch()}>This check could not be loaded.</Callout>
    );
  }
  if (!detail) return null;

  const progress = runProgress(decided.size, queue.length);

  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="min-w-0 text-base font-semibold text-text">{title}</h1>
        <div className="flex items-center gap-3 text-sm text-text-muted">
          <span aria-live="polite" className="tabular-nums">
            {progressWords(progress)}
          </span>
          <Button size="sm" variant="ghost" onClick={onExit}>
            Done for now
          </Button>
        </div>
      </div>

      {!decidable ? (
        <Callout intent="info" className="mb-3">
          This check is no longer waiting for you
          {detail.review ? `: ${detail.review.byName} decided it on ${formatDateTime(detail.review.at)}` : ''}.
        </Callout>
      ) : null}

      <div className="grid flex-1 gap-4 md:grid-cols-[3fr_2fr] md:items-start">
        <div className="min-w-0 md:sticky md:top-0 md:h-[calc(100dvh-14rem)] md:min-h-[24rem]">
          <CheckPhotos
            files={detail.submission?.files ?? []}
            label={label}
            onOpen={(f) => viewer.openFile(f, label)}
            className="md:h-full"
          />
          {detail.lastApproved ? (
            <LastAccepted
              last={detail.lastApproved}
              onOpen={() => viewer.openFile(detail.lastApproved!.files[0]!, `Last accepted, ${label}`)}
            />
          ) : null}
        </div>
        <CheckDetailColumn
          detail={detail}
          now={now}
          onOpenPhoto={(url, caption) => viewer.openImage(url, caption)}
        />
      </div>

      <KavachActionBar
        actions={actions}
        keysOn={dialog === null && !viewer.viewer}
        busy={busy}
        className="sticky bottom-0 z-10 -mx-[var(--app-gutter)] -mb-[calc(var(--app-gutter)+env(safe-area-inset-bottom))] mt-4"
      />

      <AskAgainDialog
        open={dialog === 'ask'}
        title={label}
        busy={sendBack.isPending}
        onClose={() => setDialog(null)}
        onSend={(reason, note) =>
          decide(
            sendBack.mutate,
            { id: detail.id, reason, note, submittedAt },
            detail.id,
            `Asked again: ${label}`,
          )
        }
      />
      <TellOwnerDialog
        open={dialog === 'owner'}
        title={label}
        hasPhoto={(detail.submission?.files.length ?? 0) > 0}
        busy={tellOwner.isPending}
        onClose={() => setDialog(null)}
        onSend={(note, withPhoto) =>
          decide(
            tellOwner.mutate,
            { id: detail.id, note, withPhoto, submittedAt },
            detail.id,
            `Owner told about: ${label}. It is still waiting for your decision.`,
            'skip',
          )
        }
      />
      <ExcuseDialog
        open={dialog === 'excuse'}
        title={label}
        busy={excuse.isPending}
        onClose={() => setDialog(null)}
        onSend={(reason) =>
          decide(excuse.mutate, { id: detail.id, reason, submittedAt }, detail.id, `Excused: ${label}`)
        }
      />
      <MarkDataDialog
        open={dialog === 'done' || dialog === 'not_done'}
        verdict={dialog === 'not_done' ? 'not_done' : 'done'}
        title={label}
        busy={markData.isPending}
        onClose={() => setDialog(null)}
        onSend={(note) =>
          decide(
            markData.mutate,
            { id: detail.id, verdict: dialog === 'not_done' ? 'not_done' : 'done', note },
            detail.id,
            dialog === 'not_done' ? `Marked not done: ${label}` : `Marked done: ${label}`,
          )
        }
      />
      {viewer.viewer}
    </div>
  );
}

function LastAccepted({
  last,
  onOpen,
}: {
  last: NonNullable<KavachCheckDetail['lastApproved']>;
  onOpen: () => void;
}) {
  const first = last.files[0];
  if (!first) return null;
  const isImage = !!first.url && first.contentType.startsWith('image/');
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-2 flex w-full items-center gap-3 rounded-md border border-border bg-surface p-2 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-surface-2 text-xs text-text-muted">
        {isImage ? (
          <img src={first.url} alt="" draggable={false} className="h-full w-full object-cover" />
        ) : (
          'PDF'
        )}
      </span>
      <span className="min-w-0 text-sm">
        <span className="block font-medium text-text">Last accepted</span>
        <span className="block text-text-muted">{last.periodLabel}. Tap to open.</span>
      </span>
    </button>
  );
}
