import { ExternalLink, Link2, Send } from 'lucide-react';
import * as React from 'react';

import { Button, VideoPoster } from '@/components/ui';
import { useGuideVideoLibrary } from '@/hooks/api/useGuideVideos';
import { canSendNow, clockLabel, lengthLabel } from '@/lib/chatGuideVideos';
import type { ReplyHelperChannel, ReplyHelperVideo } from '@dk/shared';

/**
 * The videos the helper suggests sending with its reply, under the drafts.
 *
 * A tap on "Preview and send" opens "Send a video" on that video and chapter, where
 * the admin can watch it and press Send — nothing goes to anyone from here. In the
 * app chat it goes into the chat; on WhatsApp as a video message (while the chat's
 * 24-hour window is open, which the dialog checks). A public explainer suggested on
 * WhatsApp can instead have its page link put in the reply box, after whatever is
 * already there.
 *
 * The picture and length come from the library (already loaded for the inbox's
 * own "Send a video"); a video the library no longer holds is still named, from
 * the words stored with the suggestion, and simply cannot be sent.
 */
export function SuggestedVideos({
  videos,
  openChannel,
  onSend,
  onAddLink,
}: {
  videos: ReplyHelperVideo[];
  openChannel: ReplyHelperChannel;
  /** Open "Send a video" on this one. */
  onSend?: (video: ReplyHelperVideo) => void;
  /** WhatsApp: put this link in the reply box. */
  onAddLink?: (link: string) => void;
}) {
  const library = useGuideVideoLibrary(videos.length > 0);
  if (videos.length === 0) return null;
  return (
    <section className="grid gap-2" aria-label="Videos to send with the reply">
      <p className="text-xs font-semibold text-text-muted">
        {videos.length === 1 ? 'A video to send with it' : 'Videos to send with it'}
      </p>
      <ul className="grid gap-2">
        {videos.map((v) => {
          const item = library.data?.find((x) => x.id === v.id);
          const chapter =
            v.startSec > 0 ? item?.chapters.find((c) => c.startSec === v.startSec) : undefined;
          const sendable = item ? canSendNow(item, openChannel) : false;
          return (
            <li
              key={v.id}
              className="flex gap-2.5 rounded-lg border border-assist-line bg-surface p-2"
            >
              <VideoPoster
                src={item?.posterUrl ?? null}
                length={item ? lengthLabel(item.durationMs) : ''}
                play={false}
                className="h-[72px] w-[54px] shrink-0"
              />
              <div className="grid min-w-0 flex-1 content-start gap-1">
                <p className="break-words text-sm font-medium text-text">{v.title.en}</p>
                {chapter ? (
                  <p className="text-xs text-text-muted">
                    From {clockLabel(chapter.startSec)} · {chapter.label.en}
                  </p>
                ) : null}
                {v.why ? <p className="break-words text-xs text-text-muted">{v.why}</p> : null}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {sendable || !v.link ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!sendable || !onSend}
                      title={sendable ? undefined : 'Not uploaded yet'}
                      onClick={() => onSend?.(v)}
                      leftIcon={<Send width={14} height={14} strokeWidth={1.75} />}
                    >
                      Preview and send
                    </Button>
                  ) : null}
                  {openChannel === 'whatsapp' && v.link ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!onAddLink}
                        onClick={() => v.link && onAddLink?.(v.link)}
                        leftIcon={<Link2 width={14} height={14} strokeWidth={1.75} />}
                      >
                        Add link to reply
                      </Button>
                      <a
                        href={v.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-1 text-xs font-medium text-brand underline-offset-2 hover:underline"
                      >
                        Open
                        <ExternalLink width={12} height={12} strokeWidth={1.75} aria-hidden />
                      </a>
                    </>
                  ) : null}
                  {!sendable && !v.link ? (
                    <span className="self-center text-xs text-text-subtle">
                      Not uploaded to the chat library yet
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
