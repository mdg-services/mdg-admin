import * as React from 'react';

import { Breadcrumbs, type Crumb } from './Breadcrumbs';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
}

/**
 * The title block at the top of a page, plus its actions.
 *
 * The actions row is where a phone used to lose controls outright. It was a
 * single `flex` line of `whitespace-nowrap` buttons: three of them need ~372px,
 * a 360px screen offers ~296px inside the page padding, and `<main>` is
 * `overflow-x-hidden` — so the rightmost button was not scrolled off, it was
 * *cut off*, and "Add holiday" simply did not exist on that screen. Wrapping
 * plus `flex-auto` gives each button its own line when it needs one; at md the
 * old single nowrap row is restored exactly.
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
}: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {breadcrumbs?.length ? (
          // Hidden on a phone: a drill-in already has the shell's back chevron,
          // so the trail is a second row of chrome above a 2xl title.
          <div className="mb-2 hidden md:block">
            <Breadcrumbs items={breadcrumbs} />
          </div>
        ) : null}
        <h1 className="break-words text-2xl font-semibold text-text">{title}</h1>
        {subtitle ? (
          // Some subtitles run to 158 characters — five lines, ~100px of a
          // 522px screen, before any data. Two lines below md; unchanged above.
          <p className="mt-1 line-clamp-2 text-sm text-text-muted md:line-clamp-none">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        // `flex-auto`, not `flex-1`: `flex-1` is `flex: 1 1 0%`, and a zero
        // basis puts every button on one line no matter how wide they are —
        // which is the clipping bug again. `flex-auto` breaks on content first,
        // then fills the line it lands on.
        <div className="flex flex-wrap items-center gap-2 md:flex-nowrap [&>button]:flex-auto md:[&>button]:flex-none">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
