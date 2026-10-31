import * as React from 'react';

import { Badge, VideoPoster } from '@/components/ui';
import { clockLabel, lengthLabel } from '@/lib/chatGuideVideos';
import { cn } from '@/lib/cn';
import { libraryTag, videoShape } from '@/lib/videoLibrary';
import type { GuideVideoAdminItem, SearchableChapter } from '@dk/shared';

/**
 * One video on the library page: its picture, title, who it is for and one line
 * on what it teaches. A search hit inside a chapter says which part, and opening
 * the card starts the video there.
 */
export function VideoCard({
  video,
  chapter,
  onOpen,
}: {
  video: GuideVideoAdminItem;
  /** The chapter a search found its words in, when it is not the first. */
  chapter?: SearchableChapter | null;
  onOpen: (video: GuideVideoAdminItem, startSec: number) => void;
}) {
  const landscape = videoShape(video) === 'landscape';
  return (
    <button
      type="button"
      onClick={() => onOpen(video, chapter?.startSec ?? 0)}
      className="group grid w-full content-start gap-2 rounded-lg border border-border bg-surface p-2 text-left transition-colors hover:border-border-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <VideoPoster
        src={video.posterUrl}
        length={lengthLabel(video.durationMs)}
        className={cn('w-full', landscape ? 'aspect-video' : 'aspect-[4/3]')}
      />
      <span className="grid gap-1 px-1 pb-1">
        <span className="line-clamp-2 break-words text-sm font-medium text-text">
          {video.title.en}
        </span>
        <span lang="hi" className="line-clamp-1 break-words text-xs text-text-muted">
          {video.title.hi}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge
            intent={
              video.family === 'explainer'
                ? 'info'
                : video.audience === 'admin'
                  ? 'neutral'
                  : 'success'
            }
          >
            {libraryTag(video)}
          </Badge>
          {!video.available ? <Badge intent="warning">Not uploaded</Badge> : null}
        </span>
        {chapter ? (
          <span className="text-xs text-brand">
            Starts at {clockLabel(chapter.startSec)} · {chapter.label.en}
          </span>
        ) : (
          <span className="line-clamp-2 break-words text-xs text-text-muted">
            {video.summary.en}
          </span>
        )}
      </span>
    </button>
  );
}
