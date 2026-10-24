import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';
import type { DealerTabId } from '@/lib/onboarding';

/**
 * A link to one tab of the dealer's page (Team for Reset password, Services for
 * what is attached, the Password vault for every login).
 *
 * On the dealer's own page the tab is switched by the page (`onGoToTab`): a link
 * to `?tab=` from there changes the address but not the tab, because the page
 * reads the address only when it opens. From the Onboarding page there is no
 * such page above, so it is an ordinary link to the dealer with the tab named.
 * `onClick` runs first either way, to close the form it is in.
 */
export function DealerTabLink({
  dealerId,
  tab,
  onGoToTab,
  onClick,
  className,
  children,
}: {
  dealerId: string;
  tab: DealerTabId;
  onGoToTab?: ((tab: DealerTabId) => void) | undefined;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const look = cn(
    'font-semibold text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
    className,
  );
  if (onGoToTab) {
    return (
      <button
        type="button"
        className={cn(look, 'text-left')}
        onClick={() => {
          onClick?.();
          onGoToTab(tab);
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <Link className={look} to={`/dealers/${dealerId}?tab=${tab}`} onClick={onClick}>
      {children}
    </Link>
  );
}
