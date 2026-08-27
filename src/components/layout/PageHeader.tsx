import * as React from 'react';

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
}: PageHeaderProps) {
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
          <p className="mt-1 line-clamp-2 text-sm text-text-muted md:line-clamp-none">
            {subtitle}
          </p>
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
