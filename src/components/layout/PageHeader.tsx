import * as React from 'react';

import { ClampedText } from '@/components/ui';
import { cn } from '@/lib/cn';

import { Breadcrumbs, type Crumb } from './Breadcrumbs';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  /** Stretch the action buttons across the line they land on, below md. Off by
   *  default: one action does not need to be 328px wide to be tappable. Ask for
   *  it where the actions are the point of the page. */
  actionsFill?: boolean;
  /**
   * One line instead of four.
   *
   * The standard block stacks a breadcrumb trail, a 24px title, and a subtitle,
   * and on a drill-in page that is three rows to say one thing: the dealer page
   * spent ~110px printing "Dealers › 15E", then "15E" again at 2xl, then the
   * phone number — above a tab strip, above a dataset rail, above the report
   * somebody actually came to read. Dense puts the trail, the name and the
   * subtitle on a single row and keeps the actions beside them.
   *
   * For a page whose title is a SHORT identifier — a dealer code, a run id.
   * A long title in one row with a long subtitle just wraps into the same
   * height it started from.
   */
  dense?: boolean;
}

/**
 * The title block at the top of a page, plus its actions.
 *
 * The actions row is where a phone used to lose controls outright. It was a
 * single `flex` line of `whitespace-nowrap` buttons: three of them need ~372px,
 * a 360px screen offers ~296px inside the page padding, and `<main>` is
 * `overflow-x-hidden` — so the rightmost button was not scrolled off, it was
 * *cut off*, and "Add holiday" simply did not exist on that screen. Wrapping
 * gives each button its own line when it needs one; at md the old single nowrap
 * row is restored exactly.
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  actionsFill = false,
  dense = false,
}: PageHeaderProps) {
  if (dense) {
    return (
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 md:mb-4">
        {breadcrumbs?.length ? (
          // The trail WITHOUT its last crumb: the crumb and the title are the
          // same word on a drill-in page, and printing it twice on one line is
          // worse than printing it twice on two.
          <div className="hidden md:block">
            <Breadcrumbs items={breadcrumbs.slice(0, -1)} trailing />
          </div>
        ) : null}
        <h1 className="min-w-0 break-words text-lg font-semibold text-text md:text-xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="min-w-0 truncate text-sm text-text-muted">{subtitle}</p>
        ) : null}
        {actions ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-2 md:mb-6 md:flex-row md:items-end md:justify-between md:gap-3">
      <div className="min-w-0">
        {breadcrumbs?.length ? (
          // Hidden on a phone: a drill-in already has the shell's back chevron,
          // so the trail is a second row of chrome above a 2xl title.
          <div className="mb-2 hidden md:block">
            <Breadcrumbs items={breadcrumbs} />
          </div>
        ) : null}
        {/* `text-xl` below md: a 24px title on a 360px screen wraps a
            two-word page name onto two lines and, with the subtitle and the
            action under it, spends the first 300px of a 740px viewport before
            the first row of data. 24px is restored from md up. */}
        <h1 className="break-words text-xl font-semibold text-text md:text-2xl">
          {title}
        </h1>
        {subtitle ? (
          // Some subtitles run to 158 characters — five lines, ~100px of a
          // 522px screen, before any data. Two lines below md; unchanged above.
          //
          // `ClampedText` and not a bare `line-clamp-2`, because the cut lands
          // mid-sentence and the half it drops is routinely the half that
          // carries the point: /kavach stopped at "A task is certified by an MDG
          // admin —" and lost "never by the dealer", which is the opposite
          // reading of the same sentence. The toggle only appears when the text
          // really is longer than two lines.
          <ClampedText className="mt-1 text-sm text-text-muted">
            {subtitle}
          </ClampedText>
        ) : null}
      </div>
      {actions ? (
        // `flex-wrap` is what fixed the clipping: a nowrap row of three
        // `whitespace-nowrap` buttons needs ~372px and a 360px screen offers
        // ~296px, so the third one was cut off rather than scrolled off.
        // Wrapping alone breaks the row onto as many lines as it needs. The
        // grow factor that used to ride along with it is a separate decision
        // and now opt-in: `flex-auto` makes a SINGLE action fill the whole
        // 328px line, which is how one "Add dealer" button became a banner.
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 md:flex-nowrap md:[&>button]:flex-none',
            actionsFill && '[&>button]:flex-auto',
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
