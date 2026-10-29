import { ImageOff, Pause, Play } from 'lucide-react';
import * as React from 'react';

import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { transcriptOf } from '@/lib/chatTranscript';
import { cn } from '@/lib/cn';
import { downloadAttachment } from '@/lib/downloadAttachment';
import { formatDuration } from '@/lib/uploadAttachment';
import { isVideoAttachment, type Attachment } from '@dk/shared';

import { DealerViewContext } from './DealerCards';
import { dealerWord } from './dealerView';

/**
 * A message's attachments, drawn inside its bubble the way the dealer's app
 * draws them (`mdg-client/src/features/chat/AttachmentPreview.tsx`): a picture
 * as wide as the bubble at its own shape, several as WhatsApp's album, a video
 * in a tall black box, a voice note as a player row, a document as a row with
 * its coloured type badge.
 */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useDownload(attachment: Attachment) {
  const toast = useToast();
  const [downloading, setDownloading] = React.useState(false);
  const download = React.useCallback(async () => {
    setDownloading(true);
    try {
      await downloadAttachment(attachment);
    } catch {
      toast.error('Download failed');
    } finally {
      setDownloading(false);
    }
  }, [attachment, toast]);
  return { download, downloading };
}

// ── Voice notes ───────────────────────────────────────────────────────────

/** A voice note: play, a seek bar, its length — and, once heard by the server, what was said. */
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

  // What was said, once the server has listened to the note — the dealer's
  // app shows it under the player too, under the same word. Small and muted,
  // where a wrong transcript is as easy to see as the audio is to play.
  const words = transcriptOf(attachment);
  const { lang } = React.useContext(DealerViewContext);

  return (
    <div className="w-[min(68vw,264px)] max-w-full px-1">
      <div className="flex items-center gap-2 py-1">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause voice message' : 'Play voice message'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-wa-bar-icon hover:bg-black/[0.06]"
        >
          {playing ? (
            <Pause width={22} strokeWidth={2} fill="currentColor" />
          ) : (
            <Play width={22} strokeWidth={2} fill="currentColor" className="translate-x-[1px]" />
          )}
        </button>
        {/* The whole column is the seek target, so no 4px bar has to be hit. */}
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
          className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1.5 text-left md:min-h-9"
        >
          <span className="relative block h-1 w-full rounded-full bg-black/[0.12]">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-wa-bar-icon"
              style={{ width: `${progress}%` }}
            />
            <span
              aria-hidden
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-wa-bar-icon"
              style={{ left: `${progress}%` }}
            />
          </span>
          <span className="text-[11px] tabular-nums leading-none text-wa-meta">
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
          className="hidden"
        />
      </div>
      {words ? (
        <p className="mb-1 select-text whitespace-pre-wrap break-words rounded-md bg-black/[0.04] px-2 py-1.5 text-[12px] leading-snug text-wa-meta">
          <span className="font-medium">{dealerWord(lang, 'transcript')}: </span>
          {words}
        </p>
      ) : null}
    </div>
  );
}

// ── Pictures ──────────────────────────────────────────────────────────────

/** The tallest a picture grows in a bubble, as in the app. */
const MEDIA_MAX_H = 330;
/** A very tall or very wide picture is cropped to these, as in WhatsApp. */
const MIN_RATIO = 0.6;
const MAX_RATIO = 2;

/** Shapes already measured, so a picture that re-renders starts at its real shape. */
const knownRatios = new Map<string, number>();

/** One picture, sized by its own shape, opening the full-size viewer on a tap. */
function ImageTile({
  attachment,
  fill,
}: {
  attachment: Attachment;
  /** Inside an album the tile fills its cell; on its own it sizes itself. */
  fill?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const { download, downloading } = useDownload(attachment);
  const [ratio, setRatio] = React.useState<number | undefined>(() =>
    knownRatios.get(attachment.storageKey),
  );

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (fill || !img.naturalWidth || !img.naturalHeight) return;
    const r = Math.min(MAX_RATIO, Math.max(MIN_RATIO, img.naturalWidth / img.naturalHeight));
    knownRatios.set(attachment.storageKey, r);
    setRatio((prev) => (prev === r ? prev : r));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={attachment.filename}
        className={cn(
          'relative block overflow-hidden bg-black/[0.06]',
          fill ? 'h-full w-full' : 'w-full rounded-md',
        )}
        style={fill ? undefined : { aspectRatio: String(ratio ?? 1), maxHeight: MEDIA_MAX_H }}
      >
        {failed ? (
          <span className="absolute inset-0 flex items-center justify-center text-wa-meta">
            <ImageOff width={fill ? 20 : 26} strokeWidth={1.5} />
          </span>
        ) : (
          <img
            src={attachment.url}
            alt={attachment.filename}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={handleLoad}
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </button>
      <ImageLightbox
        open={open}
        onClose={() => setOpen(false)}
        src={attachment.url ?? ''}
        alt={attachment.filename}
        title={attachment.filename}
        onDownload={download}
        downloading={downloading}
      />
    </>
  );
}

/**
 * One picture alone, or WhatsApp's album: two side by side, three as one tall
 * and two, four as 2×2 — the app's layouts.
 *
 * FIVE OR MORE: the app shows four and "+N" over the last, its viewer then
 * swiping through the rest. The admin's viewer opens one picture, so a "+N"
 * here would leave pictures 5–10 unreachable from the thread — and an admin
 * checks every one before "Mark received". So every picture gets its own tile,
 * two to a row.
 */
function ImageAlbum({ images }: { images: Attachment[] }) {
  if (images.length === 1) return <ImageTile attachment={images[0]!} />;
  if (images.length > 4) {
    return (
      <div className="grid w-full grid-cols-2 gap-[2px] overflow-hidden rounded-md bg-wa-chip">
        {images.map((a, i) => (
          <div key={i} className="relative aspect-square min-w-0">
            <ImageTile attachment={a} fill />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div
      className={cn(
        'grid w-full gap-[2px] overflow-hidden rounded-md bg-wa-chip',
        images.length === 2
          ? 'grid-cols-2 grid-rows-1 [aspect-ratio:2/1]'
          : 'grid-cols-2 grid-rows-2 [aspect-ratio:1/1]',
      )}
      style={{ maxHeight: MEDIA_MAX_H }}
    >
      {images.map((a, i) => (
        <div
          key={i}
          className={cn('relative min-h-0 min-w-0', images.length === 3 && i === 0 && 'row-span-2')}
        >
          <ImageTile attachment={a} fill />
        </div>
      ))}
    </div>
  );
}

// ── Videos ────────────────────────────────────────────────────────────────

/**
 * A video plays in the bubble: a tall 9:16 box, black behind it, the browser's
 * own controls, its length in a chip until it starts. The first frame is the
 * poster (`#t=0.1`); a video sent from a chapter opens there (`startSec`), as it
 * does in the dealer's chat.
 */
function VideoMessage({ attachment }: { attachment: Attachment }) {
  const [started, setStarted] = React.useState(false);
  const from = attachment.startSec && attachment.startSec > 0 ? attachment.startSec : 0.1;
  return (
    <div
      className="relative w-full overflow-hidden rounded-md bg-black"
      style={{ aspectRatio: '9 / 16', maxHeight: 'min(72vh, 560px)' }}
    >
      <video
        src={`${attachment.url}#t=${from}`}
        controls
        playsInline
        preload="metadata"
        aria-label={attachment.filename}
        onPlay={() => setStarted(true)}
        className="absolute inset-0 h-full w-full object-contain"
      />
      {attachment.durationMs && !started ? (
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[12px] tabular-nums leading-tight text-white">
          {formatDuration(attachment.durationMs)}
        </span>
      ) : null}
    </div>
  );
}

// ── Documents ─────────────────────────────────────────────────────────────

type FileFlavour = 'pdf' | 'doc' | 'xls' | 'other';

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

/** What kind of paper a file is — from its name first, its type second, as the app decides. */
function fileFlavour(filename: string, contentType?: string): FileFlavour {
  const ext = extensionOf(filename);
  const mime = (contentType ?? '').toLowerCase();
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (
    ext === 'doc' ||
    ext === 'docx' ||
    mime === 'application/msword' ||
    mime.includes('wordprocessingml')
  ) {
    return 'doc';
  }
  if (
    ['xls', 'xlsx', 'xlsm', 'csv'].includes(ext) ||
    mime === 'application/vnd.ms-excel' ||
    mime.includes('spreadsheetml')
  ) {
    return 'xls';
  }
  return 'other';
}

/** The word on the badge: PDF, DOC, XLS, or the file's own extension. */
function fileTypeLabel(filename: string, contentType?: string): string {
  const flavour = fileFlavour(filename, contentType);
  if (flavour !== 'other') return flavour.toUpperCase();
  const ext = extensionOf(filename);
  return ext && ext.length <= 4 ? ext.toUpperCase() : 'FILE';
}

const BADGE_TONE: Record<FileFlavour, string> = {
  pdf: 'bg-danger',
  doc: 'bg-info',
  xls: 'bg-success',
  other: 'bg-neutral',
};

/**
 * A document: the coloured type badge, the name over two lines, "PDF · 1.2 MB".
 * The tap presigns a fresh link (the one that rode in with the message expires)
 * and goes through the native download bridge.
 */
function DocumentAttachment({ attachment }: { attachment: Attachment }) {
  const { download, downloading } = useDownload(attachment);
  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={downloading}
      aria-label={`Download ${attachment.filename}`}
      className="flex w-full min-w-[220px] items-center gap-3 rounded-md bg-black/[0.06] px-2.5 py-2 text-left hover:bg-black/10 disabled:opacity-70"
    >
      <span
        aria-hidden
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tracking-wide text-white',
          BADGE_TONE[fileFlavour(attachment.filename, attachment.contentType)],
        )}
      >
        {downloading ? (
          <Spinner size={14} />
        ) : (
          fileTypeLabel(attachment.filename, attachment.contentType)
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-[14px] leading-snug text-wa-bubble-text">
          {attachment.filename}
        </span>
        <span className="block text-[12px] text-wa-meta">
          {fileTypeLabel(attachment.filename, attachment.contentType)} ·{' '}
          {formatBytes(attachment.size)}
        </span>
      </span>
    </button>
  );
}

// ── One message's attachments ─────────────────────────────────────────────

export interface SplitAttachments {
  images: Attachment[];
  voices: Attachment[];
  videos: Attachment[];
  docs: Attachment[];
}

/**
 * Sort a message's attachments into what is drawn how. A picture or video with
 * no link to show from is drawn as a document row, whose tap signs a fresh one.
 */
export function splitAttachments(attachments: readonly Attachment[]): SplitAttachments {
  const out: SplitAttachments = { images: [], voices: [], videos: [], docs: [] };
  for (const a of attachments) {
    if (a.kind === 'image' && a.url) out.images.push(a);
    else if (a.kind === 'audio' && a.url) out.voices.push(a);
    else if (isVideoAttachment(a) && a.url) out.videos.push(a);
    else out.docs.push(a);
  }
  return out;
}

export function BubbleAttachments({
  attachments,
  mediaOverlay,
}: {
  attachments: readonly Attachment[];
  /** Drawn over the pictures' bottom-right corner: the time, when there is no caption. */
  mediaOverlay?: React.ReactNode;
}) {
  const { images, voices, videos, docs } = splitAttachments(attachments);
  return (
    <>
      {images.length > 0 ? (
        <div className="relative">
          <ImageAlbum images={images} />
          {mediaOverlay}
        </div>
      ) : null}
      {voices.map((a, i) => (
        <VoiceMessage key={`v-${i}`} attachment={a} />
      ))}
      {videos.map((a, i) => (
        <VideoMessage key={`vid-${i}`} attachment={a} />
      ))}
      {docs.map((a, i) => (
        <DocumentAttachment key={`d-${i}`} attachment={a} />
      ))}
    </>
  );
}
