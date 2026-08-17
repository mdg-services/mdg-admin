import { FileUp, Paperclip, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useCreateRecord } from '@/hooks/api/useCreateRecord';
import { cn } from '@/lib/cn';
import {
  MAX_ATTACHMENT_BYTES,
  uploadAttachment,
} from '@/lib/uploadAttachment';
import { RECORD_TYPES, RECORD_TYPE_LABELS } from '@dk/shared';
import type { Attachment, RecordType } from '@dk/shared';

interface UploadRecordDialogProps {
  open: boolean;
  onClose: () => void;
  dealerId: string;
  dealerCode?: string;
  /** Conversation used for the upload presign scope, if available. */
  conversationId?: string;
}

const ACCEPT =
  'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain';

export function UploadRecordDialog({
  open,
  onClose,
  dealerId,
  dealerCode,
  conversationId,
}: UploadRecordDialogProps) {
  const toast = useToast();
  const createRecord = useCreateRecord();

  const [type, setType] = React.useState<RecordType>('dsr');
  const [title, setTitle] = React.useState(RECORD_TYPE_LABELS.dsr);
  const [titleEdited, setTitleEdited] = React.useState(false);
  const [periodLabel, setPeriodLabel] = React.useState('');
  const [note, setNote] = React.useState('');
  const [announceInChat, setAnnounceInChat] = React.useState(true);
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function reset() {
    setType('dsr');
    setTitle(RECORD_TYPE_LABELS.dsr);
    setTitleEdited(false);
    setPeriodLabel('');
    setNote('');
    setAnnounceInChat(true);
    setFile(null);
    setError(null);
    setSubmitting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  function handleTypeChange(next: RecordType) {
    setType(next);
    // Auto-suggest title from the type unless the user typed their own.
    if (!titleEdited) setTitle(RECORD_TYPE_LABELS[next]);
  }

  function pickFile(list: FileList | null) {
    setError(null);
    const f = list?.item(0) ?? null;
    if (!f) return;
    if (f.size > MAX_ATTACHMENT_BYTES) {
      setError(`${f.name} exceeds 25 MB limit`);
      return;
    }
    setFile(f);
  }

  async function handleSubmit() {
    if (submitting) return;
    if (!file) {
      setError('Select a file to upload');
      return;
    }
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const attachment: Attachment = await uploadAttachment(
        file,
        conversationId ?? dealerId,
      );
      await createRecord.mutateAsync({
        dealerId,
        type,
        title: title.trim(),
        periodLabel: periodLabel.trim() || undefined,
        note: note.trim() || undefined,
        attachment,
        announceInChat,
      });
      toast.success('Report uploaded', {
        description: dealerCode ? `Sent to ${dealerCode}` : undefined,
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Upload report"
      description={dealerCode ? `Deliver a record to ${dealerCode}` : undefined}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={!file}
            leftIcon={
              submitting ? null : (
                <FileUp width={16} height={16} strokeWidth={1.75} />
              )
            }
          >
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label required>File</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
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
                aria-label="Remove file"
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
                'flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-border-strong bg-surface px-3 py-6 text-sm text-text-muted',
                'hover:bg-surface-2 hover:text-text',
              )}
            >
              <FileUp width={16} height={16} strokeWidth={1.75} />
              Choose a file (max 25 MB)
            </button>
          )}
        </div>

        <div>
          <Label htmlFor="record-type" required>
            Type
          </Label>
          <Select
            id="record-type"
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as RecordType)}
          >
            {RECORD_TYPES.map((t) => (
              <option key={t} value={t}>
                {RECORD_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="record-title" required>
            Title
          </Label>
          <Input
            id="record-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleEdited(true);
            }}
            placeholder="Daily Sales Report"
            maxLength={120}
          />
        </div>

        <div>
          <Label htmlFor="record-period" hint="optional">
            Period
          </Label>
          <Input
            id="record-period"
            value={periodLabel}
            onChange={(e) => setPeriodLabel(e.target.value)}
            placeholder="14 Mar 2026"
            maxLength={60}
          />
        </div>

        <div>
          <Label htmlFor="record-note" hint="optional">
            Note
          </Label>
          <Textarea
            id="record-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything the dealer should know about this report"
            rows={3}
            maxLength={1000}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={announceInChat}
            onChange={(e) => setAnnounceInChat(e.target.checked)}
            className="h-4 w-4 rounded-sm border-border-strong accent-brand"
          />
          Announce in chat
        </label>

        {error ? (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
