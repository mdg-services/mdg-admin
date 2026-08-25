import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
}

/**
 * The trail above a page title.
 *
 * It wraps, and every crumb but the last one is capped at 60vw. A nowrap row
 * of three levels is wider than a 360px screen, and `main` is
 * `overflow-x-hidden` — so the row was not scrolled off, it was cut off, and
 * the crumb it took with it was the CURRENT page, the one at the far right.
 * Truncating an ancestor is a fair trade because the ancestor is still one tap
 * away by its own link; truncating where you are is not. At md the cap is
 * lifted and the row is the single line it has always been.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-text-muted">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
        {items.map((c, idx) => {
          const last = idx === items.length - 1;
          return (
            <Fragment key={`${c.label}-${idx}`}>
              <li className={last ? 'min-w-0' : 'max-w-[60vw] md:max-w-none'}>
                {c.to && !last ? (
                  <Link to={c.to} className="block truncate hover:text-text">
                    {c.label}
                  </Link>
                ) : (
                  <span
                    className={
                      last ? 'block break-words text-text' : 'block truncate'
                    }
                  >
                    {c.label}
                  </span>
                )}
              </li>
              {!last ? (
                <li aria-hidden>
                  <ChevronRight
                    width={14}
                    height={14}
                    strokeWidth={1.75}
                    className="text-text-subtle"
                  />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
