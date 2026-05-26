import * as React from 'react';

import { cn } from '@/lib/cn';

export function Table({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn('w-full border-collapse text-sm', className)}
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}

export function THead({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        'sticky top-0 bg-surface-2 text-xs uppercase tracking-wide text-text-muted',
        className,
      )}
      {...rest}
    >
      {children}
    </thead>
  );
}

export function TBody({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn(className)} {...rest}>
      {children}
    </tbody>
  );
}

export interface TRowProps
  extends React.HTMLAttributes<HTMLTableRowElement> {
  clickable?: boolean;
}

export function TRow({
  className,
  clickable,
  children,
  ...rest
}: TRowProps) {
  return (
    <tr
      className={cn(
        'border-b border-border last:border-b-0',
        clickable && 'cursor-pointer hover:bg-surface-2',
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function TH({
  className,
  children,
  ...rest
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'h-9 px-3 text-left font-semibold align-middle',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TD({
  className,
  children,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('h-11 px-3 align-middle text-text', className)}
      {...rest}
    >
      {children}
    </td>
  );
}
