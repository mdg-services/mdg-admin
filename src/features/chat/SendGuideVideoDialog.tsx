import { Video } from 'lucide-react';
import * as React from 'react';

import { Button, Dialog, Select, Skeleton, useToast } from '@/components/ui';
import { useGuideVideoLibrary } from '@/hooks/api/useGuideVideos';
import { useSendGuideVideo } from '@/hooks/api/useSendGuideVideo';
import { ApiError } from '@/lib/api';
import {
  chapterChoices,
  defaultVideo,
  describeVideoSent,
  metaLine,
  sendFailureMessage,
  startToSend,
  videoChoices,
} from '@/lib/chatGuideVideos';
import type { GuideVideoAdminItem } from '@dk/shared';

interface Props {
  open: boolean;
  onClose: () => void;
  conversationId: string | null | undefined;
}

/**
 * "Send a video": pick one of MDG's short Hindi guide videos from the library and
 * post it into the open chat, from the start or from a chapter. One tap on a row
 * picks it; a video that is not uploaded yet is listed but cannot be picked; Send
 * posts it.
 *
 * What is listed is the library itself (`GET /admin/guide-videos`), minus what the
 * chat must not carry — the team's own walkthroughs and the WhatsApp-only video —
 * so a new video appears here the day it is uploaded, with no change to this screen.
 */
export function SendGuideVideoDialog({ open, onClose, conversationId }: Props) {
  const toast = useToast();
  const send = useSendGuideVideo();
  const library = useGuideVideoLibrary(open);
  const choices = React.useMemo(() => videoChoices(library.data), [library.data]);
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const [startSec, setStartSec] = React.useState(0);

  // Opening starts on the first video that can be sent now; closing forgets the pick.
  React.useEffect(() => {
    if (!open) {
      setPickedId(null);
      setStartSec(0);
    }
  }, [open]);
  const picked: GuideVideoAdminItem | null =
    [...choices.howTo, ...choices.services].find((v) => v.id === pickedId && v.available) ?? defaultVideo(choices);
  const chapters = picked ? chapterChoices(picked) : [];

  function pick(v: GuideVideoAdminItem) {
    if (!v.available) return;
    setPickedId(v.id);
    setStartSec(0);
  }

  async function submit() {
    if (!conversationId || !picked) return;
    const start = startToSend(picked, startSec);
    try {
      await send.mutateAsync({ conversationId, video: picked.id, ...(start ? { startSec: start } : {}) });
      toast.success(describeVideoSent(picked, start));
      onClose();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? sendFailureMessage(err.code, err.message) : 'Could not send the video',
      );
    }
  }

  const row = (v: GuideVideoAdminItem) => {
    const on = picked?.id === v.id;
    return (
      <li key={v.id}>
        <button
          type="button"
          role="radio"
          aria-checked={on}
          aria-disabled={!v.available}
          disabled={!v.available}
          onClick={() => pick(v)}
          className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            on ? 'border-brand bg-surface-muted' : 'border-border hover:bg-surface-muted'
          }`}
        >
          <Video width={15} height={15} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block break-words text-sm font-medium">{v.title.en}</span>
            <span className="block text-xs text-muted-foreground">{metaLine(v)}</span>
            <span className="block break-words text-xs text-muted-foreground">{v.summary.en}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Send a video"
      description="A short Hindi video goes into this chat. The dealer taps it to play."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={send.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={send.isPending} disabled={!conversationId || !picked}>
            Send
          </Button>
        </>
      }
    >
      {library.isPending ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : library.isError ? (
        <div className="space-y-2 text-sm">
          <p>The video list did not load.</p>
          <Button variant="secondary" size="sm" onClick={() => void library.refetch()}>
            Try again
          </Button>
        </div>
      ) : choices.howTo.length + choices.services.length === 0 ? (
        <p className="text-sm text-muted-foreground">There are no videos to send yet.</p>
      ) : (
        <div className="space-y-4">
          {choices.howTo.length > 0 ? (
            <section aria-label="How to use the app">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                How to use the app
              </h3>
              <ul className="space-y-2" role="radiogroup" aria-label="Video">
                {choices.howTo.map(row)}
              </ul>
            </section>
          ) : null}
          {choices.services.length > 0 ? (
            <section aria-label="What each service is">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                What each service is
              </h3>
              <ul className="space-y-2" role="radiogroup" aria-label="Service video">
                {choices.services.map(row)}
              </ul>
            </section>
          ) : null}
          {chapters.length > 0 ? (
            <div>
              <label htmlFor="send-video-start" className="mb-1 block text-xs font-medium text-muted-foreground">
                Start at
              </label>
              <Select
                id="send-video-start"
                value={String(startSec)}
                onChange={(e) => setStartSec(Number(e.target.value))}
              >
                {chapters.map((c) => (
                  <option key={c.startSec} value={String(c.startSec)}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
