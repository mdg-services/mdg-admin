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
  const activeRef = React.useRef<HTMLButtonElement | null>(null);

  // Keep the selected tab in view — important on phones where the strip
  // horizontally scrolls and a deep-linked tab (e.g. ?tab=runs) can start
  // off-screen. `block: 'nearest'` avoids any vertical page jump.
  React.useEffect(() => {
    activeRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
    });
  }, [value]);

  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-border scrollbar-thin',
        'snap-x snap-proximity',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            ref={active ? activeRef : undefined}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              '-mb-px shrink-0 snap-start whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors md:py-2',
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
