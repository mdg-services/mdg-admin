import * as React from 'react';

import {
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { Dealer } from '@dk/shared';

interface Props {
  dealer: Dealer;
  className?: string;
}

/**
 * The dealer's own login to the Dealer Kavach app, issued at the last
 * onboarding step.
 *
 * Read-only by design, and the one credential on this page that cannot be
 * revealed: it is stored as a bcrypt hash, so there is nothing to decrypt. If
 * the dealer has lost it, reopen the "Issue app login" onboarding step and
 * issue a new one — that is the only way to put a password back in anyone's
 * hands.
 */
export function DealerAppLoginCard({ dealer, className }: Props) {
  const creds = dealer.portalCredentials;
  return (
    <Card className={className}>
      <CardHeader>
        <div>
          <CardTitle>App login</CardTitle>
          <CardSubtitle>
            The dealer&apos;s own sign-in, issued at the final onboarding step.
            The password is hashed and never returned.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
          <Row
            label="Login email"
            value={
              creds?.username ? (
                <span className="font-mono">{creds.username}</span>
              ) : (
                'Not issued'
              )
            }
          />
          <Row
            label="Issued"
            value={creds?.setAt ? formatDateTime(creds.setAt) : '—'}
          />
          <Row label="Password" value={creds ? '••••••••' : '—'} />
          <Row
            label="Must change on first login"
            value={creds ? (creds.mustChangeOnFirstLogin ? 'Yes' : 'No') : '—'}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}
