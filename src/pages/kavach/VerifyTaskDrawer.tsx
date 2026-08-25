import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Camera,
  Check,
  ChevronRight,
  Cpu,
  FileUp,
  MessagesSquare,
  Paperclip,
  PenLine,
  Send,
  ShieldCheck,
  Undo2,
  UserCheck,
  X,
} from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  Drawer,
  ImageLightbox,
  Input,
  Label,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  kavachDaysPendingChip,
  useKavachItemQuery,
  useRejectKavachEvidence,
  useVerifyKavachItem,
} from '@/hooks/api/useKavachQueue';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { compressImage } from '@/lib/compressImage';
import { downloadAttachment } from '@/lib/downloadAttachment';
import { formatDateTime, formatYmd, istTodayYmd, isYmd } from '@/lib/format';
import {
  EVIDENCE_HINT,
  EVIDENCE_LABEL,
  ITEM_STATUS_LABEL,
  itemStatusIntent,
  VERIFICATION_LABEL,
} from '@/lib/kavach';
import { MAX_ATTACHMENT_BYTES, resolveFileType } from '@/lib/uploadAttachment';
import {
  dealerCodeLabel,
  type Attachment,
  type KavachEvidenceMode,
  type KavachVerificationMode,
  type KavachWorkQueueRow,
  type PresignUploadResponse,
} from '@dk/shared';

import { RequestEvidenceDialog } from './RequestEvidenceDialog';

/**
 * The mark-done interaction, built for a pass rather than for a visit.
 *
 * An admin faces roughly 10.6 verifications per dealer per day — 85 across eight
 * dealers, 530 across fifty. Every affordance here exists to keep the cost per
 * task down: the drawer never closes between rows, the date defaults to today,
 * ⌘/Ctrl+Enter saves and advances, and the one decision that cannot be skipped —
 * closing something without the evidence its definition demands — is a written
 * reason, not a dead button.
 */

/**
 * The icon that stands for each mode, shared with the queue list so one evidence
 * mode never wears two different marks. Kept here rather than in `lib/kavach.ts`
 * because that module is deliberately JSX- and component-free — words and
 * intents only — and these are React components.
 */
export const EVIDENCE_ICON: Record<KavachEvidenceMode, typeof Camera> = {
  NONE: Check,
  PHOTO: Camera,
  NOTE: PenLine,
  PHOTO_OR_NOTE: Paperclip,
};

export const VERIFICATION_ICON: Record<KavachVerificationMode, typeof Camera> = {
  ADMIN: UserCheck,
  AUTOMATION: Cpu,
  DEALER_EVIDENCE_THEN_ADMIN: MessagesSquare,
};

/** The written reason the server demands before it will close without evidence. */
const MIN_REASON_CHARS = 4;

/**
 * A viewable URL for a stored image.
 *
 * Signed and short-lived, so it is fetched per attachment and re-fetched rather
 * than cached long: a URL held across a lunch break renders as a broken image,
 * and a broken image on this screen looks exactly like a dealer who sent
 * nothing.
 */
function useInlineImageUrl(attachment: Attachment | undefined) {
  return useQuery({
    queryKey: ['upload-inline-url', attachment?.storageKey],
    queryFn: () =>
      api.get<{ url: string }>('/uploads/download-url', {
        key: attachment?.storageKey ?? '',
      }),
    enabled: !!attachment && attachment.kind === 'image',
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Put the admin's own proof photo in object storage and return the attachment
 * the verify call carries.
 *
 * The presign scope is `staff` — the same dealer-scoped, dealer-private prefix
 * the Staff Points hardcopy uses. Kavach has no scope of its own yet, and of the
 * four that exist it is the only one that is BOTH access-controlled to this
 * dealer and readable back through `/uploads/download-url`: `tt-density` keys
 * are refused by the download route, so a proof filed there could never be
 * looked at again, and `avatar` keys are readable by any signed-in account at
 * all. The cost is that the egress audit line calls this a staff hardcopy; the
 * alternative was a compliance photograph nobody could reopen.
 */
async function uploadProof(file: File, dealerId: string): Promise<Attachment> {
  const resolved = resolveFileType(file, { assumeImage: true });
  let upload = file;
  let contentType = resolved.contentType;
  // Downscale before the presign so the presigned size/type always describe what
  // is actually PUT, and so the dealer re-opening this proof on 2G is not made
  // to pull a 12 MB camera JPEG.
  const compressed = await compressImage(file, { contentType });
  if (compressed) {
    upload = compressed;
    contentType = compressed.type || contentType;
  }
  const filename = upload.name || 'kavach-proof.jpg';

  const presign = await api.post<PresignUploadResponse>('/uploads/sign', {
    filename,
    contentType,
    size: upload.size,
    scope: 'kavach',
    dealerId,
  });
  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: upload,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);

  return {
    storageKey: presign.storageKey,
    filename,
    contentType,
    size: upload.size,
    kind: 'image',
  };
}

function evidenceSatisfied(
  mode: KavachEvidenceMode,
  hasPhoto: boolean,
  hasNote: boolean,
): boolean {
  switch (mode) {
    case 'NONE':
      return true;
    case 'PHOTO':
      return hasPhoto;
    case 'NOTE':
      return hasNote;
    case 'PHOTO_OR_NOTE':
      return hasPhoto || hasNote;
    default:
      return true;
  }
}

export type VerifyOutcome = 'verified' | 'sent-back' | 'asked';

export interface VerifyTaskDrawerProps {
  open: boolean;
  /** The row being worked. `null` while the drawer is closed. */
  row: KavachWorkQueueRow | null;
  /** 1-based position in the queue as displayed, for the "3 of 51" line. */
  position?: { index: number; total: number };
  /** True when there is another row after this one in the displayed order. */
  hasNext: boolean;
  /** Advance to that row. The drawer stays open. */
  onNext: () => void;
  onClose: () => void;
  /** Fired after every write so the list can mark the row handled in this pass. */
  onHandled: (itemId: string, outcome: VerifyOutcome) => void;
}

export function VerifyTaskDrawer({
  open,
  row,
  position,
  hasNext,
  onNext,
  onClose,
  onHandled,
}: VerifyTaskDrawerProps) {
  const toast = useToast();
  const today = istTodayYmd();

  const [doneOn, setDoneOn] = React.useState(today);
  const [note, setNote] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [overrideOpen, setOverrideOpen] = React.useState(false);
  const [overrideReason, setOverrideReason] = React.useState('');
  const [sendBackOpen, setSendBackOpen] = React.useState(false);
  const [sendBackReason, setSendBackReason] = React.useState('');
  const [askOpen, setAskOpen] = React.useState(false);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const overrideRef = React.useRef<HTMLTextAreaElement>(null);

  const itemQ = useKavachItemQuery(row?.itemId, open);
  const verify = useVerifyKavachItem();
  const reject = useRejectKavachEvidence();

  const item = itemQ.data;
  const submission = item?.request.submission;
  const submittedProof = submission?.proof;
  const proofUrlQ = useInlineImageUrl(submittedProof);

  // Every field is per-row. Carrying a note or a photo from one dealer's task to
  // the next is the one mistake this screen could make that nobody would notice.
  React.useEffect(() => {
    setDoneOn(istTodayYmd());
    setNote('');
    setFile(null);
    setOverrideOpen(false);
    setOverrideReason('');
    setSendBackOpen(false);
    setSendBackReason('');
    setLightboxOpen(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [row?.itemId]);

  const evidenceMode: KavachEvidenceMode = row?.evidence ?? 'NONE';
  const wantsPhoto = evidenceMode === 'PHOTO' || evidenceMode === 'PHOTO_OR_NOTE';
  const satisfied = evidenceSatisfied(
    evidenceMode,
    !!file,
    note.trim().length > 0,
  );
  const usingOverride = !satisfied && overrideReason.trim().length > 0;

  function pickFile(list: FileList | null) {
    setError(null);
    const picked = list?.item(0) ?? null;
    if (!picked) return;
    if (picked.size > MAX_ATTACHMENT_BYTES) {
      setError(`${picked.name} exceeds the 25 MB limit`);
      return;
    }
    // Not `picked.type`: an Android WebView camera capture hands back an empty
    // MIME, and refusing on that tells an admin their photograph is not one.
    if (resolveFileType(picked, { assumeImage: false }).kind !== 'image') {
      setError('The proof must be a photo');
      return;
    }
    setFile(picked);
  }

  async function handleSave(advance: boolean) {
    if (!row || submitting) return;
    setError(null);

    if (!isYmd(doneOn) || doneOn > today) {
      setError('The date done must be a real day, and not in the future.');
      return;
    }
    // Never a failed button: when the definition wants evidence and there is
    // none, the screen opens the on-the-record path instead of refusing.
    if (!satisfied && overrideReason.trim().length < MIN_REASON_CHARS) {
      setOverrideOpen(true);
      window.setTimeout(() => overrideRef.current?.focus(), 0);
      setError(
        overrideReason.trim().length === 0
          ? null
          : `Say why in at least ${MIN_REASON_CHARS} characters.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const proof = file ? await uploadProof(file, row.dealerId) : undefined;
      await verify.mutateAsync({
        itemId: row.itemId,
        dealerId: row.dealerId,
        body: {
          doneOn,
          ...(proof ? { proof } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(usingOverride
            ? { overrideEvidenceReason: overrideReason.trim() }
            : {}),
        },
      });
      toast.success(
        `${row.labelEn} verified for ${dealerCodeLabel(row.dealerCode)}`,
      );
      onHandled(row.itemId, 'verified');
      if (advance && hasNext) onNext();
      else onClose();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not record the verification';
      // The drawer stays open with the photo still staged: making an admin find
      // the file again is how a retry turns into an abandoned task.
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendBack() {
    if (!row || submitting) return;
    if (sendBackReason.trim().length < MIN_REASON_CHARS) {
      setError(
        `Write what was missing — at least ${MIN_REASON_CHARS} characters. The dealer reads it as written.`,
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await reject.mutateAsync({
        itemId: row.itemId,
        dealerId: row.dealerId,
        body: { reason: sendBackReason.trim() },
      });
      toast.success(`Sent back to ${dealerCodeLabel(row.dealerCode)}`);
      onHandled(row.itemId, 'sent-back');
      if (hasNext) onNext();
      else onClose();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not send it back';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  // The shortcut must always run the CURRENT save — the one that knows about the
  // note typed a keystroke ago. Held in a ref so the listener below is installed
  // once per open row instead of being torn down and rebuilt on every keypress.
  const saveRef = React.useRef(handleSave);
  React.useEffect(() => {
    saveRef.current = handleSave;
  });

  // ⌘/Ctrl+Enter is the pass: it saves and moves to the next row without the
  // hand ever leaving the keyboard. Suppressed while a dialog sits on top, so
  // the shortcut can never fire against a row the admin is not looking at.
  React.useEffect(() => {
    if (!open || askOpen || lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void saveRef.current(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, askOpen, lightboxOpen]);

  if (!row) return null;

  const pending = kavachDaysPendingChip(row);
  const EvidenceIcon = EVIDENCE_ICON[evidenceMode];
  const VerificationIcon = VERIFICATION_ICON[row.verification];
  // A submission survives on the item after its cycle closes, so showing it
  // whenever it exists would present last week's photo as this morning's reply.
  const requestState = item?.request.state ?? row.requestState;
  const hasSubmission =
    !!submission && (requestState === 'SUBMITTED' || requestState === 'REJECTED');

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width="lg"
        title={row.labelEn}
        description={
          position
            ? `${dealerCodeLabel(row.dealerCode)} · ${position.index} of ${position.total} in view`
            : dealerCodeLabel(row.dealerCode)
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Close
            </Button>
            <Button
              variant={hasNext ? 'secondary' : 'primary'}
              onClick={() => void handleSave(false)}
              disabled={submitting}
              loading={submitting && !hasNext}
              leftIcon={<Check width={16} height={16} strokeWidth={1.75} />}
            >
              Save
            </Button>
            {hasNext ? (
              <Button
                onClick={() => void handleSave(true)}
                loading={submitting}
                rightIcon={
                  <ChevronRight width={16} height={16} strokeWidth={1.75} />
                }
              >
                Save &amp; next
              </Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge intent={itemStatusIntent(row.status)}>
              {ITEM_STATUS_LABEL[row.status]}
            </Badge>
            <Badge intent={pending.intent}>{pending.text}</Badge>
            <Badge intent="neutral">{row.points} pts</Badge>
            <span className="font-mono text-xs text-text-subtle">
              {row.code}
            </span>
          </div>

          <p className="text-sm text-text-muted">{row.labelHi}</p>

          <div className="grid gap-2 rounded-md border border-border bg-surface-2 p-3 text-sm sm:grid-cols-2">
            <span className="flex items-center gap-1.5 text-text">
              <VerificationIcon
                width={14}
                height={14}
                strokeWidth={1.75}
                className="shrink-0 text-text-muted"
              />
              {VERIFICATION_LABEL[row.verification]}
            </span>
            <span className="flex items-center gap-1.5 text-text">
              <EvidenceIcon
                width={14}
                height={14}
                strokeWidth={1.75}
                className="shrink-0 text-text-muted"
              />
              {EVIDENCE_LABEL[evidenceMode]}
            </span>
            <span className="text-xs text-text-muted sm:col-span-2">
              {EVIDENCE_HINT[evidenceMode]}
            </span>
          </div>

          {item?.notesEn ? (
            <p className="text-xs text-text-muted">{item.notesEn}</p>
          ) : null}

          {/* ── What the dealer sent, if anything ── */}
          {itemQ.isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : itemQ.isError ? (
            <Callout intent="warning" onRetry={() => void itemQ.refetch()}>
              Could not load what the dealer has sent for this task.
            </Callout>
          ) : hasSubmission ? (
            <div className="rounded-md border border-info bg-surface-2 p-3">
              <p className="text-sm font-semibold text-text">
                The dealer sent this
                <span className="ml-2 font-normal text-text-muted">
                  {formatDateTime(submission?.at)}
                </span>
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Evidence for your decision. It has not verified anything by
                itself.
              </p>

              {requestState === 'REJECTED' && item?.request.rejectReason ? (
                <p className="mt-2 text-xs text-danger">
                  Already sent back
                  {item.request.reviewedAt
                    ? ` on ${formatDateTime(item.request.reviewedAt)}`
                    : ''}
                  : “{item.request.rejectReason}”
                </p>
              ) : null}

              {submission?.note ? (
                <p className="mt-2 whitespace-pre-wrap rounded-sm border border-border bg-surface p-2 text-sm text-text">
                  {submission.note}
                </p>
              ) : null}

              {submittedProof ? (
                proofUrlQ.isLoading ? (
                  <Skeleton className="mt-2 h-48 w-full" />
                ) : proofUrlQ.data ? (
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="mt-2 block w-full"
                    aria-label="Open the photo full size"
                  >
                    <img
                      src={proofUrlQ.data.url}
                      alt={`Evidence for ${row.labelEn}`}
                      draggable={false}
                      className="max-h-72 w-full rounded-sm border border-border object-contain"
                    />
                  </button>
                ) : (
                  <Callout
                    intent="warning"
                    className="mt-2"
                    onRetry={() => void proofUrlQ.refetch()}
                  >
                    The photo could not be opened. Do not rule on this until you
                    have seen it.
                  </Callout>
                )
              ) : null}

              {!submission?.note && !submittedProof ? (
                <p className="mt-2 text-sm text-text">
                  They only told us it is done — no photo, no note.
                </p>
              ) : null}

              {sendBackOpen ? (
                <div className="mt-3">
                  <Label htmlFor="kavach-send-back" required>
                    Why this is going back
                  </Label>
                  <Textarea
                    id="kavach-send-back"
                    value={sendBackReason}
                    onChange={(e) => setSendBackReason(e.target.value)}
                    placeholder="e.g. The board in the photo is last week's — please send today's."
                    rows={2}
                    maxLength={500}
                  />
                  <p className="mt-1 text-xs text-text-muted">
                    The dealer sees this sentence word for word.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      loading={submitting}
                      onClick={() => void handleSendBack()}
                      leftIcon={
                        <Undo2 width={14} height={14} strokeWidth={1.75} />
                      }
                    >
                      Send back
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={submitting}
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
                  disabled={submitting}
                  onClick={() => setSendBackOpen(true)}
                  leftIcon={<Undo2 width={14} height={14} strokeWidth={1.75} />}
                >
                  Send back with a reason
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border-strong p-3">
              <span className="text-sm text-text-muted">
                {row.requestState === 'ASKED'
                  ? 'We have asked and are still waiting.'
                  : row.requestState === 'REJECTED'
                    ? 'Sent back — waiting for them to send again.'
                    : 'Nothing has been asked for or sent.'}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={submitting}
                onClick={() => setAskOpen(true)}
                leftIcon={<Send width={14} height={14} strokeWidth={1.75} />}
              >
                Ask the dealer
              </Button>
            </div>
          )}

          {/* ── The decision ── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="kavach-done-on" required>
                Date done
              </Label>
              <Input
                id="kavach-done-on"
                type="date"
                value={doneOn}
                max={today}
                onChange={(e) => setDoneOn(e.target.value)}
              />
              <p className="mt-1 text-xs text-text-subtle">
                The day the work happened, not the day you are recording it.
              </p>
            </div>
            {row.lastVerifiedAt ? (
              <div className="text-sm">
                <Label>Last verified</Label>
                <p className="text-text-muted">
                  {formatDateTime(row.lastVerifiedAt)}
                </p>
                {item?.doneOn ? (
                  <p className="text-xs text-text-subtle">
                    for {formatYmd(item.doneOn)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            <Label
              htmlFor="kavach-verify-note"
              required={evidenceMode === 'NOTE'}
              hint={evidenceMode === 'NOTE' ? undefined : 'optional'}
            >
              Your note
            </Label>
            <Textarea
              id="kavach-verify-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What you saw, and how you know."
              rows={2}
              maxLength={1000}
            />
          </div>

          {wantsPhoto ? (
            <div>
              <Label required={evidenceMode === 'PHOTO'}>Your photo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => pickFile(e.target.files)}
              />
              {file ? (
                <div className="flex items-center justify-between gap-2 rounded-sm border border-border-strong bg-surface px-3 py-2">
                  <span className="inline-flex min-w-0 items-center gap-2 text-sm text-text">
                    <Paperclip
                      width={14}
                      height={14}
                      strokeWidth={1.75}
                      className="shrink-0 text-text-muted"
                    />
                    <span className="truncate">{file.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    disabled={submitting}
                    aria-label="Remove photo"
                    className="rounded-sm p-2 text-text-muted hover:bg-surface-2 hover:text-text"
                  >
                    <X width={14} height={14} strokeWidth={1.75} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-border-strong bg-surface px-3 py-5 text-sm text-text-muted',
                    'hover:bg-surface-2 hover:text-text',
                  )}
                >
                  <FileUp width={16} height={16} strokeWidth={1.75} />
                  Choose a photo (max 25 MB)
                </button>
              )}
            </div>
          ) : null}

          {/* ── Closing without what the definition demands ── */}
          {!satisfied ? (
            overrideOpen ? (
              <div className="rounded-md border border-warning bg-surface-2 p-3">
                <Label htmlFor="kavach-override" required>
                  Closing without the evidence — why
                </Label>
                <Textarea
                  ref={overrideRef}
                  id="kavach-override"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Verified in person during the 14:00 visit; the camera would not focus."
                  rows={2}
                  maxLength={500}
                />
                <p className="mt-1 text-xs text-text-muted">
                  Printed in this task&apos;s history and written to the audit
                  trail with your name on it.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOverrideOpen(true);
                  window.setTimeout(() => overrideRef.current?.focus(), 0);
                }}
                className="text-sm text-text-muted underline underline-offset-2 hover:text-text"
              >
                Close this without the {evidenceMode === 'PHOTO' ? 'photo' : 'evidence'}
              </button>
            )
          ) : null}

          {/* Permanent, undismissable: an admin must never be able to think they
              are recording the dealer's word rather than their own. */}
          <div className="flex items-start gap-2 rounded-md border border-border bg-surface-2 p-3">
            <ShieldCheck
              width={16}
              height={16}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-text-muted"
            />
            <p className="text-sm text-text">
              This is recorded as{' '}
              <strong className="font-semibold">verified by you</strong>, an MDG
              admin — never by the dealer. Whatever they sent is evidence you are
              ruling on.
            </p>
          </div>

          {error ? (
            <p
              className="flex items-start gap-1.5 text-xs text-danger"
              role="alert"
            >
              <AlertCircle
                width={14}
                height={14}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0"
              />
              <span>{error}</span>
            </p>
          ) : null}

          <p className="hidden text-xs text-text-subtle md:block">
            Press ⌘/Ctrl + Enter to save and move to the next row.
          </p>
        </div>
      </Drawer>

      {submittedProof && proofUrlQ.data ? (
        <ImageLightbox
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          src={proofUrlQ.data.url}
          alt={`Evidence for ${row.labelEn}`}
          title={`${row.labelEn} — ${dealerCodeLabel(row.dealerCode)}`}
          onDownload={() => downloadAttachment(submittedProof).then(() => undefined)}
        />
      ) : null}

      <RequestEvidenceDialog
        open={askOpen}
        onClose={() => setAskOpen(false)}
        onSent={() => onHandled(row.itemId, 'asked')}
        row={row}
      />
    </>
  );
}
