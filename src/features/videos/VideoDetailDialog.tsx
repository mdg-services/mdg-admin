import { ExternalLink } from 'lucide-react';
import * as React from 'react';

import { Badge, Button, Copyable, Dialog } from '@/components/ui';
import { GuideVideoPlayer } from '@/components/ui/GuideVideoPlayer';
import { lengthLabel } from '@/lib/chatGuideVideos';
import { serviceLabel } from '@/lib/serviceLabel';
import { libraryTag, limitWords, sendNote, videoShape } from '@/lib/videoLibrary';
import type { GuideVideoAdminItem } from '@dk/shared';

/**
 * One video, opened from the library: it plays (from the chapter a search found),
 * and beside it is everything the library says about it — what it teaches, when
 * the team sends it, the words people type for it, where it is limited, and for a
 * public explainer the page to share. Whether it can be sent into a chat is said in
 * words, never left for the admin to discover at the Send button.
 */
export function VideoDetailDialog({
  video,
  startSec,
  onClose,
}: {
  video: GuideVideoAdminItem | null;
  startSec: number;
  onClose: () => void;
}) {
  const open = video !== null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={video?.title.en ?? ''}
      description={video ? `${video.title.hi} · ${[lengthLabel(video.durationMs), libraryTag(video)].filter(Boolean).join(' · ')}` : undefined}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {video ? <Body video={video} startSec={startSec} /> : null}
    </Dialog>
  );
}

function Body({ video, startSec }: { video: GuideVideoAdminItem; startSec: number }) {
  const note = sendNote(video);
  const limits = limitWords(video, serviceLabel);
  return (
    <div className="grid gap-4">
      {video.available ? (
        <GuideVideoPlayer
          key={`${video.id}:${startSec}`}
          id={video.id}
          startSec={startSec}
          title={video.title.en}
          shape={videoShape(video)}
          poster={video.posterUrl}
        />
      ) : (
        <p className="rounded-md border border-border bg-surface-2 p-3 text-sm text-text-muted">
          This video is in the library but its file is not uploaded yet, so it cannot be played here.
        </p>
      )}

      <section className="grid gap-1">
        <p className="text-sm text-text">{video.summary.en}</p>
        <p lang="hi" className="text-sm text-text-muted">
          {video.summary.hi}
        </p>
      </section>

      {note || limits.length > 0 ? (
        <section className="flex flex-wrap gap-1.5">
          {note ? <Badge intent={video.audience === 'admin' ? 'neutral' : 'warning'}>{note}</Badge> : null}
          {limits.map((l) => (
            <Badge key={l} intent="info">
              {l}
            </Badge>
          ))}
        </section>
      ) : null}

      {video.sendWhen.length > 0 ? (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
            {video.audience === 'admin' ? 'Watch it when' : 'Send it when'}
          </h3>
          <ul className="grid gap-0.5 pl-4 text-sm text-text [list-style:disc]">
            {video.sendWhen.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {video.publicUrl ? (
        <section className="grid gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">Public page</h3>
          <Copyable value={video.publicUrl.hi} label="Hindi" toastLabel="Link copied" />
          <Copyable value={video.publicUrl.en} label="English" toastLabel="Link copied" />
          <a
            href={video.publicUrl.hi}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1 text-sm font-medium text-brand underline-offset-2 hover:underline"
          >
            Open on mdgservices.in
            <ExternalLink width={13} height={13} strokeWidth={1.75} aria-hidden />
          </a>
        </section>
      ) : null}

      {video.aliases.length > 0 ? (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
            Found by these words
          </h3>
          <p className="flex flex-wrap gap-1">
            {video.aliases.map((a) => (
              <span key={a} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-text-muted">
                {a}
              </span>
            ))}
          </p>
        </section>
      ) : null}
    </div>
  );
}
