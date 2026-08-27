import { Archive } from 'lucide-react';

import { Card, CardContent } from '@/components/ui';
import type { Dealer } from '@dk/shared';

import { DealerAppLoginCard } from './DealerAppLoginCard';
import { IrasCredentialsSection } from './IrasCredentialsSection';
import { SdmsCredentialsSection } from './SdmsCredentialsSection';

interface Props {
  dealer: Dealer;
}

/**
 * Every login this dealer has, in one place: their own app sign-in, and the
 * third-party portal credentials the automation signs in with.
 *
 * These used to sit at the bottom of the Info tab, below identity, tax and
 * payment — three cards deep in a page nobody opened to find a password. They
 * are their own answer to their own question, so they get their own tab.
 *
 * Any admin can open this and read a stored portal password back; it is not a
 * super-admin surface any more. What keeps that honest is on the server: the
 * routes are admin-only, each reveal is capped per person per hour, and the
 * audit row is written *before* the plaintext is released, so a reveal that
 * cannot be recorded does not happen.
 */
export function DealerPasswordVaultTab({ dealer }: Props) {
  // The dealer page never routes here for an archived dealer — it collapses
  // every tab to Info, where Restore lives — so today this branch does not
  // render. It is a precondition, not dead weight: the correctness of this
  // component should not depend on a routing rule two files away, and the
  // failure it prevents is ugly. The credential endpoints 404 for an archived
  // dealer, so the two portal cards would come up as empty "not set up yet"
  // forms offering a write the backend refuses.
  const isArchived = !!dealer.archivedAt;

  return (
    <div className="grid gap-3 md:gap-4">
      {isArchived ? (
        <Card>
          <CardContent className="flex items-start gap-3">
            <Archive
              width={18}
              height={18}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-text-muted"
            />
            <div>
              <p className="text-sm font-semibold text-text">
                Portal logins are locked while this dealer is deleted
              </p>
              <p className="text-sm text-text-muted">
                Nothing was destroyed — the stored IRAS and SDMS logins come back
                when you restore the dealer from the Info tab.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <DealerAppLoginCard dealer={dealer} />

      {isArchived ? null : (
        <>
          <IrasCredentialsSection dealerId={dealer.id} />
          <SdmsCredentialsSection dealerId={dealer.id} />
        </>
      )}
    </div>
  );
}
