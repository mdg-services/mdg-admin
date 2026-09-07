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
 * ── IT ALWAYS RENDERS ──────────────────────────────────────────────────────
 *
 * It used to return `null` for a surface with no video yet, so that buttons
 * could be placed across the portal before the videos existed. That was the
 * wrong trade: ninety-odd invisible buttons are indistinguishable from no
 * buttons, and the founder said so as soon as they looked — "the How this works
 * are not visible on the admin portal".
 *
 * `videosForSurface` is now total. A screen with no walkthrough of its own gets
 * the closest video on the SUBJECT, and failing that a row that opens the
 * library and says plainly that this screen has not been recorded yet. Neither
 * pretends to be an answer it is not, and both beat a control that is not there.
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
          {/* Say which of the three kinds of row this is. A subject match that
              silently posed as a walkthrough of this screen would waste four
              minutes of somebody's time and teach them not to press the button
              again. */}
          {[
            v.minutes,
            v.at ? 'starts at the relevant part' : null,
            v.fit === 'subject' ? 'about the subject, not this screen' : null,
            'opens the MDG guide in a new tab',
          ]
            .filter(Boolean)
            .join(' · ')}
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
