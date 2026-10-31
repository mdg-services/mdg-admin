import { FileText, ImageOff, MapPin, Play, RotateCw } from 'lucide-react';
import * as React from 'react';

import { GuideVideoPlayer } from '@/components/ui/GuideVideoPlayer';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { VideoPoster } from '@/components/ui/VideoPoster';
import { useGuideVideoLibrary } from '@/hooks/api/useGuideVideos';
import { openWhatsAppMedia, useWhatsAppMedia } from '@/hooks/api/useWhatsAppMedia';
import { lengthLabel } from '@/lib/chatGuideVideos';
import { cn } from '@/lib/cn';
import type { WhatsAppChatMessage } from '@dk/shared';

import { FILE_OPENS_ON_COMPUTER_WORDS, MEDIA_GONE_WORDS, type MediaKind, unshownWords } from './format';
import { useOnceVisible } from './useInView';

/**
 * Photos and voice notes are drawn inside a box of one fixed width whose
 * height is reserved before the file arrives. The thread is pinned to its
 * bottom, so a picture that arrived and pushed everything down would shove the
 * message being read out of sight.
 */
const BOX = 'w-[min(16rem,70vw)]';

/** A line in a bubble about something that cannot be shown: muted and small. */
function Muted({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[13px] italic text-[var(--wa-meta)]">
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </p>
  );
}

function RetryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-[var(--wa-link)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0 md:py-1"
    >
      <RotateCw width={13} height={13} strokeWidth={2} aria-hidden />
      {children}
    </button>
  );
}

/** What stands in for a file that is not there: a reason, in words, in the space the file would have had. */
function Unavailable({
  state,
  retry,
  className,
}: {
  state: { status: 'gone' | 'missing' | 'error'; message?: string };
  retry: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start justify-center gap-1 rounded-md bg-black/[0.05] p-3',
        className,
      )}
    >
      {state.status === 'error' ? (
        <>
          <Muted icon={<ImageOff width={14} height={14} strokeWidth={1.75} />}>
            {state.message ?? 'Could not load this file.'}
          </Muted>
          <RetryButton onClick={retry}>Try again</RetryButton>
        </>
      ) : state.status === 'gone' ? (
        <Muted icon={<ImageOff width={14} height={14} strokeWidth={1.75} />}>{MEDIA_GONE_WORDS}</Muted>
      ) : (
        <Muted icon={<ImageOff width={14} height={14} strokeWidth={1.75} />}>There is no file for this message.</Muted>
      )}
    </div>
  );
}

function Loading({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center rounded-md bg-black/[0.06]', className)}>
      <Spinner size={18} className="text-[var(--wa-meta)]" />
    </div>
  );
}

function ImageMedia({
  message,
  overlay,
  onOpenImage,
}: {
  message: WhatsAppChatMessage;
  overlay?: React.ReactNode;
  onOpenImage: (src: string, alt: string) => void;
}) {
  const [ref, seen] = useOnceVisible<HTMLDivElement>();
  const { state, retry } = useWhatsAppMedia(message.id, seen);
  return (
    <div ref={ref} className={cn('relative aspect-[4/3] overflow-hidden rounded-md', BOX)}>
      {state.status === 'ready' ? (
        <button
          type="button"
          aria-label="Open photo"
          onClick={() => onOpenImage(state.url, message.text ?? 'Photo from the chat')}
          className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <img
            src={state.url}
            alt={message.text ?? 'Photo from the chat'}
            draggable={false}
            className="h-full w-full object-cover"
          />
        </button>
      ) : state.status === 'idle' || state.status === 'loading' ? (
        <Loading className="h-full w-full" />
      ) : (
        <Unavailable state={state} retry={retry} className="h-full w-full" />
      )}
      {overlay}
    </div>
  );
}

/**
 * One of MDG's guide videos, sent from "Send a video". It went by a link to our
 * own storage, so Meta holds no file of it to fetch: the picture comes from the
 * video library, and a tap plays the library's copy here, from the start, as the
 * person's WhatsApp plays it. The words under it are the bubble's text.
 */
function GuideVideoMedia({ video }: { video: NonNullable<WhatsAppChatMessage['guideVideo']> }) {
  const [ref, seen] = useOnceVisible<HTMLDivElement>();
  const [playing, setPlaying] = React.useState(false);
  const library = useGuideVideoLibrary(seen);
  const item = library.data?.find((v) => v.id === video.id);
  const title = video.title?.en ?? item?.title.en ?? 'MDG video';
  return (
    <div ref={ref} className={cn('grid gap-1', BOX)}>
      {playing ? (
        <GuideVideoPlayer
          id={video.id}
          startSec={0}
          title={title}
          shape="portrait"
          compact
          autoPlay
          poster={item?.posterUrl ?? null}
          showChapters={false}
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play ${title}`}
          className="block w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <VideoPoster
            src={item?.posterUrl ?? null}
            length={item ? lengthLabel(item.durationMs) : ''}
            className="aspect-[4/3] w-full rounded-md"
          />
        </button>
      )}
      <p className="text-xs font-medium text-[var(--wa-meta)] [overflow-wrap:anywhere]">MDG video · {title}</p>
    </div>
  );
}

function StickerMedia({ message, overlay }: { message: WhatsAppChatMessage; overlay?: React.ReactNode }) {
  const [ref, seen] = useOnceVisible<HTMLDivElement>();
  const { state, retry } = useWhatsAppMedia(message.id, seen);
  return (
    <div ref={ref} className="relative h-32 w-32">
      {state.status === 'ready' ? (
        <img src={state.url} alt="Sticker" draggable={false} className="h-full w-full object-contain" />
      ) : state.status === 'idle' || state.status === 'loading' ? (
        <Loading className="h-full w-full" />
      ) : (
        <Unavailable state={state} retry={retry} className="h-full w-full" />
      )}
      {overlay}
    </div>
  );
}

function AudioMedia({ message }: { message: WhatsAppChatMessage }) {
  const [ref, seen] = useOnceVisible<HTMLDivElement>();
  const { state, retry } = useWhatsAppMedia(message.id, seen);
  return (
    <div ref={ref} className={cn('min-h-10', BOX)}>
      {state.status === 'ready' ? (
        // `preload="metadata"`: the bytes are already here, this only stops the
        // element asking for them a second time.
        <audio controls preload="metadata" src={state.url} className="h-10 w-full">
          Your browser cannot play this voice note.
        </audio>
      ) : state.status === 'idle' || state.status === 'loading' ? (
        <Loading className="h-10 w-full" />
      ) : (
        <Unavailable state={state} retry={retry} />
      )}
    </div>
  );
}

/** A video is not fetched until it is asked for: it can be many megabytes, and most are never played. */
function VideoMedia({ message, overlay }: { message: WhatsAppChatMessage; overlay?: React.ReactNode }) {
  const [wanted, setWanted] = React.useState(false);
  const { state, retry } = useWhatsAppMedia(message.id, wanted);
  return (
    <div className={cn('relative aspect-video overflow-hidden rounded-md bg-black/80', BOX)}>
      {state.status === 'ready' ? (
        <video
          controls
          autoPlay
          playsInline
          preload="none"
          src={state.url}
          className="h-full w-full bg-black object-contain"
        >
          Your browser cannot play this video.
        </video>
      ) : state.status === 'loading' ? (
        <Loading className="h-full w-full bg-transparent text-white" />
      ) : state.status === 'idle' ? (
        <button
          type="button"
          onClick={() => setWanted(true)}
          aria-label="Play video"
          className="flex h-full w-full items-center justify-center text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55">
            <Play width={22} height={22} strokeWidth={2} fill="currentColor" aria-hidden />
          </span>
        </button>
      ) : (
        <Unavailable state={state} retry={retry} className="h-full w-full bg-[var(--wa-in)]" />
      )}
      {state.status === 'ready' ? null : overlay}
    </div>
  );
}

function DocumentMedia({ message }: { message: WhatsAppChatMessage }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const name = message.media?.filename?.trim() || 'Document';

  async function open() {
    if (busy) return;
    setBusy(true);
    try {
      // In the native app nothing can open it; say so, instead of a tap that does nothing.
      if ((await openWhatsAppMedia(message.id, name)) === 'not-here') toast.info(FILE_OPENS_ON_COMPUTER_WORDS);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open this file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('flex items-center gap-3 rounded-md bg-black/[0.06] p-2', BOX)}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-black/[0.07] text-[var(--wa-meta)]">
        <FileText width={20} height={20} strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium [overflow-wrap:anywhere]">{name}</span>
        {message.media?.mime ? (
          <span className="block truncate text-xs text-[var(--wa-meta)]">{message.media.mime}</span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-[var(--wa-link)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60 md:min-h-8"
      >
        {busy ? <Spinner size={14} /> : null}
        Open
      </button>
    </div>
  );
}

function LocationMedia({ message }: { message: WhatsAppChatMessage }) {
  const loc = message.location;
  if (!loc) return <Muted>{unshownWords('location')}</Muted>;
  return (
    <div className={cn('rounded-md bg-black/[0.06] p-2', BOX)}>
      <p className="flex items-start gap-2">
        <MapPin width={18} height={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger" aria-hidden />
        <span className="min-w-0 text-sm [overflow-wrap:anywhere]">
          <span className="block font-medium">{loc.name?.trim() || 'Shared location'}</span>
          {loc.address ? <span className="block text-[var(--wa-meta)]">{loc.address}</span> : null}
        </span>
      </p>
      <a
        href={`https://maps.google.com/?q=${loc.latitude},${loc.longitude}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--wa-link)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-8"
      >
        Open in Maps
      </a>
    </div>
  );
}

export interface MessageMediaProps {
  message: WhatsAppChatMessage;
  kind: MediaKind;
  /** The time and ticks, to lay over a picture that has no caption under it. */
  overlay?: React.ReactNode;
  onOpenImage: (src: string, alt: string) => void;
}

/**
 * Whatever a message carries besides words, drawn the way WhatsApp draws it.
 *
 * Only what somebody sent us can be fetched (the server serves a file by the id
 * of the message it arrived on), so anything on our own side, a contact card,
 * or a kind this screen does not know is said in plain words rather than left
 * blank — except one of MDG's guide videos, which plays from the library. A
 * file Meta has dropped says so, and why — it keeps them about thirty days —
 * rather than showing a broken picture.
 */
export function MessageMedia({ message, kind, overlay, onOpenImage }: MessageMediaProps) {
  const inbound = message.direction === 'in';
  const fetchable = inbound && message.media !== null && ['image', 'sticker', 'audio', 'video', 'document'].includes(kind);

  if (kind === 'location') return <LocationMedia message={message} />;
  if (!inbound && kind === 'video' && message.guideVideo) return <GuideVideoMedia video={message.guideVideo} />;
  if (!fetchable) return <Muted>{unshownWords(message.kind)}</Muted>;
  if (message.media && !message.media.available) {
    return (
      <Muted icon={<ImageOff width={14} height={14} strokeWidth={1.75} />}>{MEDIA_GONE_WORDS}</Muted>
    );
  }
  switch (kind) {
    case 'image':
      return <ImageMedia message={message} overlay={overlay} onOpenImage={onOpenImage} />;
    case 'sticker':
      return <StickerMedia message={message} overlay={overlay} />;
    case 'audio':
      return <AudioMedia message={message} />;
    case 'video':
      return <VideoMedia message={message} overlay={overlay} />;
    default:
      return <DocumentMedia message={message} />;
  }
}

/**
 * Whether the time and ticks can be laid over this message's picture, so a photo
 * with no caption needs no row of its own under it. Only when a picture is
 * actually going to be drawn: a notice that it is gone is text, and the time
 * goes in the row beneath it like any other.
 */
export function overlayFits(message: WhatsAppChatMessage, kind: MediaKind): boolean {
  return (
    (kind === 'image' || kind === 'sticker' || kind === 'video') &&
    message.direction === 'in' &&
    message.media !== null &&
    message.media.available
  );
}
