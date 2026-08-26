import { FileUp, Paperclip, X } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Callout,
  Dialog,
  IconButton,
  Label,
  Textarea,
  useToast,
} from '@/components/ui';
import { useUploadTtRegisterPhoto } from '@/hooks/api/useTtDensity';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { compressImage } from '@/lib/compressImage';
import { formatYmd } from '@/lib/format';
import { MAX_ATTACHMENT_BYTES, resolveFileType } from '@/lib/uploadAttachment';
import type { PresignUploadResponse } from '@dk/shared';

/**
 * An admin filing the density-register page for a dealer who did not.
 *
 * Modelled on `features/records/UploadRecordDialog.tsx` — hidden file input, a
 * dashed choose-a-photo button, a chip with an X to clear, then presign → PUT →
 * create. Three deliberate differences.
 *
 * `accept="image/*"` only. The register page is a photograph of a book. A PDF
 * here would be somebody uploading the wrong thing entirely, and the server
 * refuses it anyway.
 *
 * The date is in the TITLE, not buried in the body, because the one mistake this
 * dialog can make that nobody notices is filing today's photo against last
 * Tuesday.
 *
 * And the line above the submit button is permanent — not a checkbox, not
 * dismissible. A compliance mark that says the dealer sent something they did
 * not is worse than no mark at all, so the screen states plainly whose name goes
 * on it, every single time, with no way to turn the reminder off.
 */

export interface UploadDayPhotoDialogProps {
  open: boolean;
  onClose: () => void;
  dealerId: string;
  businessDate: string;
  /** True when the day already has a photo — this upload supersedes it. */
  replacing: boolean;
}

export function UploadDayPhotoDialog({
  open,
  onClose,
  dealerId,
  businessDate,
  replacing,
}: UploadDayPhotoDialogProps) {
  const toast = useToast();
  const save = useUploadTtRegisterPhoto(dealerId);
  const [file, setFile] = React.useState<File | null>(null);
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setNote('');
    setError(null);
    setSubmitting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  function pickFile(list: FileList | null) {
    setError(null);
    const f = list?.item(0) ?? null;
    if (!f) return;
    if (f.size > MAX_ATTACHMENT_BYTES) {
      setError(`${f.name} exceeds the 25 MB limit`);
      return;
    }
    // Not `f.type`: an Android System WebView camera capture hands back an empty
    // MIME, and refusing on that tells an operator their photograph is not a
    // photograph.
    if (resolveFileType(f, { assumeImage: false }).kind !== 'image') {
      setError('The register page must be a photo');
      return;
    }
    setFile(f);
  }

  async function handleSubmit() {
    if (submitting || !file) {
      if (!file) setError('Choose a photo of the register page');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Downscale before the presign, exactly as the dealer's own phone does.
      // This photograph is read back by the dealer through `DayPhotoViewer`, so
      // an untouched 12 MB camera JPEG filed from a desk becomes a 12 MB
      // download at the pump on 2G. `compressImage` returns null whenever
      // shrinking is not safe, so `upload` is always what is actually PUT and
      // the presigned size/type always describe it.
      const resolved = resolveFileType(file, { assumeImage: true });
      let upload = file;
      let contentType = resolved.contentType;
      const compressed = await compressImage(file, { contentType });
      if (compressed) {
        upload = compressed;
        contentType = compressed.type || contentType;
      }
      const filename = upload.name || 'register.jpg';

      const presign = await api.post<PresignUploadResponse>('/uploads/sign', {
        filename,
        contentType,
        size: upload.size,
        scope: 'tt-density',
        dealerId,
      });
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: upload,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);

      await save.mutateAsync({
        businessDate,
        photo: {
          storageKey: presign.storageKey,
          filename,
          contentType,
          size: upload.size,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      toast.success(`Register photo saved for ${formatYmd(businessDate)}`);
      reset();
      onClose();
    } catch (err) {
      // The dialog stays open with the file still staged: a failed save is
      // almost always worth one more press, and making the operator find the
      // photo again is how a retry turns into an abandoned day.
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not save the photo',
      );
      toast.error(err instanceof ApiError ? err.message : 'Could not save the photo');
    } finally {
      setSubmitting(false);
    }
  }

  const dayLabel = formatYmd(businessDate, { weekday: true });

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      size="sm"
      title={`${replacing ? 'Replace' : 'Upload'} register photo — ${dayLabel}`}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            loading={submitting}
            disabled={!file}
            leftIcon={
              submitting ? null : <FileUp width={16} height={16} strokeWidth={1.75} />
            }
          >
            {replacing ? 'Replace photo' : 'Upload'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {replacing ? (
          <Callout intent="warning">
            The photo already on this day will be replaced.
          </Callout>
        ) : null}

        <div>
          <Label required>Register page photo</Label>
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
              {/* The only way to swap a wrongly-picked photograph without
                  cancelling the whole dialog, and it sat at ~30×30 next to a
                  truncated filename — a mis-tap landed on nothing. */}
              <IconButton
                size="sm"
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={submitting}
                aria-label="Remove photo"
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
              Choose a photo (max 25 MB)
            </button>
          )}
        </div>

        <div>
          <Label htmlFor="tt-register-note" hint="optional">
            Note
          </Label>
          <Textarea
            id="tt-register-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why this day was filed by MDG"
            rows={2}
            maxLength={500}
          />
        </div>

        <p className="text-sm text-text-muted">
          This will be recorded as <strong className="font-semibold text-text">uploaded by you</strong>, not by the
          dealer.
        </p>

        {error ? (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
