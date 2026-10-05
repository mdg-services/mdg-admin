import { Compass } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button, EmptyState } from '@/components/ui';

/**
 * The page for a route nobody defined. It renders OUTSIDE `AppShell` (the
 * catch-all route sits beside the shell's, not inside it), so there is no
 * header, no sidebar and no tab bar here — this button is the only way back.
 *
 * It goes to Today by name. It used to be a `<Link to="/">` labelled "Back to
 * overview", but `/` redirects to the Inbox, so the label promised one screen
 * and delivered another; and the link wrapped a `<Button>`, which is a control
 * inside a control — announced twice, focused twice.
 *
 * `min-h-full`, not `min-h-[60vh]`: 60% of the full viewport on a page with four
 * lines on it made the one screen with nothing to scroll to scrollable.
 */
export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full items-center justify-center">
      <EmptyState
        icon={<Compass width={28} height={28} strokeWidth={1.75} />}
        title="Page not found"
        description="The page you're looking for doesn't exist."
        cta={
          <Button variant="secondary" onClick={() => navigate('/overview')}>
            Back to Today
          </Button>
        }
      />
    </div>
  );
}
