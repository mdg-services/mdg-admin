import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, EmptyState } from '@/components/ui';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
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
