import * as React from 'react';

import { cn } from '@/lib/cn';

export interface TabItem {
  id: string;
  label: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ items, value, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center gap-1 border-b border-border',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-brand text-text'
                : 'border-transparent text-text-muted hover:text-text',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
