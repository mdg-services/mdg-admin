import { ExternalLink, PlayCircle } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';
import { type GuideVideo, guideUrl, videosForSurface } from '@/lib/guideVideos';

import { Button } from './Button';
import { Dialog } from './Dialog';
import { IconButton } from './IconButton';

/**
 * "How this works" — the guided-video affordance, on any screen that has one.
 *
 * Generalised out of `CreditDodHelpCta`, which was this exact button and dialog
 * with its two videos written into the component. That worked, and it got used
 * on two surfaces out of roughly ninety-five, because every other screen would
 * have had to fork it. Here the screen names itself and `guideVideos.ts` decides
 * what that name is worth.
 *
 * ── IT RENDERS NOTHING WHEN THERE IS NOTHING ───────────────────────────────
 *
 * A surface with no videos returns `null` — not a disabled button, not a
 * tooltip explaining that help is coming. That is what lets the button be
 * placed on every screen in one pass while the videos are still being made:
 * each one appears by itself on the day its video ships, and until then the
 * screen looks exactly as it does today. A disabled control would be worse than
 * nothing, because it spends a person's attention to tell them they cannot have
 * what it is offering.
 *
 * ── ONE VIDEO STILL OPENS THE CHOOSER ──────────────────────────────────────
 *
 * It would be tempting to make a single video open the guide directly and skip
 * the dialog. It does not, for two reasons. The dialog says how long the video
 * is before it costs anybody four minutes to find out, and it says out loud that
 * the link leaves the portal — an ops person mid-task deserves to know a click
 * is about to move them somewhere else. Both matter more than the saved tap.
 */
export interface HowThisWorksProps {
  /** The surface's id in `guideVideos.ts`. */
  surface: string;
  /**
   * The dialog's heading — the feature's name as the screen says it. The word
   * "guided videos" is appended, so pass "Daily Sales Report", not
   * "Daily Sales Report videos".
   */
  label?: string;
  /**
   * `'button'` is the default: a small secondary button carrying the words.
   * `'icon'` is a bare play glyph for a row of controls with no room for four
   * more words — a card header beside three other actions, a dense toolbar.
   * The words are the better default; reach for the icon when the alternative
   * is the button wrapping onto its own line.
   */
  variant?: 'button' | 'icon';
  className?: string;
}

function VideoRow({ v }: { v: GuideVideo }) {
  return (
    <a
      href={guideUrl(v)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 rounded-md border border-border bg-surface p-3 hover:bg-surface-2"
    >
      <span className="mt-0.5 shrink-0 text-brand" aria-hidden>
        <PlayCircle width={22} height={22} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-text">
          {v.title}
          <ExternalLink
            width={12}
            height={12}
            strokeWidth={1.75}
            className="shrink-0 text-text-subtle"
            aria-hidden
          />
        </span>
        <span className="mt-0.5 block text-sm text-text-muted">{v.blurb}</span>
        <span className="mt-1 block text-xs text-text-subtle">
          {v.minutes}
          {v.at ? ' · starts at the relevant part' : ''} · opens the MDG guide in a new
          tab
        </span>
      </span>
    </a>
  );
}

export function HowThisWorks({
  surface,
  label,
  variant = 'button',
  className,
}: HowThisWorksProps) {
  const [open, setOpen] = React.useState(false);
  const videos = videosForSurface(surface);

  // The whole reason a button can be placed before its video exists.
  if (videos.length === 0) return null;

  return (
    <>
      {variant === 'icon' ? (
        <IconButton
          aria-label="How this works"
          title="How this works"
          onClick={() => setOpen(true)}
          className={className}
        >
          <PlayCircle width={16} height={16} strokeWidth={1.75} />
        </IconButton>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen(true)}
          leftIcon={<PlayCircle width={15} height={15} strokeWidth={1.75} />}
          className={cn('whitespace-nowrap', className)}
        >
          How this works
        </Button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={label ? `${label} — guided videos` : 'Guided videos'}
        description="Short walkthroughs for admins, in Hindi, showing this exact screen."
        size="md"
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      >
        <ul className="grid gap-2">
          {videos.map((v) => (
            <li key={`${v.video}:${v.at ?? 0}`}>
              <VideoRow v={v} />
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
