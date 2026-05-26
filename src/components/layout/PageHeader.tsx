import * as React from 'react';

import { Breadcrumbs, type Crumb } from './Breadcrumbs';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
}: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        {breadcrumbs?.length ? (
          <div className="mb-2">
            <Breadcrumbs items={breadcrumbs} />
          </div>
        ) : null}
        <h1 className="text-2xl font-semibold text-text">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
