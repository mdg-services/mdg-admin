import { Mic, Paperclip, Send, Trash2, X } from 'lucide-react';
import * as React from 'react';


import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Textarea } from '@/components/ui/Textarea';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { isNativeShell, requestNativeMicPermission } from '@/lib/nativeBridge';
import {
  MAX_ATTACHMENT_BYTES,
  formatDuration,
  uploadAttachment,
} from '@/lib/uploadAttachment';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';
import type { Attachment } from '@dk/shared';

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

/** Display-ready summary of the message being replied to. */
export interface ComposerReplyPreview {
  senderLabel: string;
  snippet: string;
  imageUrl?: string;
}

interface ComposerProps {
  conversationId: string;
  onSend: (payload: {
    body?: string;
    attachments: Attachment[];
  }) => Promise<void>;
  disabled?: boolean;
  /** When set, a reply-quote strip shows above the input. */
  replyingTo?: ComposerReplyPreview | null;
  onCancelReply?: () => void;
}

const ACCEPT =
  'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain';

const LINE_HEIGHT = 20;
const MAX_ROWS = 6;

export function Composer({
  conversationId,
  onSend,
  disabled,
  replyingTo,
  onCancelReply,
}: ComposerProps) {
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

  // Starting a reply drops focus straight into the input.
  React.useEffect(() => {
    if (replyingTo) textareaRef.current?.focus();
  }, [replyingTo]);

  const hasContent = body.trim().length > 0 || files.length > 0;
  const busy = sending || disabled;
  const isMd = useMediaQuery('(min-width: 768px)');
  // A resolved chat disables the composer; say why. On phones drop the desktop
  // keyboard hint (no Cmd/Ctrl; it just truncates in a narrow field).
  const placeholder = disabled
    ? 'This chat is resolved — reopen to reply.'
    : isMd
      ? 'Type a message... (Cmd/Ctrl+Enter to send)'
      : 'Type a message…';

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
    if (!recorder.supported) {
      // The reason used to live only in `title`, which never fires on touch —
      // so on a phone the mic was a greyed-out button with no explanation
      // anywhere. Keep the control tappable and answer in visible text.
      setError('Voice notes are not supported in this browser.');
      return;
    }
    const ok = await recorder.start();
    if (!ok) {
      // Mic blocked (permission denied / unsupported). Inside the native shell
      // the WebView's getUserMedia can't trigger the Android runtime prompt on
      // its own — ask the shell to request it just-in-time. If the user grants
      // it, prompt them to try again; otherwise fall back to the settings hint.
      // In a plain browser requestNativeMicPermission resolves false, so this
      // goes straight to the hint.
      if (isNativeShell()) {
        const granted = await requestNativeMicPermission();
        if (granted) {
          setError('Microphone enabled. Tap the mic again to record.');
          return;
        }
      }
      setError('Microphone unavailable. Check browser permissions.');
    }
  }

  async function stopAndSendVoice() {
    const rec = await recorder.stop();
    if (!rec || rec.blob.size === 0) return;
    // Normalise to a clean base audio MIME (strip ";codecs=…", guarantee audio/*)
    // so the presign allowlist accepts it and the S3 PUT matches the signed type.
    let mime = ((rec.mimeType || rec.blob.type || 'audio/webm').split(';')[0] || 'audio/webm').trim();
    if (!mime.startsWith('audio/')) mime = 'audio/webm';
    const ext = extForMime(mime);
    const file = new File([rec.blob], `voice-${Date.now()}.${ext}`, {
      type: mime,
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
    /*
     * The bottom-most element on screen in a thread, and in a thread the mobile
     * tab bar — the one thing that carries `.safe-bottom` — is hidden. So this
     * row owns its own bottom inset or the mic and Send sit inside the iPhone
     * home-indicator strip. It looked safe until now only because the page was
     * rendering 32px shorter than the space it occupies (InboxPage's `h-full`
     * against `main`'s content box), an accident the height fix removes.
     */
    <div className="border-t border-border bg-surface px-3 py-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] md:pb-2">
      {replyingTo ? (
        <div className="mb-2 flex items-center gap-2 rounded-md border-l-[3px] border-brand bg-surface-2 px-2.5 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-brand">
              {replyingTo.senderLabel}
            </p>
            <p className="truncate text-xs text-text-muted">
              {replyingTo.snippet}
            </p>
          </div>
          {replyingTo.imageUrl ? (
            <img
              src={replyingTo.imageUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-md object-cover"
            />
          ) : null}
          <IconButton
            aria-label="Cancel reply"
            // `xs`: this was a 22px `p-1` glyph inside a quote strip, and `sm`
            // would grow it to 32px on desktop for no mobile gain — below md
            // every size is the same 44px square.
            size="xs"
            onClick={onCancelReply}
            className="text-text-muted"
          >
            <X width={14} height={14} strokeWidth={1.75} />
          </IconButton>
        </div>
      ) : null}
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
                {/* The paint has to stay small — it sits on a 64px thumbnail —
                    so the hit area grows instead, the way `.tap-target` does it.
                    Not `.tap-target` itself: that utility sets
                    `position: relative` and is emitted after `.absolute`, so it
                    would unpin this X from the thumbnail's corner. */}
                <button
                  type="button"
                  onClick={() => removeFile(s.id)}
                  aria-label={`Remove ${s.file.name}`}
                  className="tap-halo absolute right-0.5 top-0.5 rounded-full bg-black/55 p-0.5 text-white hover:bg-black/75"
                >
                  <X width={12} height={12} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <span
                key={s.id}
                className="inline-flex min-h-11 max-w-xs items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-text md:min-h-0"
              >
                <Paperclip width={12} height={12} strokeWidth={1.75} />
                <span className="truncate">{s.file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(s.id)}
                  aria-label={`Remove ${s.file.name}`}
                  className="tap-target rounded-sm p-1 text-text-muted hover:text-text md:p-0"
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
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text md:h-9 md:w-9"
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
      ) : disabled && !isMd ? (
        /*
         * A resolved chat's only explanation used to be the placeholder, inside
         * a field about 180px wide at 360px — the admin read "This chat is
         * resol…" beside a mic that was simply grey. Below md the row is
         * replaced by the sentence itself, pointing at the Reopen button that
         * is already in the thread header.
         */
        <p className="px-1 py-2 text-sm text-text-muted">
          This chat is resolved. Tap{' '}
          <span className="font-medium text-text">Reopen</span> at the top to
          reply.
        </p>
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
              'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted md:h-9 md:w-9',
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
            placeholder={placeholder}
            disabled={busy}
            className="min-h-[36px] min-w-0 resize-none"
          />
          {hasContent ? (
            // The word "Send" costs ~84px of a 360px row. With the attach
            // button and the two gaps that left the field about 192px to type
            // in — half the screen spent on chrome. Below md the glyph alone
            // says it, at the same 44px target; the labelled button is still
            // what a desktop gets.
            isMd ? (
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
              <IconButton
                aria-label="Send"
                variant="primary"
                onClick={handleSend}
                disabled={!hasContent || busy}
                loading={sending}
              >
                <Send width={18} height={18} strokeWidth={1.75} />
              </IconButton>
            )
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={busy}
              aria-label="Record voice message"
              className={cn(
                'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted md:h-9 md:w-9',
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
