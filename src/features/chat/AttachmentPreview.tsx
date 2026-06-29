import { Pause, Paperclip, Play } from 'lucide-react';
import * as React from 'react';


import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/uploadAttachment';
import type { Attachment } from '@dk/shared';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Inline audio player for a received voice note. */
function VoiceMessage({ attachment }: { attachment: Attachment }) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [currentMs, setCurrentMs] = React.useState(0);
  const [loadedMs, setLoadedMs] = React.useState<number | null>(null);

  const totalMs = attachment.durationMs ?? loadedMs ?? 0;
  const progress = totalMs > 0 ? Math.min(100, (currentMs / totalMs) * 100) : 0;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  return (
    <div className="flex min-w-[180px] items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"
      >
        {playing ? (
          <Pause width={15} strokeWidth={2} />
        ) : (
          <Play width={15} strokeWidth={2} className="translate-x-[1px]" />
        )}
      </button>
      <div className="flex flex-1 flex-col gap-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums text-text-subtle">
          {formatDuration(playing || currentMs > 0 ? currentMs : totalMs)}
        </span>
      </div>
      <audio
        ref={audioRef}
        src={attachment.url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentMs(0);
        }}
        onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setLoadedMs(d * 1000);
        }}
        className={cn('hidden')}
      />
    </div>
  );
}

export function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const [open, setOpen] = React.useState(false);

  if (attachment.kind === 'audio' && attachment.url) {
    return <VoiceMessage attachment={attachment} />;
  }

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
