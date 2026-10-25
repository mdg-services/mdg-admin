import { Play } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui';
import { fetchLeadRecordingAudio } from '@/hooks/api/useLeads';

/**
 * The recording that is playing right now. Starting another pauses it, so two
 * calls never talk over each other when somebody opens a second one.
 */
let playingNow: HTMLAudioElement | null = null;

/**
 * A link this close to running out is as good as run out. Pressing play on one
 * that is about to stop would play for a few seconds and then go silent.
 */
const EXPIRY_MARGIN_MS = 15_000;

/** Used when the server's "runs out at" cannot be read: a link is short-lived, so assume a few minutes. */
const FALLBACK_LIFE_MS = 5 * 60_000;

interface Link {
  /** Which link this is, counting from the first: a new one is a new player, even at an address that has not changed. */
  serial: number;
  url: string;
  /** When it stops working, in ms. */
  expiresAt: number;
  /** Where in the call to start, in seconds: the place it had reached when a link had to be replaced. */
  startAt: number;
  /** Start playing as soon as it can. */
  play: boolean;
}

/**
 * "Play" for one call recording, and then the browser's own player.
 *
 * The link is asked for when Play is pressed and never kept. The server hands
 * out a short-lived one, so a call opened in the morning and played again after
 * lunch needs a new link, and this asks for one by itself: when the player
 * errors (the link ran out, or the connection dropped half way) and when play
 * is pressed on a link that has run out. Either way it carries on from where
 * the call had got to, so nobody has to find their place again.
 *
 * One fresh link per failure. A fresh link that fails before it plays a single
 * second is not retried again; the person gets a sentence and a "Try again".
 *
 * Below md the button and the player are the full width of the card, and the
 * native player is 44px tall. A browser that will not start sound by itself
 * (some phone shells) still shows the player, paused and one tap from playing.
 */
export function RecordingPlayer({ leadId, recordingId }: { leadId: string; recordingId: string }) {
  const [link, setLink] = React.useState<Link | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  // A fresh link has been asked for and has not yet got as far as knowing the call's length.
  const replaced = React.useRef(false);
  // Where the call had got to when it last stopped, for "Try again".
  const reached = React.useRef(0);
  const alive = React.useRef(true);
  const links = React.useRef(0);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = React.useCallback(
    async (startAt: number, play: boolean) => {
      setBusy(true);
      setProblem(null);
      try {
        const audio = await fetchLeadRecordingAudio(leadId, recordingId);
        if (!alive.current) return;
        const at = Date.parse(audio.expiresAt);
        setLink({
          serial: ++links.current,
          url: audio.url,
          expiresAt: Number.isNaN(at) ? Date.now() + FALLBACK_LIFE_MS : at,
          startAt,
          play,
        });
      } catch (err) {
        if (!alive.current) return;
        setProblem(
          err instanceof Error && err.message
            ? err.message
            : 'Could not open this recording. Try again.',
        );
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [leadId, recordingId],
  );

  if (link && !problem) {
    return (
      <div className="w-full min-w-0">
        <audio
          // A new link is a new element: a link that failed leaves the old one in a state nothing resets.
          // Keyed on the count, not the address: two links asked for in the same second can be the same string.
          key={link.serial}
          controls
          preload="auto"
          src={link.url}
          autoPlay={link.play}
          aria-label="Call recording"
          className="h-11 w-full"
          onLoadedMetadata={(e) => {
            replaced.current = false;
            if (link.startAt > 0) e.currentTarget.currentTime = link.startAt;
          }}
          onTimeUpdate={(e) => {
            reached.current = e.currentTarget.currentTime;
          }}
          onPlay={(e) => {
            const el = e.currentTarget;
            if (playingNow && playingNow !== el) playingNow.pause();
            playingNow = el;
            if (Date.now() > link.expiresAt - EXPIRY_MARGIN_MS) {
              el.pause();
              void load(el.currentTime, true);
            }
          }}
          onError={(e) => {
            const at = e.currentTarget.currentTime || reached.current;
            reached.current = at;
            if (replaced.current) {
              setProblem('Could not play this recording.');
              return;
            }
            replaced.current = true;
            void load(at, true);
          }}
        >
          Your browser cannot play this recording.
        </audio>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 md:w-auto">
      <Button
        size="sm"
        variant="secondary"
        className="w-full md:w-auto"
        leftIcon={<Play width={15} height={15} strokeWidth={1.75} />}
        loading={busy}
        onClick={() => void load(reached.current, true)}
      >
        {problem ? 'Try again' : 'Play'}
      </Button>
      {problem ? (
        <p
          role="alert"
          className="mt-1.5 text-sm text-danger-strong [overflow-wrap:anywhere] md:text-danger"
        >
          {problem}
        </p>
      ) : null}
    </div>
  );
}
