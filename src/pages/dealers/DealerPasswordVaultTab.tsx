import { Archive } from 'lucide-react';

import { Card, CardContent, HowThisWorks } from '@/components/ui';
import type { CompanyPortalId } from '@/hooks/api/useCompanyPortalCredentials';
import { companyPortalIds } from '@/lib/onboarding';
import type { Dealer, OutletSetupAdmin } from '@dk/shared';

import { CompanyPortalCredentialsSection } from './CompanyPortalCredentialsSection';
import { DealerAppLoginCard } from './DealerAppLoginCard';
import { IrasCredentialsSection } from './IrasCredentialsSection';
import { SdmsCredentialsSection } from './SdmsCredentialsSection';

/** The company portals, in the order their cards are drawn. */
const COMPANY_PORTAL_IDS: readonly CompanyPortalId[] = ['bpcl', 'econnect', 'hpcl'];

interface Props {
  dealer: Dealer;
  /**
   * The outlet's onboarding setup, or `null`/absent for one from before onboarding v2.
   * Its company decides whether the BPCL or HPCL portal card is drawn even while empty.
   */
  setup?: OutletSetupAdmin | null;
}

/**
 * Every login this dealer has, in one place: their own app sign-in, and the
 * third-party portal credentials the automation signs in with.
 *
 * These used to sit at the bottom of the Info tab, below identity, tax and
 * payment — three cards deep in a page nobody opened to find a password. They
 * are their own answer to their own question, so they get their own tab.
 *
 * A BPCL or HPCL outlet also has its company portal here ("BPCL portal login"): drawn
 * first and even while empty when that is the outlet's company, and for any outlet once
 * such a login is saved. MDG's team uses it by hand.
 *
 * Any admin can open this and read a stored portal password back; it is not a
 * super-admin surface any more. What keeps that honest is on the server: the
 * routes are admin-only, each reveal is capped per person per hour, and the
 * audit row is written *before* the plaintext is released, so a reveal that
 * cannot be recorded does not happen.
 */
export function DealerPasswordVaultTab({ dealer, setup = null }: Props) {
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
      {/* A grid child in its own right, with no wrapper: on the day this
          surface has no video it renders nothing at all, and an empty wrapping
          div would still spend a row and a 12px gap on it. `justify-self-start`
          keeps it at its own width instead of stretching across the tab. */}
      <HowThisWorks
        surface="admin-dealer-password-vault"
        label="Password vault"
        className="justify-self-start"
      />
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
                Nothing was destroyed — the stored portal logins come back
                when you restore the dealer from the Info tab.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <DealerAppLoginCard dealer={dealer} />

      {isArchived ? null : (
        <>
          {COMPANY_PORTAL_IDS.map((portal) => (
            <CompanyPortalCredentialsSection
              key={portal}
              dealerId={dealer.id}
              portal={portal}
              expected={companyPortalIds(setup?.company).includes(portal)}
            />
          ))}
          <IrasCredentialsSection dealerId={dealer.id} />
          <SdmsCredentialsSection dealerId={dealer.id} />
        </>
      )}
    </div>
  );
}
