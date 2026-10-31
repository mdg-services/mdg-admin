import { Eye, Search, X } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Dialog,
  IconButton,
  Input,
  Select,
  Skeleton,
  VideoPoster,
  useToast,
} from '@/components/ui';
import { GuideVideoPlayer } from '@/components/ui/GuideVideoPlayer';
import { useGuideVideoLibrary } from '@/hooks/api/useGuideVideos';
import { useSendGuideVideo } from '@/hooks/api/useSendGuideVideo';
import { ApiError } from '@/lib/api';
import {
  allChoices,
  canSendNow,
  chapterChoices,
  clockLabel,
  defaultVideo,
  describeVideoSent,
  lengthLabel,
  metaLine,
  searchChoices,
  sendFailureMessage,
  startToSend,
  videoChoices,
} from '@/lib/chatGuideVideos';
import { cn } from '@/lib/cn';
import type { GuideVideoAdminItem, SearchableChapter } from '@dk/shared';

interface Props {
  open: boolean;
  onClose: () => void;
  conversationId: string | null | undefined;
  /** Open on this video (the Reply helper's suggestion), from this chapter. */
  initialVideoId?: string | null;
  initialStartSec?: number;
}

/**
 * "Send a video": find one of MDG's short Hindi videos, watch it, and post it into
 * the open chat, from the start or from a chapter.
 *
 * FIND: a search over the whole library (Hindi, English, Hindi in English letters,
 * every chapter's words), or the three shelves — how to use the app, one video per
 * service, and the public pump-knowledge explainers. Every row shows the video's
 * picture. A hit inside a chapter picks that chapter.
 * WATCH: "Preview" plays the picked video here, before anything is sent.
 * SEND: posts it. A video that is not uploaded yet is listed but cannot be picked.
 *
 * What is listed is the library itself (`GET /admin/guide-videos`), minus what the
 * chat must not carry — the team's own walkthroughs and the WhatsApp-only video —
 * so a new video appears here the day it is uploaded, with no change to this screen.
 */
export function SendGuideVideoDialog({
  open,
  onClose,
  conversationId,
  initialVideoId,
  initialStartSec,
}: Props) {
  const toast = useToast();
  const send = useSendGuideVideo();
  const library = useGuideVideoLibrary(open);
  const choices = React.useMemo(() => videoChoices(library.data), [library.data]);
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const [startSec, setStartSec] = React.useState(0);
  const [query, setQuery] = React.useState('');
  const [previewing, setPreviewing] = React.useState(false);

  // Opening starts on the suggested video when there is one, else the first that can
  // be sent now; closing forgets the pick, the search and the preview.
  React.useEffect(() => {
    if (open) {
      setPickedId(initialVideoId ?? null);
      setStartSec(initialStartSec ?? 0);
    } else {
      setPickedId(null);
      setStartSec(0);
      setQuery('');
      setPreviewing(false);
    }
  }, [open, initialVideoId, initialStartSec]);

  const everything = allChoices(choices);
  const searching = query.trim().length > 0;
  const hits = React.useMemo(
    () => (searching ? searchChoices(choices, query) : []),
    [choices, query, searching],
  );
  const chosen: GuideVideoAdminItem | null =
    everything.find((v) => v.id === pickedId && canSendNow(v)) ?? defaultVideo(choices);
  // While a search is on screen, only a video in its results can be the one sent: a pick
  // the results hide would go out unseen. Picking a result (or clearing the search) sets it.
  const picked = searching && !hits.some((h) => h.item.id === chosen?.id) ? null : chosen;
  const chapters = picked ? chapterChoices(picked) : [];

  function pick(v: GuideVideoAdminItem, chapter?: SearchableChapter | null) {
    if (!canSendNow(v)) return;
    setPickedId(v.id);
    setStartSec(chapter?.startSec ?? 0);
    setPreviewing(false);
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

  const row = (v: GuideVideoAdminItem, chapter?: SearchableChapter | null) => {
    const on = picked?.id === v.id;
    const can = canSendNow(v);
    return (
      <li key={v.id}>
        <button
          type="button"
          role="radio"
          aria-checked={on}
          aria-disabled={!can}
          disabled={!can}
          onClick={() => pick(v, chapter)}
          className={cn(
            'flex w-full items-start gap-3 rounded-lg border p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
            on ? 'border-brand bg-surface-muted' : 'border-border hover:bg-surface-muted',
          )}
        >
          <VideoPoster
            src={v.posterUrl}
            length={lengthLabel(v.durationMs)}
            play={false}
            className="h-[72px] w-[54px] shrink-0"
          />
          <span className="min-w-0">
            <span className="block break-words text-sm font-medium">{v.title.en}</span>
            <span className="block text-xs text-muted-foreground">{metaLine(v)}</span>
            {chapter ? (
              <span className="block text-xs text-brand">
                From {clockLabel(chapter.startSec)} · {chapter.label.en}
              </span>
            ) : (
              <span className="line-clamp-2 break-words text-xs text-muted-foreground">
                {v.summary.en}
              </span>
            )}
          </span>
        </button>
      </li>
    );
  };

  const shelf = (title: string, list: GuideVideoAdminItem[]) =>
    list.length > 0 ? (
      <section aria-label={title}>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <ul className="space-y-2" role="radiogroup" aria-label={title}>
          {list.map((v) => row(v))}
        </ul>
      </section>
    ) : null;

  const list = searching ? (
    hits.length === 0 ? (
      <p className="text-sm text-muted-foreground">
        No video matches. Try a shorter word, or Hindi or English.
      </p>
    ) : (
      <ul className="space-y-2" role="radiogroup" aria-label="Matching videos">
        {hits.map((h) => row(h.item, h.chapter))}
      </ul>
    )
  ) : (
    <div className="space-y-4">
      {shelf('How to use the app', choices.howTo)}
      {shelf('What each service is', choices.services)}
      {shelf('Pump know-how', choices.explainers)}
    </div>
  );

  const preview = !picked ? (
    searching && hits.length > 0 ? (
      <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
        Pick a video from the results to send it.
      </p>
    ) : null
  ) : (
    <aside className="grid content-start gap-2 rounded-lg border border-border bg-surface-2 p-3 md:sticky md:top-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sending</p>
      <p className="break-words text-sm font-medium">{picked.title.en}</p>
      {previewing ? (
        <GuideVideoPlayer
          key={`${picked.id}:${startSec}`}
          id={picked.id}
          startSec={startSec}
          title={picked.title.en}
          shape="portrait"
          compact
          poster={picked.posterUrl}
          showChapters={false}
        />
      ) : (
        <button
          type="button"
          onClick={() => setPreviewing(true)}
          className="block w-full"
          aria-label={`Preview ${picked.title.en}`}
        >
          <VideoPoster
            src={picked.posterUrl}
            length={lengthLabel(picked.durationMs)}
            className="aspect-[4/3] w-full"
          />
        </button>
      )}
      {chapters.length > 0 ? (
        <div>
          <label
            htmlFor="send-video-start"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
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
      {!previewing ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPreviewing(true)}
          leftIcon={<Eye width={15} height={15} strokeWidth={1.75} />}
        >
          Preview
        </Button>
      ) : null}
    </aside>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Send a video"
      description="A short Hindi video goes into this chat. The dealer taps it to play."
      size="lg"
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
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : library.isError ? (
        <div className="space-y-2 text-sm">
          <p>The video list did not load.</p>
          <Button variant="secondary" size="sm" onClick={() => void library.refetch()}>
            Try again
          </Button>
        </div>
      ) : everything.length === 0 ? (
        <p className="text-sm text-muted-foreground">There are no videos to send yet.</p>
      ) : (
        <div className="grid gap-3">
          <div className="relative">
            <Search
              width={16}
              height={16}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
              aria-hidden
            />
            <Input
              type="text"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search: manager, variation, पासवर्ड, tanker…"
              aria-label="Search the videos"
              className="pl-9 pr-9"
            />
            {query ? (
              <IconButton
                aria-label="Clear the search"
                onClick={() => setQuery('')}
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
              >
                <X width={15} height={15} strokeWidth={1.75} />
              </IconButton>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px] md:items-start">
            <div className="min-w-0">{list}</div>
            {preview}
          </div>
        </div>
      )}
    </Dialog>
  );
}
