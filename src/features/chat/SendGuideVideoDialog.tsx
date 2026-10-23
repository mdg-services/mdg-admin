import { Video } from 'lucide-react';
import * as React from 'react';

import { Button, Dialog, useToast } from '@/components/ui';
import { useSendGuideVideo } from '@/hooks/api/useSendGuideVideo';
import { ApiError } from '@/lib/api';
import { GUIDE_VIDEO_CHOICES, describeVideoSent } from '@/lib/chatGuideVideos';
import type { GuideVideoId } from '@dk/shared';

interface Props {
  open: boolean;
  onClose: () => void;
  conversationId: string | null | undefined;
}

/**
 * "Send a video": pick one of MDG's short Hindi guide videos and post it into
 * the open chat. One tap on a row picks it; Send posts it.
 */
export function SendGuideVideoDialog({ open, onClose, conversationId }: Props) {
  const toast = useToast();
  const send = useSendGuideVideo();
  const [picked, setPicked] = React.useState<GuideVideoId>('app_tour');

  React.useEffect(() => {
    if (open) setPicked('app_tour');
  }, [open]);

  async function submit() {
    if (!conversationId) return;
    try {
      await send.mutateAsync({ conversationId, video: picked });
      toast.success(describeVideoSent(picked));
      onClose();
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.code === 'VIDEO_NOT_UPLOADED'
          ? 'That video is not uploaded yet.'
          : err instanceof ApiError
            ? err.message
            : 'Could not send the video',
      );
    }
  }

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
          <Button onClick={() => void submit()} loading={send.isPending} disabled={!conversationId}>
            Send
          </Button>
        </>
      }
    >
      <ul className="space-y-2" role="radiogroup" aria-label="Video">
        {GUIDE_VIDEO_CHOICES.map((c) => {
          const on = picked === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPicked(c.id)}
                className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                  on ? 'border-brand bg-surface-muted' : 'border-border hover:bg-surface-muted'
                }`}
              >
                <Video width={15} height={15} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{c.title}</span>
                  <span className="block text-xs text-muted-foreground">{c.when}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
