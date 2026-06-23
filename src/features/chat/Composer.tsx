import { Mic, Paperclip, Send, Trash2, X } from 'lucide-react';
import * as React from 'react';

import type { Attachment } from '@dk/shared';

import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/lib/cn';
import {
  MAX_ATTACHMENT_BYTES,
  formatDuration,
  uploadAttachment,
} from '@/lib/uploadAttachment';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';

function extForMime(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

interface StagedFile {
  id: string;
  file: File;
  /** Object URL for an inline thumbnail; only set for images. */
  previewUrl?: string;
}

interface ComposerProps {
  conversationId: string;
  onSend: (payload: {
    body?: string;
    attachments: Attachment[];
  }) => Promise<void>;
  disabled?: boolean;
}

const ACCEPT =
  'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain';

const LINE_HEIGHT = 20;
const MAX_ROWS = 6;

export function Composer({ conversationId, onSend, disabled }: ComposerProps) {
  const [body, setBody] = React.useState('');
  const [files, setFiles] = React.useState<StagedFile[]>([]);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const recorder = useVoiceRecorder();
  const isRecording = recorder.status === 'recording';

  React.useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(ta.scrollHeight, LINE_HEIGHT * MAX_ROWS + 16);
    ta.style.height = `${next}px`;
  }, [body]);

  const hasContent = body.trim().length > 0 || files.length > 0;
  const busy = sending || disabled;

  function pickFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next: StagedFile[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list.item(i);
      if (!f) continue;
      if (f.size > MAX_ATTACHMENT_BYTES) {
        setError(`${f.name} exceeds 25 MB limit`);
        continue;
      }
      next.push({
        id: `${Date.now()}-${i}-${f.name}`,
        file: f,
        previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
      });
    }
    if (next.length > 0) {
      setFiles((curr) => [...curr, ...next]);
    }
  }

  function removeFile(id: string) {
    setFiles((curr) => {
      const removed = curr.find((s) => s.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return curr.filter((s) => s.id !== id);
    });
  }

  // Revoke any outstanding preview object URLs on unmount.
  React.useEffect(() => {
    return () => {
      files.forEach((s) => {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend() {
    if (!hasContent || busy) return;
    setSending(true);
    setError(null);
    try {
      const uploaded = await Promise.all(
        files.map((s) => uploadAttachment(s.file, conversationId)),
      );
      await onSend({
        body: body.trim() ? body.trim() : undefined,
        attachments: uploaded,
      });
      files.forEach((s) => {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      });
      setBody('');
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSend();
    }
  }

  async function startRecording() {
    setError(null);
    const ok = await recorder.start();
    if (!ok) {
      setError('Microphone unavailable. Check browser permissions.');
    }
  }

  async function stopAndSendVoice() {
    const rec = await recorder.stop();
    if (!rec || rec.blob.size === 0) return;
    const ext = extForMime(rec.mimeType);
    const file = new File([rec.blob], `voice-${Date.now()}.${ext}`, {
      type: rec.blob.type || rec.mimeType,
    });
    setSending(true);
    setError(null);
    try {
      const uploaded = await uploadAttachment(file, conversationId, rec.durationMs);
      await onSend({ attachments: [uploaded] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send voice message');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-border bg-surface px-3 py-2">
      {files.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((s) =>
            s.previewUrl ? (
              <div
                key={s.id}
                className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border bg-surface-2"
              >
                <img
                  src={s.previewUrl}
                  alt={s.file.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeFile(s.id)}
                  aria-label={`Remove ${s.file.name}`}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/55 p-0.5 text-white hover:bg-black/75"
                >
                  <X width={12} height={12} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <span
                key={s.id}
                className="inline-flex max-w-xs items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-text"
              >
                <Paperclip width={12} height={12} strokeWidth={1.75} />
                <span className="truncate">{s.file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(s.id)}
                  aria-label={`Remove ${s.file.name}`}
                  className="rounded-sm text-text-muted hover:text-text"
                >
                  <X width={12} height={12} strokeWidth={1.75} />
                </button>
              </span>
            ),
          )}
        </div>
      ) : null}
      {error ? (
        <p className="mb-1 text-xs text-danger">{error}</p>
      ) : null}
      {isRecording ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => recorder.cancel()}
            aria-label="Cancel recording"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text"
          >
            <Trash2 width={18} height={18} strokeWidth={1.75} />
          </button>
          <div className="flex flex-1 items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
            <span className="text-sm font-medium tabular-nums text-text">
              {formatDuration(recorder.elapsedMs)}
            </span>
            <span className="text-sm text-text-subtle">Recording…</span>
          </div>
          <Button
            type="button"
            onClick={stopAndSendVoice}
            loading={sending}
            leftIcon={sending ? null : <Send width={16} height={16} strokeWidth={1.75} />}
          >
            Send
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => pickFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            aria-label="Attach files"
            className={cn(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted',
              'hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            <Paperclip width={18} height={18} strokeWidth={1.75} />
          </button>
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Type a message... (Cmd/Ctrl+Enter to send)"
            disabled={busy}
            className="min-h-[36px] resize-none"
          />
          {hasContent ? (
            <Button
              type="button"
              onClick={handleSend}
              disabled={!hasContent || busy}
              loading={sending}
              leftIcon={sending ? null : <Send width={16} height={16} strokeWidth={1.75} />}
            >
              Send
            </Button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={busy || !recorder.supported}
              aria-label="Record voice message"
              title={recorder.supported ? 'Record voice message' : 'Recording not supported'}
              className={cn(
                'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted',
                'hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              <Mic width={18} height={18} strokeWidth={1.75} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
