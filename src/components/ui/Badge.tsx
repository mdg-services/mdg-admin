import * as React from 'react';

import { cn } from '@/lib/cn';
import { INTENT_CLASSES, type Intent } from '@/lib/statusIntent';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  intent?: Intent;
}

/**
 * A short status word in a pill.
 *
 * `shrink-0 whitespace-nowrap` is not cosmetic. The height is a hard 22px, so a
 * badge squeezed by a flex neighbour wrapped its own label onto a second line
 * *inside* a 22px box and clipped it — "Not received" became "Not r". It is the
 * last item of a row often enough (a table cell beside a long dealer name, a
 * card header beside a title) that the squeeze is the normal case, not the edge
 * one. Refusing to shrink pushes the pressure onto the neighbour, which has
 * `min-w-0 break-words` and can take it.
 */
export function Badge({
  intent = 'neutral',
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full px-2 text-xs font-medium',
        INTENT_CLASSES[intent],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
