import { Menu } from 'lucide-react';
import * as React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import { Sheet, SheetItem } from '@/components/ui';
import { useConversations } from '@/hooks/api/useConversations';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { cn } from '@/lib/cn';

import { BOTTOM_TAB_ROUTES, NAV_ITEMS } from './navItems';

/**
 * The mobile bottom tab bar (below `md`). Four primary destinations plus a
 * "More" sheet holding Service Catalog, Run History, and the super-admin-only
 * items. Replaces the desktop sidebar on phones; the sidebar is untouched at
 * `≥ md`. Render this as the last child of the shell's right column with
 * `md:hidden`.
 */
export function MobileTabBar({ className }: { className?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isSuperAdmin = useIsSuperAdmin();
  const [moreOpen, setMoreOpen] = React.useState(false);

  // Same unread computation the sidebar badge uses.
  const mineQ = useConversations('mine');
  const unreadCount = (mineQ.data ?? []).filter((c) => c.unreadByAdmin).length;

  const bottomItems = BOTTOM_TAB_ROUTES.map((route) =>
    NAV_ITEMS.find((i) => i.to === route),
  ).filter((i): i is (typeof NAV_ITEMS)[number] => Boolean(i));

  const moreItems = NAV_ITEMS.filter(
    (i) => !BOTTOM_TAB_ROUTES.includes(i.to) && (!i.superAdminOnly || isSuperAdmin),
  );

  const moreActive = moreItems.some((i) =>
    location.pathname.startsWith(i.to),
  );

  return (
    <>
      <nav
        aria-label="Primary"
        className={cn(
          'flex shrink-0 items-stretch border-t border-border bg-surface safe-bottom',
          className,
        )}
      >
        {bottomItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5',
                isActive ? 'text-brand' : 'text-text-muted',
              )
            }
          >
            <span className="relative">
              <item.icon width={22} height={22} strokeWidth={1.75} />
              {item.to === '/inbox' && unreadCount > 0 ? (
                <span className="absolute -right-2 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-4 text-text-inverse">
                  {unreadCount}
                </span>
              ) : null}
            </span>
            <span className="text-[11px] leading-none">{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="More"
          aria-expanded={moreOpen}
          className={cn(
            'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5',
            moreActive ? 'text-brand' : 'text-text-muted',
          )}
        >
          <Menu width={22} height={22} strokeWidth={1.75} />
          <span className="text-[11px] leading-none">More</span>
        </button>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        {moreItems.map((item) => (
          <SheetItem
            key={item.to}
            icon={<item.icon width={20} height={20} strokeWidth={1.75} />}
            active={location.pathname.startsWith(item.to)}
            onClick={() => {
              setMoreOpen(false);
              navigate(item.to);
            }}
          >
            {item.label}
          </SheetItem>
        ))}
      </Sheet>
    </>
  );
}
