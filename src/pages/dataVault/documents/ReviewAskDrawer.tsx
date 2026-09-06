import {
  AlertCircle,
  BellRing,
  Check,
  ExternalLink,
  FileText,
  Phone,
  Undo2,
  XCircle,
  ZoomIn,
} from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  DownloadButton,
  Drawer,
  HowThisWorks,
  ImageLightbox,
  Label,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  useAcceptDocumentAsk,
  useDocumentAskDetailQuery,
  useDocumentAskFileUrl,
  useRejectDocumentAsk,
  useRemindDocumentAsk,
  useWithdrawDocumentAsk,
} from '@/hooks/api/useDocumentAsks';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatYmd } from '@/lib/format';
import { isNativeShell, requestNativeDownload } from '@/lib/nativeBridge';
import { dealerCodeLabel, documentAskAge } from '@dk/shared';

import type { DocumentRow } from './format';
import { StatusPip } from './StatusPip';

/**
 * One paper, and the decision on it.
 *
 * Modelled on `pages/kavach/VerifyTaskDrawer.tsx` — the same drawer, the same
 * photo-then-verdict order, the same "never a dead button" rule — because an
 * admin reviewing a register page and an admin verifying a Kavach task are the
 * same person doing the same kind of work, and two different shapes for it is
 * two things to learn.
 *
 * THE REASON FLOOR IS TEN CHARACTERS, WHERE KAVACH'S IS FOUR
 * ----------------------------------------------------------
 * That difference is in the backend schema and is deliberate: this string is
 * shown to the dealer VERBATIM and is the only thing telling them what to do
 * next. "no", "blur" and "wrong" are not instructions anybody can act on. The
 * placeholder here says so in as many words, because a reviewer who does not
 * know the dealer reads it writes for the file rather than for the person.
 *
 * NOTHING IS EVER DELETED, AND THE DRAWER SAYS SO
 * -----------------------------------------------
 * Sending a paper back does not clear it. The old submission moves to
 * `superseded[]` when the dealer sends again, so a rejected photograph is still
 * there — which is what makes this a compliance record rather than a promise
 * that can be edited after the fact. When a row carries earlier attempts the
 * drawer states how many, because "third time of asking" is the fact that
 * justifies picking up the phone.
 */

/** The floor the backend enforces. Repeated here so the button is never a 400. */
const MIN_REJECT_REASON = 10;

export interface ReviewAskDrawerProps {
  open: boolean;
  /** The row being worked. `null` while the drawer is closed. */
  row: DocumentRow | null;
  onClose: () => void;
  /** "Ask for it" on a row that has no ask yet — the pane owns the dialog. */
  onAskFor: (row: DocumentRow) => void;
}

export function ReviewAskDrawer({ open, row, onClose, onAskFor }: ReviewAskDrawerProps) {
  const toast = useToast();
  const wideEnoughToEmbed = useMediaQuery('(min-width: 768px)');

  const [reason, setReason] = React.useState('');
  const [sendBackOpen, setSendBackOpen] = React.useState(false);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [advice, setAdvice] = React.useState<string | null>(null);

  // Every field is per-row. Carrying a half-typed rejection from one dealer's
  // paper onto the next is the one mistake this screen could make that nobody
  // would notice until a dealer read somebody else's sentence.
  React.useEffect(() => {
    setReason('');
    setSendBackOpen(false);
    setLightboxOpen(false);
    setError(null);
    setAdvice(null);
  }, [row?.key]);

  // The estate's row is a projection — state, count, due date, send time — so it
  // carries neither MDG's note nor the dealer's nor the reject reason. The flat
  // list row already has all three, so the fetch only fires for the half of the
  // screen that needs it.
  const detailQ = useDocumentAskDetailQuery({
    askId: row?.askId,
    dealerId: row?.dealerId,
    kindCode: row?.kindCode,
    enabled: open && !!row?.askId && !row?.detail,
  });
  const ask = row?.detail ?? detailQ.data ?? null;

  const fileQ = useDocumentAskFileUrl(row?.askId, open && !!row?.hasFile);

  const accept = useAcceptDocumentAsk();
  const reject = useRejectDocumentAsk();
  const remind = useRemindDocumentAsk();
  const withdraw = useWithdrawDocumentAsk();
  const busy =
    accept.isPending || reject.isPending || remind.isPending || withdraw.isPending;

  function say(err: unknown, fallback: string): void {
    const message = err instanceof ApiError ? err.message : fallback;
    setError(message);
    toast.error(message);
  }

  async function handleAccept(): Promise<void> {
    if (!row?.askId) return;
    setError(null);
    try {
      await accept.mutateAsync(row.askId);
      toast.success(`Accepted from ${dealerCodeLabel(row.dealerCode)}`);
      onClose();
    } catch (err) {
      // The one refusal worth reading in full is the ETag conflict — "that photo
      // changed after it was sent" — which means the bytes behind a presigned PUT
      // were replaced after MDG looked. It is a conflict, not a bug, and the
      // server's own sentence says what to do.
      say(err, 'Could not accept it');
    }
  }

  async function handleReject(): Promise<void> {
    if (!row?.askId) return;
    if (reason.trim().length < MIN_REJECT_REASON) {
      setError(
        `Write what was wrong with it — at least ${MIN_REJECT_REASON} characters. The dealer reads this sentence exactly as you type it.`,
      );
      return;
    }
    setError(null);
    try {
      await reject.mutateAsync({ askId: row.askId, reason: reason.trim() });
      toast.success(`Sent back to ${dealerCodeLabel(row.dealerCode)}`);
      onClose();
    } catch (err) {
      say(err, 'Could not send it back');
    }
  }

  async function handleRemind(): Promise<void> {
    if (!row?.askId) return;
    setError(null);
    setAdvice(null);
    try {
      const result = await remind.mutateAsync(row.askId);
      toast.success(`Reminded ${dealerCodeLabel(row.dealerCode)}`);
      // Three requests that produced nothing is not a delivery problem, and a
      // fourth notification will not fix it. The server says so and the sentence
      // stays on screen rather than passing by in a toast.
      if (result.phoneInstead && result.advice) setAdvice(result.advice);
    } catch (err) {
      say(err, 'Could not send the reminder');
    }
  }

  async function handleWithdraw(): Promise<void> {
    if (!row?.askId) return;
    setError(null);
    try {
      await withdraw.mutateAsync({ askId: row.askId });
      toast.success('Withdrawn — the dealer is no longer being asked for it');
      onClose();
    } catch (err) {
      say(err, 'Could not withdraw it');
    }
  }

  /** Open a PDF the way the shell can actually open one. Same route as the invoice drawer. */
  async function openPdf(): Promise<void> {
    const urls = fileQ.data;
    if (!urls) return;
    if (isNativeShell()) {
      // The admin shell runs with `setSupportMultipleWindows={false}`, so
      // `window.open` is unreliable inside it; the shell's own handler saves the
      // file and hands it to whatever the phone uses for PDFs.
      const result = await requestNativeDownload({
        id: `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: urls.downloadUrl,
        filename: urls.filename,
        contentType: urls.contentType,
        kind: 'file',
      });
      if (result.ok) return;
      if (!result.timedOut) {
        toast.error(result.error || 'Could not open the document');
        return;
      }
    }
    window.open(urls.viewUrl, '_blank', 'noopener');
  }

  if (!row) return null;

  const age = documentAskAge(
    {
      waitingOn: row.waitingOn,
      ...(row.submittedAt ? { submittedAt: row.submittedAt } : {}),
      ...(row.askedAt ? { askedAt: row.askedAt } : {}),
      ...(row.periodDay ? { periodDay: row.periodDay } : {}),
    },
    Date.now(),
  );
  const isImage = fileQ.data?.contentType.startsWith('image/') ?? false;
  const supersededCount = ask?.superseded?.length ?? 0;
  const canReview = row.status === 'SENT';
  const canRemind = row.waitingOn === 'dealer' && !!row.askId;
  const canWithdraw =
    !!row.askId && (row.status === 'ASKED' || row.status === 'SENT' || row.status === 'REJECTED');

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width="lg"
        title={
          // `min-w-0` on the name: a flex item cannot shrink below its
          // content, so a long document name has to be allowed to break rather
          // than push the help button out of the header.
          <span className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-words">{row.document}</span>
            <HowThisWorks
              surface="admin-review-document-ask"
              label="Review a document"
              variant="icon"
            />
          </span>
        }
        description={`${dealerCodeLabel(row.dealerCode)} · ${row.periodLabel || 'No period'}`}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Close
            </Button>
            {canWithdraw ? (
              <Button variant="secondary" onClick={() => void handleWithdraw()} disabled={busy}>
                Withdraw
              </Button>
            ) : null}
            {canRemind ? (
              <Button
                variant="secondary"
                onClick={() => void handleRemind()}
                loading={remind.isPending}
                disabled={busy}
                leftIcon={<BellRing width={16} height={16} strokeWidth={1.75} />}
              >
                {row.askedCount > 0 ? 'Ask again' : 'Ask for it'}
              </Button>
            ) : null}
            {!row.askId ? (
              // Nothing to act on yet: this dealer has no row at all, so the only
              // move is to open one. The pane owns that dialog because it is the
              // same one the header's "Ask for a document" opens.
              <Button onClick={() => onAskFor(row)} disabled={busy}>
                Ask for it
              </Button>
            ) : null}
            {canReview ? (
              <Button
                onClick={() => void handleAccept()}
                loading={accept.isPending}
                disabled={busy}
                leftIcon={<Check width={16} height={16} strokeWidth={1.75} />}
              >
                Accept
              </Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPip status={row.status} late={row.late} />
            {row.askedCount > 0 ? (
              <Badge intent={row.askedCount >= 3 ? 'warning' : 'neutral'}>
                Asked {row.askedCount} time{row.askedCount === 1 ? '' : 's'}
              </Badge>
            ) : null}
            {age ? (
              <Badge intent="neutral">
                {age.basis === 'sent' ? 'Waiting on us' : 'Waiting'} {age.label.toLowerCase()}
              </Badge>
            ) : null}
            {row.dueOn ? (
              <span className="text-xs text-text-muted">Due {formatYmd(row.dueOn)}</span>
            ) : null}
          </div>

          {advice ? (
            <Callout intent="warning">
              <span className="flex items-start gap-1.5">
                <Phone width={13} height={13} strokeWidth={1.75} className="mt-px shrink-0" />
                {advice}
              </span>
            </Callout>
          ) : null}
          {error ? <Callout intent="warning">{error}</Callout> : null}

          {detailQ.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : ask?.note ? (
            <div className="rounded-md border border-border bg-surface-2 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                What MDG asked for
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-text">{ask.note}</p>
            </div>
          ) : null}

          {/* ── What the dealer sent ── */}
          {!row.hasFile ? (
            <div className="rounded-md border border-dashed border-border-strong p-3 text-sm text-text-muted">
              {row.status === 'NOT_SENT'
                ? 'Nothing has been asked for and nothing has come in.'
                : row.status === 'RECEIVED'
                  ? 'This period is already satisfied in the service’s own records — no separate request was ever made, so there is nothing here to review.'
                  : row.status === 'NOT_ON_SERVICE'
                    ? 'MDG does not run this service for this outlet, so this paper was never theirs to send.'
                    : 'Nothing has been sent yet.'}
            </div>
          ) : (
            <div className="rounded-md border border-info bg-surface-2 p-3">
              <p className="text-sm font-semibold text-text">
                {ask?.submission?.byName
                  ? `${ask.submission.byName} sent this`
                  : 'The dealer sent this'}
                <span className="ml-2 font-normal text-text-muted">
                  {formatDateTime(row.submittedAt)}
                </span>
              </p>
              {supersededCount > 0 ? (
                <p className="mt-1 text-xs text-text-muted">
                  {supersededCount} earlier attempt{supersededCount === 1 ? '' : 's'} {' '}
                  {supersededCount === 1 ? 'is' : 'are'} kept on the record — nothing here is
                  ever deleted.
                </p>
              ) : null}

              {ask?.submission?.note ? (
                <p className="mt-2 whitespace-pre-wrap rounded-sm border border-border bg-surface p-2 text-sm text-text">
                  {ask.submission.note}
                </p>
              ) : null}

              {fileQ.isLoading ? (
                <Skeleton className="mt-2 h-48 w-full" />
              ) : fileQ.isError ? (
                <Callout intent="warning" className="mt-2" onRetry={() => void fileQ.refetch()}>
                  {fileQ.error instanceof ApiError
                    ? fileQ.error.message
                    : 'The paper could not be opened.'}{' '}
                  Do not rule on this until you have seen it.
                </Callout>
              ) : fileQ.data && isImage ? (
                <>
                  {/* The lightbox is where this is readable at all: on a phone the
                      preview is ~288px tall, and 5mm of handwriting on an A4
                      register lands about 8px high. The way in has to be SAID,
                      because a hover cue never fires on touch. */}
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="mt-2 block w-full"
                    aria-label="Open the paper full size, where it can be zoomed"
                  >
                    <img
                      src={fileQ.data.viewUrl}
                      alt={`What ${dealerCodeLabel(row.dealerCode)} sent for ${row.document}`}
                      draggable={false}
                      className="max-h-72 w-full rounded-sm border border-border object-contain"
                    />
                  </button>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-text-muted md:hidden">
                    <ZoomIn width={14} height={14} strokeWidth={1.75} className="shrink-0" />
                    Tap the photo to open it full size, then pinch or double-tap to read the
                    writing.
                  </p>
                </>
              ) : fileQ.data ? (
                // A PDF. Never an iframe below md: no mobile engine renders one
                // (Android WebView shows a grey rectangle or starts a download),
                // and a CSS-hidden frame still pulls the whole file over mobile
                // data to render nothing. See `InvoicePdfDrawer` for the same
                // decision and the measurements behind it.
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-sm border border-border bg-surface p-3">
                  <FileText width={16} height={16} strokeWidth={1.75} className="text-text-muted" />
                  <span className="min-w-0 flex-1 break-all text-sm text-text">
                    {fileQ.data.filename}
                  </span>
                  {wideEnoughToEmbed ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<ExternalLink width={14} height={14} strokeWidth={1.75} />}
                        onClick={() => window.open(fileQ.data.viewUrl, '_blank', 'noopener')}
                      >
                        Open
                      </Button>
                      <DownloadButton
                        variant="ghost"
                        size="sm"
                        url={fileQ.data.downloadUrl}
                        filename={fileQ.data.filename}
                        label="Save"
                      />
                    </>
                  ) : (
                    <Button size="sm" onClick={() => void openPdf()}>
                      Open PDF
                    </Button>
                  )}
                </div>
              ) : null}

              {row.status === 'REJECTED' && ask?.rejectReason ? (
                <p className="mt-2 text-xs text-danger">
                  Already sent back
                  {ask.reviewedAt ? ` on ${formatDateTime(ask.reviewedAt)}` : ''}: “
                  {ask.rejectReason}”
                </p>
              ) : null}
              {row.status === 'ACCEPTED' && ask ? (
                <p className="mt-2 text-xs text-success">
                  {/*
                    THE ABSENCE OF A NAME IS THE SIGNAL, and it is deliberate on
                    the server: `services/documents/settle.ts` writes
                    `reviewedByName: null` for a machine settlement with the
                    comment "there is no person to name, and a name here would
                    print on a screen as though there were one". So a named
                    acceptance means somebody at MDG read the page and an unnamed
                    one means nothing but the service's own records did — and
                    collapsing the two would publish, on every automatic
                    acceptance, a claim MDG never made (ADR 0011).
                  */}
                  {ask.reviewedByName
                    ? `Accepted by ${ask.reviewedByName}${
                        ask.reviewedAt ? ` on ${formatDateTime(ask.reviewedAt)}` : ''
                      }.`
                    : 'Settled automatically by the service’s own records — nobody at MDG has looked at this.'}
                </p>
              ) : null}

              {/* ── Send it back ── */}
              {canReview ? (
                sendBackOpen ? (
                  <div className="mt-3">
                    <Label htmlFor="ask-send-back" required>
                      Why this is going back
                    </Label>
                    <Textarea
                      id="ask-send-back"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="The dealer reads this word for word — e.g. The date on the page is 1 September, not 2 September. Please send yesterday’s page."
                      rows={3}
                      maxLength={500}
                    />
                    <p className="mt-1 text-xs text-text-muted">
                      Shown to the dealer exactly as written, and it is the only thing telling
                      them what to do next. At least {MIN_REJECT_REASON} characters.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        loading={reject.isPending}
                        disabled={busy}
                        onClick={() => void handleReject()}
                        leftIcon={<Undo2 width={14} height={14} strokeWidth={1.75} />}
                      >
                        Send back
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setSendBackOpen(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    disabled={busy}
                    onClick={() => setSendBackOpen(true)}
                    leftIcon={<XCircle width={14} height={14} strokeWidth={1.75} />}
                  >
                    Send back with a reason
                  </Button>
                )
              ) : null}
            </div>
          )}

          {detailQ.isError ? (
            <Callout intent="warning" onRetry={() => void detailQ.refetch()}>
              <span className="flex items-start gap-1.5">
                <AlertCircle width={13} height={13} strokeWidth={1.75} className="mt-px shrink-0" />
                Could not load the rest of this request — the note MDG sent and any earlier
                attempts are missing from this view.
              </span>
            </Callout>
          ) : null}
        </div>
      </Drawer>

      {fileQ.data && isImage ? (
        <ImageLightbox
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          src={fileQ.data.viewUrl}
          alt={`What ${dealerCodeLabel(row.dealerCode)} sent for ${row.document}`}
          title={`${dealerCodeLabel(row.dealerCode)} · ${row.document}`}
          downloadUrl={fileQ.data.downloadUrl}
        />
      ) : null}
    </>
  );
}
