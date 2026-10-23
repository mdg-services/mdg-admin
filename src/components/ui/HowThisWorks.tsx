import { ArrowLeft, ExternalLink, PlayCircle } from 'lucide-react';
import * as React from 'react';

import { useGuideVideoLibrary } from '@/hooks/api/useGuideVideos';
import { cn } from '@/lib/cn';
import {
  type GuideRow,
  guideDescription,
  libraryRows,
  refsForSurface,
  resolveRows,
} from '@/lib/guideVideos';

import { Button } from './Button';
import { Callout } from './Callout';
import { Dialog } from './Dialog';
import { GuideVideoPlayer } from './GuideVideoPlayer';
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
 * ── THE VIDEO PLAYS RIGHT HERE ─────────────────────────────────────────────
 *
 * A row used to be a link to a separate video website, which this dialog warned
 * about ("opens the MDG guide in a new tab"). That site is retired: the team's
 * videos are in MDG's own library and play inside this dialog, from the second a
 * deep link names, with the chapters underneath to jump between. An admin
 * mid-task stays where they are. The one row that still leaves the portal is a
 * public explainer, which lives on mdgservices.in now, and it says so.
 *
 * ── IT ALWAYS RENDERS ──────────────────────────────────────────────────────
 *
 * It used to return `null` for a surface with no video yet, so that buttons
 * could be placed across the portal before the videos existed. That was the
 * wrong trade: ninety-odd invisible buttons are indistinguishable from no
 * buttons, and the founder said so as soon as they looked — "the How this works
 * are not visible on the admin portal".
 *
 * `refsForSurface` is total. A screen with no walkthrough of its own gets the
 * closest video on the SUBJECT, and failing that a row that opens the whole
 * library and says plainly that this screen has not been recorded yet. Neither
 * pretends to be an answer it is not, and both beat a control that is not there.
 *
 * ── ONE VIDEO STILL OPENS THE LIST ─────────────────────────────────────────
 *
 * It would be tempting to make a single video start playing straight away and
 * skip the list. It does not: the list says how long each video is before it
 * costs anybody four minutes to find out, and says whether this is the video of
 * THIS screen or only of its subject. Both matter more than the saved tap.
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

/** What the dialog is showing: a list of rows, or one video playing. */
type View =
  | { kind: 'list' }
  | { kind: 'library' }
  | { kind: 'play'; id: string; title: string; at: number; back: 'list' | 'library' };

function RowBody({ row }: { row: GuideRow }) {
  return (
    <>
      <span className="mt-0.5 shrink-0 text-brand" aria-hidden>
        <PlayCircle width={22} height={22} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-text">
          {row.title}
          {row.kind === 'web' ? (
            <ExternalLink
              width={12}
              height={12}
              strokeWidth={1.75}
              className="shrink-0 text-text-subtle"
              aria-hidden
            />
          ) : null}
        </span>
        {row.blurb ? (
          <span className="mt-0.5 block text-sm text-text-muted">{row.blurb}</span>
        ) : null}
        <span className="mt-1 block text-xs text-text-subtle">
          {/* Say which of the kinds of row this is. A subject match that silently
              posed as a walkthrough of this screen would waste four minutes of
              somebody's time and teach them not to press the button again. */}
          {[
            row.minutes,
            row.tag,
            row.at !== undefined ? 'starts at the relevant part' : null,
            row.fit === 'subject' ? 'about the subject, not this screen' : null,
            row.kind === 'web'
              ? 'opens on mdgservices.in in a new tab'
              : row.kind === 'video' && !row.available
                ? 'not uploaded yet'
                : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </>
  );
}

const ROW_CLASS =
  'flex w-full items-start gap-3 rounded-md border border-border bg-surface p-3 text-left hover:bg-surface-2';

function Row({ row, onOpen }: { row: GuideRow; onOpen: (row: GuideRow) => void }) {
  if (row.kind === 'web' && row.href) {
    return (
      <a href={row.href} target="_blank" rel="noopener noreferrer" className={ROW_CLASS}>
        <RowBody row={row} />
      </a>
    );
  }
  const disabled = row.kind === 'video' && !row.available;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onOpen(row)}
      className={cn(ROW_CLASS, disabled && 'cursor-not-allowed opacity-60 hover:bg-surface')}
    >
      <RowBody row={row} />
    </button>
  );
}

export function HowThisWorks({ surface, label, variant = 'button', className }: HowThisWorksProps) {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<View>({ kind: 'list' });
  const refs = refsForSurface(surface);
  // The library is read only while the dialog is open: ninety-odd of these sit on
  // screens nobody asks help on.
  const library = useGuideVideoLibrary(open);
  const rows = resolveRows(refs, library.data);

  const close = () => {
    setOpen(false);
    setView({ kind: 'list' });
  };

  const openRow = (row: GuideRow, back: 'list' | 'library') => {
    if (row.kind === 'library') {
      setView({ kind: 'library' });
    } else if (row.kind === 'video' && row.id) {
      setView({ kind: 'play', id: row.id, title: row.title, at: row.at ?? 0, back });
    }
  };

  const heading = label ? `${label} — guided videos` : 'Guided videos';

  const body = (() => {
    if (view.kind === 'play') {
      return <GuideVideoPlayer id={view.id} startSec={view.at} title={view.title} />;
    }
    const shown = view.kind === 'library' ? libraryRows(library.data) : rows;
    return (
      <div className="grid gap-2">
        {library.isError ? (
          <Callout onRetry={() => void library.refetch()}>
            The video list did not load, so lengths and availability are not shown.
          </Callout>
        ) : null}
        {view.kind === 'library' && library.isPending ? (
          <p className="text-sm text-text-muted">Loading the library…</p>
        ) : null}
        <ul className="grid gap-2">
          {shown.map((row) => (
            <li key={row.key}>
              <Row
                row={row}
                onOpen={(r) => openRow(r, view.kind === 'library' ? 'library' : 'list')}
              />
            </li>
          ))}
        </ul>
      </div>
    );
  })();

  return (
    <>
      {variant === 'icon' ? (
        <IconButton
          // Named after the guide it opens: a screen with two of these side
          // by side (the Data Vault header) read out "How this works" twice.
          aria-label={label ? `How this works: ${label}` : 'How this works'}
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
        onClose={close}
        title={view.kind === 'play' ? view.title : heading}
        // Says which of the three this list is — a video of this screen, one
        // on the subject, or only the library — instead of promising the
        // first on every screen.
        description={
          view.kind === 'play'
            ? heading
            : view.kind === 'library'
              ? 'Every video MDG has made: the team walkthroughs first, then the dealer videos.'
              : guideDescription(refs)
        }
        size={view.kind === 'play' ? 'lg' : 'md'}
        footer={
          <>
            {view.kind !== 'list' ? (
              <Button
                variant="secondary"
                onClick={() => setView({ kind: view.kind === 'play' ? view.back : 'list' })}
                leftIcon={<ArrowLeft width={15} height={15} strokeWidth={1.75} />}
              >
                {view.kind === 'play' && view.back === 'library'
                  ? 'All videos'
                  : 'This screen’s videos'}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
          </>
        }
      >
        {body}
      </Dialog>
    </>
  );
}
