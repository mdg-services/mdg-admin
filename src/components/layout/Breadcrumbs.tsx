import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-text-muted">
      <ol className="flex items-center gap-1">
        {items.map((c, idx) => {
          const last = idx === items.length - 1;
          return (
            <Fragment key={`${c.label}-${idx}`}>
              <li>
                {c.to && !last ? (
                  <Link to={c.to} className="hover:text-text">
                    {c.label}
                  </Link>
                ) : (
                  <span className={last ? 'text-text' : undefined}>
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
