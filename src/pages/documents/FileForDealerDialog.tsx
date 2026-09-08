import { FileUp, Paperclip, X } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  HowThisWorks,
  IconButton,
  Input,
  Label,
  MIN_SELECTABLE_YMD,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  useCreateDocumentAsk,
  useDocumentAskRowsQuery,
  useFileDocumentForDealer,
} from '@/hooks/api/useDocumentAsks';
import { useDocumentKindCatalog } from '@/hooks/api/useDocumentKinds';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { compressImage } from '@/lib/compressImage';
import { istTodayYmd, isYmd } from '@/lib/format';
import { resolveFileType } from '@/lib/uploadAttachment';
import {
  addIsoMonths,
  dealerCodeLabel,
  dealerProfileDateLabel,
  documentValidityLabel,
  DOCUMENT_PERIOD_SLUG_MAX,
  isIsoDay,
  type PresignUploadResponse,
} from '@dk/shared';
import {
  DOCUMENT_ASK_MAX_BYTES,
  DOCUMENT_ASK_MIME_TYPES,
  DOCUMENT_VALIDITY_MAX_DAY,
} from '@dk/shared/schemas';

import { daysFromToday } from './format';

/**
 * MDG ALREADY HAS THE PAPER — filing it for a dealer who never sent one.
 *
 * Modelled on `dealers/vault/ttDensity/UploadDayPhotoDialog.tsx`, which is this
 * app's precedent for an admin uploading on a dealer's behalf: hidden file
 * input, a dashed choose-a-file button, a chip with an X to clear, then shrink →
 * presign → PUT → save. Four things here are different and each is a real rule.
 *
 * THE ASK HAS TO EXIST BEFORE THE FILE DOES. An upload is stored under
 * `ask/<dealerId>/<askId>/`, so there is nowhere to put a paper until the row is
 * there — which is exactly how a dealer volunteering a document works, and why
 * `volunteerDocumentAskSchema` carries no attachment either. So the sequence is
 * create-or-reuse the ask, then presign, then PUT, then `file-for-dealer`.
 *
 * A FAILED UPLOAD MUST NOT MINT A SECOND ASK. The created row is held in a ref
 * for the life of one attempt, so pressing the button again after a dropped PUT
 * reuses it. Without that, three failed uploads on a forecourt connection leave
 * three requests on the dealer's phone for one certificate. The ref is cleared
 * whenever the dealer, the kind, the period or the label changes, so a reused id
 * can never belong to a different paper than the one on screen.
 *
 * AN OPEN REQUEST IS ANSWERED, NOT DUPLICATED. `POST /v1/asks` refuses an admin
 * asking twice — "already has an open ask for this. Remind them instead." — so
 * the dialog looks first and files against the request that is already open,
 * which is the common case: MDG asked, nothing came, MDG got the paper another
 * way. Only a FREEFORM kind is never reused, because its period key carries a
 * slug of the words asked for and an open "other document" request is a request
 * for a different paper entirely.
 *
 * AND WHEN IT DOES OPEN ONE, IT OPENS IT SILENTLY. `silent: true` suppresses the
 * "MDG needs a paper from you" push while still writing the row, the audit trail
 * and the socket event — so a dealer is not buzzed about a certificate that was
 * already on file before their phone finished ringing. The screen no longer has
 * to warn anybody about that, which is why there is no warning here to read.
 *
 * THE DATE IS CONFIRMED BY A PERSON, NEVER COMPUTED BEHIND ONE. A kind's
 * `validityMonths` prefills the box so nobody has to count three years forward
 * in their head, and while the prefilled value is still untouched the submit is
 * gated on an explicit tick. The date that governs is the one printed on the
 * certificate: it decides when the dealer is chased and, where the kind names a
 * profile field, what the outlet Info tab says.
 */

export interface FileForDealerDialogProps {
  open: boolean;
  onClose: () => void;
  dealerId: string;
  dealerCode: string;
  /** Pre-select a kind, when the dialog was opened from a row that names one. */
  initialKindCode?: string;
}

/** The one MIME the shared resolver does not cover, because it only ever met images. */
function contentTypeOf(file: File): { kind: 'image' | 'file'; contentType: string } {
  const resolved = resolveFileType(file, { assumeImage: false });
  if (resolved.kind === 'image') return { kind: 'image', contentType: resolved.contentType };
  // An Android System WebView picker hands back a `File` whose `.type` is the
  // empty string, and `resolveFileType`'s extension table is deliberately
  // narrowed to the image cases the admin picks. A documents upload is the first
  // caller that also takes a scan, so the one missing extension is filled in
  // here rather than by widening a helper four other screens depend on.
  if (
    resolved.contentType === 'application/octet-stream' &&
    file.name.toLowerCase().endsWith('.pdf')
  ) {
    return { kind: 'file', contentType: 'application/pdf' };
  }
  return { kind: 'file', contentType: resolved.contentType };
}

export function FileForDealerDialog({
  open,
  onClose,
  dealerId,
  dealerCode,
  initialKindCode,
}: FileForDealerDialogProps) {
  const toast = useToast();
  const today = istTodayYmd();
  const { kinds, isLoading: kindsLoading, isFallback } = useDocumentKindCatalog();

  const create = useCreateDocumentAsk();
  const file4dealer = useFileDocumentForDealer();

  const [kindCode, setKindCode] = React.useState(initialKindCode ?? '');
  const [date, setDate] = React.useState(today);
  const [label, setLabel] = React.useState('');
  const [note, setNote] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [validUntil, setValidUntil] = React.useState('');
  const [confirmedDate, setConfirmedDate] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  /** The ask created by THIS attempt, so a retry does not open a second one. */
  const createdAskRef = React.useRef<string | null>(null);

  const kind = kinds.find((k) => k.code === kindCode);
  const needsLabel = kind?.freeform ?? false;
  const tracksValidity = kind?.tracksValidity ?? false;

  /** The BASE period key. The server composes the freeform `:<slug>` from `label`. */
  const periodKey = React.useMemo(() => {
    if (!kind) return '';
    switch (kind.periodKind) {
      case 'DAY':
        return date;
      case 'MONTH':
        return date.slice(0, 7);
      case 'YEAR':
        return date.slice(0, 4);
      case 'NONE':
      default:
        return '';
    }
  }, [kind, date]);

  /** What `validityMonths` would suggest, or `''` when the kind names no term. */
  const prefill =
    tracksValidity && kind?.validityMonths ? addIsoMonths(today, kind.validityMonths) : '';

  // Re-seed on every open. A dialog that remembered the last paper would file a
  // second outlet's certificate against the wrong kind on the next open — the
  // mistake nobody notices until a reminder fires about a paper that does not
  // exist.
  React.useEffect(() => {
    if (!open) return;
    setKindCode(initialKindCode ?? '');
    setDate(today);
    setLabel('');
    setNote('');
    setFile(null);
    setValidUntil('');
    setConfirmedDate(false);
    setError(null);
    setSubmitting(false);
    createdAskRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [open, initialKindCode, today]);

  // The prefill follows the kind, and only ever fills a box the operator has not
  // touched: re-seeding a date somebody has already corrected would put the
  // catalog's guess back over what they read off the paper. `open` is in the
  // deps as well, so reopening the dialog on the same kind re-fills the box the
  // reset above just emptied — the prefill string is identical, so nothing else
  // would tell this effect to run.
  React.useEffect(() => {
    setValidUntil((prev) => (prev === '' ? prefill : prev));
    setConfirmedDate(false);
  }, [prefill, open]);

  // Changing what is being filed invalidates any ask this attempt already
  // opened — otherwise a retry would attach a Fire NOC to a request for an
  // electricity bill.
  React.useEffect(() => {
    createdAskRef.current = null;
  }, [dealerId, kindCode, periodKey, label]);

  /**
   * The dealer's existing requests of this kind, so an open one is ANSWERED
   * rather than duplicated.
   *
   * Only fetched while the dialog is open and a kind is chosen. `limit: 50` is
   * one indexed query on `(dealerId, kindCode)` and covers every row a single
   * outlet has of one paper by a wide margin.
   */
  const existingQ = useDocumentAskRowsQuery(
    { dealerId, kindCode, limit: 50 },
    open && Boolean(kindCode),
  );
  const reusableAsk = React.useMemo(() => {
    if (!kind || kind.freeform) return null;
    const rows = (existingQ.data?.pages ?? []).flatMap((p) => p.rows);
    return (
      rows.find(
        (r) =>
          r.periodKey === periodKey && (r.state === 'ASKED' || r.state === 'REJECTED'),
      ) ?? null
    );
  }, [existingQ.data, kind, periodKey]);

  /** A row already waiting on MDG belongs in the review drawer, not here. */
  const alreadySent = React.useMemo(() => {
    if (!kind || kind.freeform) return null;
    const rows = (existingQ.data?.pages ?? []).flatMap((p) => p.rows);
    return rows.find((r) => r.periodKey === periodKey && r.state === 'SENT') ?? null;
  }, [existingQ.data, kind, periodKey]);

  function pickFile(list: FileList | null): void {
    setError(null);
    const f = list?.item(0) ?? null;
    // Cleared straight away, always: choosing the SAME file twice fires no
    // change event otherwise, which is exactly what somebody does after a
    // blurred first try.
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!f) return;
    if (f.size > DOCUMENT_ASK_MAX_BYTES) {
      setError(
        `${f.name} is larger than ${Math.round(
          DOCUMENT_ASK_MAX_BYTES / (1024 * 1024),
        )} MB. Past that an upload from a forecourt connection does not finish — it fails slowly, twice, before anybody asks why.`,
      );
      return;
    }
    const resolved = contentTypeOf(f);
    if (!(DOCUMENT_ASK_MIME_TYPES as readonly string[]).includes(resolved.contentType)) {
      setError('Send the paper as a JPEG, PNG or WebP photo, or as a PDF.');
      return;
    }
    setFile(f);
  }

  /** The ask this paper answers — the one already open, or one opened now. */
  async function resolveAskId(): Promise<string> {
    if (createdAskRef.current) return createdAskRef.current;
    if (reusableAsk) return reusableAsk.id;
    if (!kind) throw new Error('Pick which paper this is');
    const made = await create.mutateAsync({
      dealerId,
      kindCode: kind.code,
      periodKind: kind.periodKind,
      periodKey,
      ...(needsLabel ? { label: label.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      // NO PUSH FOR THIS ONE. The row has to exist before there is anywhere to
      // put the file, and it is closed a second later by the filing — so without
      // this the dealer's phone buzzes asking for a certificate that was already
      // on file before the buzz finished. The ask, its audit row and the socket
      // event all happen exactly as they would otherwise.
      silent: true,
    });
    createdAskRef.current = made.id;
    return made.id;
  }

  async function handleSubmit(): Promise<void> {
    if (submitting) return;
    setError(null);

    if (!kind) {
      setError('Pick which paper this is.');
      return;
    }
    if (needsLabel && label.trim().length < 3) {
      setError('Say what this paper is — those words are all the dealer ever sees.');
      return;
    }
    if (
      kind.periodKind !== 'NONE' &&
      (!isYmd(date) || date < MIN_SELECTABLE_YMD || date > today)
    ) {
      setError('Pick a real period that has already happened.');
      return;
    }
    if (!file) {
      setError('Attach the paper.');
      return;
    }
    // The route refuses the filing outright for a kind that tracks validity and
    // carries no date — "This paper runs out. Enter the date printed on it
    // before filing it." Checked here so that refusal is unreachable rather than
    // merely handled: by the time somebody has attached a 4 MB scan, being told
    // off by a server is a wasted upload.
    if (tracksValidity && !isIsoDay(validUntil)) {
      setError('This paper runs out. Enter the date printed on it.');
      return;
    }
    if (tracksValidity && prefill !== '' && validUntil === prefill && !confirmedDate) {
      setError(
        'That date came from the catalog, not from the paper. Check it against the certificate and tick the box.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const resolved = contentTypeOf(file);
      // SHRUNK BEFORE THE PRESIGN, never after. The presigned PUT carries the
      // size and content-type the server was told about, so compressing
      // afterwards would make both describe a file that was never sent — and the
      // bucket-side size check would then refuse the wrong thing.
      let upload = file;
      let contentType = resolved.contentType;
      if (resolved.kind === 'image') {
        const compressed = await compressImage(file, { contentType });
        if (compressed) {
          upload = compressed;
          contentType = compressed.type || contentType;
        }
      }
      const filename = upload.name || (resolved.kind === 'image' ? 'paper.jpg' : 'paper.pdf');

      const askId = await resolveAskId();

      const presign = await api.post<PresignUploadResponse>('/uploads/sign', {
        filename,
        contentType,
        size: upload.size,
        // An admin may already presign under any dealer's `ask/` prefix, so this
        // needs no new upload plumbing — the dealer check inside the route is
        // the whole boundary, and `askId` only ever picks a folder inside it.
        scope: 'ask',
        dealerId,
        askId,
      });
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: upload,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);

      await file4dealer.mutateAsync({
        askId,
        attachment: {
          storageKey: presign.storageKey,
          filename,
          contentType,
          size: upload.size,
          kind: resolved.kind,
        },
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(validUntil ? { validUntil } : {}),
      });

      toast.success(`Filed for ${dealerCodeLabel(dealerCode)}`);
      onClose();
    } catch (err) {
      // The dialog STAYS OPEN with the file still staged: a failed save is
      // almost always worth one more press, and making somebody find a scan
      // again is how a retry turns into an abandoned job. The created ask is
      // held in its ref for exactly the same reason.
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not file it';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const typedDays = isIsoDay(validUntil) ? daysFromToday(validUntil, today) : null;
  const needsTick = tracksValidity && prefill !== '' && validUntil === prefill;

  return (
    <Dialog
      open={open}
      onClose={submitting ? () => {} : onClose}
      size="md"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {`File a paper for ${dealerCodeLabel(dealerCode)}`}
          <HowThisWorks
            surface="admin-file-document-for-dealer"
            label="Filing a paper for a dealer"
            variant="icon"
          />
        </span>
      }
      description="For a paper MDG already holds — one the dealer handed over, or one MDG filed on their behalf."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            loading={submitting}
            disabled={submitting || !file || !kind}
            leftIcon={submitting ? null : <FileUp width={16} height={16} strokeWidth={1.75} />}
          >
            File it
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Callout intent="warning">{error}</Callout> : null}
        {isFallback && !kindsLoading ? (
          <Callout intent="info">
            The live catalog could not be read, so this is the shipped list. A paper an admin
            added later will not be in it.
          </Callout>
        ) : null}

        <div className="grid gap-3 [&>*]:min-w-0 md:grid-cols-2">
          <div>
            <Label htmlFor="file-kind" required>
              Which paper
            </Label>
            {kindsLoading ? (
              <Skeleton className="h-11 w-full md:h-9" />
            ) : (
              <Select
                id="file-kind"
                value={kindCode}
                disabled={submitting}
                onChange={(e) => setKindCode(e.target.value)}
              >
                <option value="">Choose…</option>
                {kinds.map((k) => (
                  <option key={k.code} value={k.code}>
                    {k.titleEn}
                  </option>
                ))}
              </Select>
            )}
            {kind ? <p className="mt-1 text-xs text-text-muted">{kind.hintEn}</p> : null}
          </div>

          {kind && kind.periodKind !== 'NONE' ? (
            <div>
              <Label htmlFor="file-period" required>
                {kind.periodKind === 'DAY'
                  ? 'Which day'
                  : kind.periodKind === 'MONTH'
                    ? 'Which month'
                    : 'Which year'}
              </Label>
              {/* ONE piece of state for every period shape, exactly as
                  `AskDocumentDialog` does it: the day is stored whole and sliced
                  down, so there is only ever one notion of "which period" on
                  this form and only one thing that can be wrong. */}
              <Input
                id="file-period"
                type={
                  kind.periodKind === 'DAY'
                    ? 'date'
                    : kind.periodKind === 'MONTH'
                      ? 'month'
                      : 'number'
                }
                value={
                  kind.periodKind === 'DAY'
                    ? date
                    : kind.periodKind === 'MONTH'
                      ? date.slice(0, 7)
                      : date.slice(0, 4)
                }
                min={
                  kind.periodKind === 'DAY'
                    ? MIN_SELECTABLE_YMD
                    : kind.periodKind === 'MONTH'
                      ? MIN_SELECTABLE_YMD.slice(0, 7)
                      : MIN_SELECTABLE_YMD.slice(0, 4)
                }
                max={
                  kind.periodKind === 'DAY'
                    ? today
                    : kind.periodKind === 'MONTH'
                      ? today.slice(0, 7)
                      : today.slice(0, 4)
                }
                disabled={submitting}
                onChange={(e) => {
                  const next = e.target.value;
                  setDate(
                    next.length === 7 ? `${next}-01` : next.length === 4 ? `${next}-01-01` : next,
                  );
                }}
              />
            </div>
          ) : null}
        </div>

        {needsLabel ? (
          <div>
            <Label htmlFor="file-label" required>
              What this paper is
            </Label>
            <Input
              id="file-label"
              value={label}
              maxLength={DOCUMENT_PERIOD_SLUG_MAX}
              disabled={submitting}
              placeholder="e.g. Electricity bill for August"
              onChange={(e) => setLabel(e.target.value)}
            />
            <p className="mt-1 text-xs text-text-muted">
              These are the only words the dealer sees, and two papers filed on the same day are
              told apart by them.
            </p>
          </div>
        ) : null}

        {alreadySent ? (
          <Callout intent="info">
            This dealer has already sent something for this one and it is waiting to be
            reviewed. Open it from the documents list and accept or send back what they sent,
            rather than filing over the top of it.
          </Callout>
        ) : reusableAsk ? (
          <Callout intent="info">
            There is already an open request for this. Filing here answers it — no second
            request goes to the dealer.
          </Callout>
        ) : null}

        {/* ── The paper ── */}
        <div>
          <Label required>The paper</Label>
          <input
            ref={fileInputRef}
            type="file"
            // Enumerated rather than `image/*`: a canvas cannot decode HEIC, so a
            // HEIC photograph could neither be shrunk before sending nor shown
            // back to whoever has to check it. Same list the server validates
            // against, imported from the same declaration.
            accept={DOCUMENT_ASK_MIME_TYPES.join(',')}
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
              <IconButton
                size="sm"
                onClick={() => setFile(null)}
                disabled={submitting}
                aria-label="Remove the paper"
                className="-mr-1 text-text-muted hover:text-text"
              >
                <X width={14} height={14} strokeWidth={1.75} />
              </IconButton>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-border-strong bg-surface px-3 py-6 text-sm text-text-muted',
                'hover:bg-surface-2 hover:text-text',
              )}
            >
              <FileUp width={16} height={16} strokeWidth={1.75} />
              Choose a photo or PDF (max {Math.round(DOCUMENT_ASK_MAX_BYTES / (1024 * 1024))} MB)
            </button>
          )}
        </div>

        {/* ── When it runs out ── */}
        {tracksValidity ? (
          <div>
            <Label htmlFor="file-valid-until" required>
              Valid until
            </Label>
            <Input
              id="file-valid-until"
              type="date"
              value={validUntil}
              min={MIN_SELECTABLE_YMD}
              max={DOCUMENT_VALIDITY_MAX_DAY}
              disabled={submitting}
              onChange={(e) => {
                setValidUntil(e.target.value);
                setConfirmedDate(false);
              }}
            />
            <p className="mt-1 text-xs text-text-muted">
              {prefill
                ? `The catalog says this kind usually runs ${kind?.validityMonths} months, so the box starts there. The date that governs is the one printed on the paper.`
                : 'The date printed on the paper.'}
            </p>
            {typedDays !== null ? (
              <p className="mt-1 text-xs text-text-subtle">
                {dealerProfileDateLabel(validUntil, 'en')} ·{' '}
                {documentValidityLabel(typedDays, 'en')}
              </p>
            ) : null}
            {needsTick ? (
              // The confirmation only exists while the box still holds the
              // catalog's guess. Type a different date and it disappears —
              // somebody who has read the certificate has already done the thing
              // this tick is asking about.
              <Checkbox
                // `labelClassName`, not `className`: on this primitive
                // `className` lands on the INPUT and `labelClassName` on the
                // `<label>` that is the actual row — a margin passed the other
                // way moves the 13px box and leaves the row where it was.
                labelClassName="mt-2"
                align="start"
                checked={confirmedDate}
                disabled={submitting}
                onChange={(e) => setConfirmedDate(e.target.checked)}
                label="I have read this date off the paper itself"
                hint="A validity MDG worked out is a validity nobody read. This one decides when the dealer is chased."
              />
            ) : null}
          </div>
        ) : null}

        <div>
          <Label htmlFor="file-note" hint="optional">
            Note
          </Label>
          <Textarea
            id="file-note"
            value={note}
            rows={2}
            maxLength={1000}
            disabled={submitting}
            placeholder="Where this came from — e.g. handed over at the outlet visit on 2 September."
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* Permanent, not dismissible, and not a checkbox. A compliance mark
            that says the dealer sent something they did not is worse than no
            mark at all, so the screen states whose name goes on it every single
            time. */}
        <p className="text-sm text-text-muted">
          This is recorded as{' '}
          <strong className="font-semibold text-text">filed by you</strong>, not as sent by the
          dealer, and it is accepted the moment it is filed.
        </p>
      </div>
    </Dialog>
  );
}
