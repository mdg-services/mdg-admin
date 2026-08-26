import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, EmptyState } from '@/components/ui';

/**
 * `min-h-full`, not `min-h-[60vh]`: this page renders inside `main`, which is
 * already the app's scroll area between a 56px header and (on a phone) a 56px
 * tab bar. 60% of the FULL viewport is most of what is left, so an error page
 * with four lines on it became scrollable — the one screen in the app where
 * there is nothing to scroll to.
 */
export function NotFoundPage() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <EmptyState
        icon={<Compass width={28} height={28} strokeWidth={1.75} />}
        title="Page not found"
        description="The page you're looking for doesn't exist."
        cta={
          <Link to="/">
            <Button variant="secondary">Back to overview</Button>
          </Link>
        }
      />
    </div>
  );
}
