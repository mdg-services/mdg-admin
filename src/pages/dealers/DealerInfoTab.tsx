import { ChevronDown, KeyRound, MessageSquare } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  KeyValueList,
  Skeleton,
  StatusChip,
} from '@/components/ui';
import { useDealerAuditQuery } from '@/hooks/api/useDealerAudit';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { formatDate, formatDateTime } from '@/lib/format';
import type { Dealer } from '@dk/shared';

import { DealerAppLoginCard } from './DealerAppLoginCard';
import { DealerDangerZone } from './DealerDangerZone';
import { DealerOutletProfileCards } from './DealerOutletProfileCards';
import { DealerOutletProfileDrawer } from './DealerOutletProfileDrawer';

interface Props {
  dealer: Dealer;
  /**
   * Opens the Password vault tab. Optional so the tab still renders standalone
   * (and so a deep link into Info never depends on the parent wiring it up) —
   * without it the pointer below is simply not offered.
   */
  onOpenPasswordVault?: () => void;
}

export function DealerInfoTab({ dealer, onOpenPasswordVault }: Props) {
  const isSuperAdmin = useIsSuperAdmin();
  const isArchived = !!dealer.archivedAt;
  const [editingProfile, setEditingProfile] = React.useState(false);
  return (
    <div className="grid gap-3 md:gap-4">
      {dealer.status === 'ONBOARDING' && !dealer.archivedAt ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text">
                Onboarding in progress
              </p>
              <p className="text-sm text-text-muted">
                Switch to the Onboarding tab to advance the dealer through the
                remaining steps.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <MessageSquare width={14} height={14} />
              <span>
                {dealer.onboarding.completedStepCount} of{' '}
                {dealer.onboarding.steps.length || 8} steps complete
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* NO TAX CARD HERE ANY MORE. GST and PAN are catalog fields on the
          outlet file below, under "Tax and registration", and they read from
          the SAME `Dealer.gst` / `Dealer.pan` this card used to print. Two
          cards showing one GSTIN under two headings is the fault this
          codebase has been audited for once already — one subject, two
          surfaces — and the one that stays is the one that can be edited. */}
      <div className="grid gap-3 md:grid-cols-2 md:gap-4">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Identity</CardTitle>
              <CardSubtitle>Phone, code, status.</CardSubtitle>
            </div>
          </CardHeader>
          <CardContent>
            {/* `select-text` because the shell's long-press allow-list is
                matched with `closest()`: without it a dealer code cannot be
                selected or copied on a phone at all (`#root` is
                `user-select: none`). */}
            <KeyValueList
              className="select-text"
              items={[
                {
                  key: 'code',
                  label: 'Code',
                  value: dealer.code ?? 'Not assigned yet',
                  mono: !!dealer.code,
                },
                {
                  key: 'phone',
                  label: 'Phone',
                  value: dealer.phone ?? 'Not collected yet',
                },
                {
                  key: 'status',
                  label: 'Status',
                  value: <StatusChip kind="dealer" value={dealer.status} />,
                },
                {
                  key: 'onboarded',
                  label: 'Onboarded',
                  value: formatDate(dealer.onboardingDate),
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Payment</CardTitle>
              <CardSubtitle>Recorded at step 5.</CardSubtitle>
            </div>
          </CardHeader>
          <CardContent>
            <KeyValueList
              items={[
                {
                  key: 'received',
                  label: 'Received',
                  value: dealer.paymentReceivedAt
                    ? formatDateTime(dealer.paymentReceivedAt)
                    : 'Not yet',
                },
                {
                  key: 'note',
                  label: 'Note',
                  value: dealer.paymentNote ?? 'No note',
                  // A free-text note is the one field here that runs to a
                  // sentence; `block` gives it the full width at every size.
                  block: true,
                },
              ]}
            />
          </CardContent>
        </Card>

        {/* Every login — the dealer's own, and the IRAS/SDMS portal ones — moved
            to its own tab. An archived dealer cannot reach that tab (the strip
            collapses to Info, which is where Restore lives), so for those the
            app login is shown here instead of being made unreachable. */}
        {isArchived ? (
          <DealerAppLoginCard dealer={dealer} className="md:col-span-2" />
        ) : (
          <Card className="md:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Logins</CardTitle>
                <CardSubtitle>
                  The app sign-in and the IRAS and SDMS portal credentials.
                </CardSubtitle>
              </div>
              <KeyRound
                width={18}
                height={18}
                strokeWidth={1.75}
                className="text-text-muted"
              />
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-text-muted">
                They live in the Password vault, where any admin can read a
                stored portal ID and password back.
              </p>
              {onOpenPasswordVault ? (
                <Button variant="secondary" size="sm" onClick={onOpenPasswordVault}>
                  Open Password vault
                </Button>
              ) : null}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Below the four identity cards, because it is the long section and the
          things somebody opens this tab for — the code, the status, the phone —
          must not be pushed off the first screen by twenty-five rows of
          registration data. */}
      <DealerOutletProfileCards
        dealer={dealer}
        // No editing an archived dealer: every write 409s for one, and this is
        // the only tab an archived dealer can even reach.
        onEdit={isArchived ? undefined : () => setEditingProfile(true)}
      />
      {!isArchived ? (
        <DealerOutletProfileDrawer
          open={editingProfile}
          onClose={() => setEditingProfile(false)}
          dealer={dealer}
        />
      ) : null}

      {isSuperAdmin ? <DealerDangerZone dealer={dealer} /> : null}

      <AuditAccordion dealerId={dealer.id} />
    </div>
  );
}

function AuditAccordion({ dealerId }: { dealerId: string }) {
  const [open, setOpen] = React.useState(false);
  const { data, isLoading } = useDealerAuditQuery(open ? dealerId : undefined, {
    page: 1,
    pageSize: 20,
  });

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div>
          <p className="text-base font-semibold text-text">Audit log</p>
          <p className="text-sm text-text-muted">
            Recent changes to this dealer record.
          </p>
        </div>
        <ChevronDown
          width={16}
          height={16}
          strokeWidth={1.75}
          className={
            open
              ? 'rotate-180 text-text-muted transition-transform'
              : 'text-text-muted transition-transform'
          }
        />
      </button>
      {open ? (
        <div className="border-t border-border p-4">
          {isLoading ? (
            <div className="grid gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-6" />
              ))}
            </div>
          ) : data && data.items.length > 0 ? (
            <ul className="divide-y divide-border">
              {data.items.map((log) => (
                // The actor is a raw 24-character ObjectId — hex, so CSS finds
                // no break opportunity in it at all. Beside a timestamp in a
                // ~262px row it *is* the row's min-content, and it pushed the
                // stamp into three lines of two characters. Below md the stamp
                // takes its own line and the id is allowed to break; at md the
                // two-column row is exactly what it was.
                <li key={log.id} className="py-2 text-sm">
                  <div className="flex flex-col gap-0.5 md:flex-row md:items-start md:justify-between md:gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-text">{log.action}</p>
                      <p className="break-all text-xs text-text-muted">
                        by {log.actorId}
                      </p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-xs text-text-muted">
                      {formatDateTime(log.at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">No audit entries.</p>
          )}
        </div>
      ) : null}
    </Card>
  );
}
