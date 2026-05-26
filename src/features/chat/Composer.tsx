import type { Attachment } from '@dk/shared';
import { Paperclip, Send, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/lib/cn';
import {
  MAX_ATTACHMENT_BYTES,
  uploadAttachment,
} from '@/lib/uploadAttachment';

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
  const [files, setFiles] = React.useState<File[]>([]);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
    const next: File[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list.item(i);
      if (!f) continue;
      if (f.size > MAX_ATTACHMENT_BYTES) {
        setError(`${f.name} exceeds 25 MB limit`);
        continue;
      }
      next.push(f);
    }
    if (next.length > 0) {
      setFiles((curr) => [...curr, ...next]);
    }
  }

  function removeFile(index: number) {
    setFiles((curr) => curr.filter((_, i) => i !== index));
  }

  async function handleSend() {
    if (!hasContent || busy) return;
    setSending(true);
    setError(null);
    try {
      const uploaded = await Promise.all(
        files.map((f) => uploadAttachment(f, conversationId)),
      );
      await onSend({
        body: body.trim() ? body.trim() : undefined,
        attachments: uploaded,
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

  return (
    <div className="border-t border-border bg-surface px-3 py-2">
      {files.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="inline-flex max-w-xs items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-text"
            >
              <Paperclip width={12} height={12} strokeWidth={1.75} />
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                aria-label={`Remove ${f.name}`}
                className="rounded-sm text-text-muted hover:text-text"
              >
                <X width={12} height={12} strokeWidth={1.75} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {error ? (
        <p className="mb-1 text-xs text-danger">{error}</p>
      ) : null}
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
        <Button
          type="button"
          onClick={handleSend}
          disabled={!hasContent || busy}
          loading={sending}
          leftIcon={
            sending ? null : (
              <Send width={16} height={16} strokeWidth={1.75} />
            )
          }
        >
          Send
        </Button>
      </div>
    </div>
  );
}
