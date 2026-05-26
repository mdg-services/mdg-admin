import type { Attachment } from '@dk/shared';
import { Paperclip } from 'lucide-react';
import * as React from 'react';

import { Dialog } from '@/components/ui/Dialog';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const [open, setOpen] = React.useState(false);

  if (attachment.kind === 'image' && attachment.url) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block overflow-hidden rounded-md border border-border bg-surface-2"
        >
          <img
            src={attachment.url}
            alt={attachment.filename}
            width={160}
            height={160}
            className="h-40 w-40 object-cover"
          />
        </button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          size="lg"
          title={attachment.filename}
        >
          <img
            src={attachment.url}
            alt={attachment.filename}
            className="mx-auto max-h-[70vh] w-auto"
          />
        </Dialog>
      </>
    );
  }

  const href = attachment.url ?? '#';
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text hover:bg-surface-2"
    >
      <Paperclip width={14} height={14} strokeWidth={1.75} />
      <span className="truncate">{attachment.filename}</span>
      <span className="text-text-subtle">{formatBytes(attachment.size)}</span>
    </a>
  );
}
