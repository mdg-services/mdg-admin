import { Pause, Paperclip, Play } from 'lucide-react';
import * as React from 'react';


import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { downloadAttachment } from '@/lib/downloadAttachment';
import { formatDuration } from '@/lib/uploadAttachment';
import type { Attachment } from '@dk/shared';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Inline audio player for a received voice note. */
function VoiceMessage({ attachment }: { attachment: Attachment }) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const trackRef = React.useRef<HTMLButtonElement>(null);
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

  /**
   * Where a re-listen should land, from where the tap fell. On `click` rather
   * than `pointerdown`: a pointerdown here also starts a scroll of the thread,
   * and the bubble's long-press swallows the trailing click, so a press-and-hold
   * opens the message menu without also jumping the audio.
   */
  function seekFromPointer(e: React.MouseEvent<HTMLButtonElement>) {
    const el = audioRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const duration = Number.isFinite(el.duration) ? el.duration : totalMs / 1000;
    if (!duration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * duration;
    setCurrentMs(ratio * duration * 1000);
  }

  function nudge(seconds: number) {
    const el = audioRef.current;
    if (!el) return;
    const duration = Number.isFinite(el.duration) ? el.duration : totalMs / 1000;
    const next = Math.min(duration || 0, Math.max(0, el.currentTime + seconds));
    el.currentTime = next;
    setCurrentMs(next * 1000);
  }

  return (
    <div className="flex min-w-[180px] items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand md:h-8 md:w-8"
      >
        {playing ? (
          <Pause width={15} strokeWidth={2} />
        ) : (
          <Play width={15} strokeWidth={2} className="translate-x-[1px]" />
        )}
      </button>
      {/* Play/pause used to be the entire interaction surface of a voice note —
          the bar was a painted div. It is now the seek control, and the whole
          column is the target so no 6px bar has to be hit. */}
      <button
        ref={trackRef}
        type="button"
        aria-label="Seek voice message"
        onClick={seekFromPointer}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            nudge(-5);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            nudge(5);
          }
        }}
        className="flex min-h-11 flex-1 flex-col justify-center gap-1 text-left md:min-h-0"
      >
        <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <span
            className="block h-full rounded-full bg-brand"
            style={{ width: `${progress}%` }}
          />
        </span>
        <span className="text-[11px] tabular-nums text-text-subtle">
          {formatDuration(playing || currentMs > 0 ? currentMs : totalMs)}
        </span>
      </button>
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
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadAttachment(attachment);
    } catch {
      toast.error('Download failed');
    } finally {
      setDownloading(false);
    }
  }

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
        <ImageLightbox
          open={open}
          onClose={() => setOpen(false)}
          src={attachment.url}
          alt={attachment.filename}
          title={attachment.filename}
          onDownload={handleDownload}
          downloading={downloading}
        />
      </>
    );
  }

  // Was `<a target="_blank">` on the signed URL that rode in with the message.
  // Two failures: that URL expires, so a document on an older message 403s; and
  // the shell runs `setSupportMultipleWindows={false}`, so the tap could also
  // do nothing at all. `handleDownload` presigns a fresh URL and goes through
  // the native download bridge — the same path the long-press menu already used.
  return (
    <button
      type="button"
      onClick={() => void handleDownload()}
      disabled={downloading}
      aria-label={`Download ${attachment.filename}`}
      className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text hover:bg-surface-2 disabled:opacity-70 md:min-h-0"
    >
      {downloading ? (
        <Spinner size={14} />
      ) : (
        <Paperclip width={14} height={14} strokeWidth={1.75} />
      )}
      <span className="truncate">{attachment.filename}</span>
      <span className="shrink-0 text-text-subtle">
        {formatBytes(attachment.size)}
      </span>
    </button>
  );
}
