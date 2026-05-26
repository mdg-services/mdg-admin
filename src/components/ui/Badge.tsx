import * as React from 'react';

import { cn } from '@/lib/cn';
import { INTENT_CLASSES, type Intent } from '@/lib/statusIntent';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  intent?: Intent;
}

export function Badge({
  intent = 'neutral',
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center rounded-full px-2 text-xs font-medium',
        INTENT_CLASSES[intent],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
