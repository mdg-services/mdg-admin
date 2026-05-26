import type { Dealer } from '@dk/shared';
import { ChevronDown, MessageSquare } from 'lucide-react';
import * as React from 'react';

import {
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Skeleton,
  StatusChip,
} from '@/components/ui';
import { useDealerAuditQuery } from '@/hooks/api/useDealerAudit';
import { formatDate, formatDateTime } from '@/lib/format';

import { PortalCredentialsSection } from './PortalCredentialsSection';

interface Props {
  dealer: Dealer;
}

export function DealerInfoTab({ dealer }: Props) {
  return (
    <div className="grid gap-4">
      {dealer.status === 'ONBOARDING' ? (
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Identity</CardTitle>
              <CardSubtitle>Phone, code, status.</CardSubtitle>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <Row label="Name" value={dealer.name ?? 'Not set'} />
              <Row
                label="Code"
                value={
                  dealer.code ? (
                    <span className="font-mono">{dealer.code}</span>
                  ) : (
                    'Not assigned yet'
                  )
                }
              />
              <Row label="Phone" value={dealer.phone} />
              <Row
                label="Status"
                value={<StatusChip kind="dealer" value={dealer.status} />}
              />
              <Row label="Onboarded" value={formatDate(dealer.onboardingDate)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Tax</CardTitle>
              <CardSubtitle>Captured during step 5.</CardSubtitle>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <Row label="GST" value={dealer.gst ?? 'Not collected yet'} />
              <Row label="PAN" value={dealer.pan ?? 'Not collected yet'} />
            </dl>
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
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <Row
                label="Received"
                value={
                  dealer.paymentReceivedAt
                    ? formatDateTime(dealer.paymentReceivedAt)
                    : 'Not yet'
                }
              />
              <Row label="Note" value={dealer.paymentNote ?? 'No note'} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>WhatsApp groups</CardTitle>
              <CardSubtitle>Created at steps 7 and 8.</CardSubtitle>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <Row
                label="Admin group"
                value={dealer.whatsappGroups?.adminGroupName ?? 'Not created'}
              />
              <Row
                label="Admin link"
                value={
                  dealer.whatsappGroups?.adminGroupInviteLink ? (
                    <a
                      href={dealer.whatsappGroups.adminGroupInviteLink}
                      className="text-brand hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  ) : (
                    '—'
                  )
                }
              />
              <Row
                label="Dealer group"
                value={dealer.whatsappGroups?.dealerGroupName ?? 'Not created'}
              />
              <Row
                label="Dealer link"
                value={
                  dealer.whatsappGroups?.dealerGroupInviteLink ? (
                    <a
                      href={dealer.whatsappGroups.dealerGroupInviteLink}
                      className="text-brand hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  ) : (
                    '—'
                  )
                }
              />
            </dl>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Portal credentials</CardTitle>
              <CardSubtitle>Provisioned at step 7. Hash is never returned.</CardSubtitle>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
              <Row
                label="Username"
                value={
                  dealer.portalCredentials?.username ? (
                    <span className="font-mono">
                      {dealer.portalCredentials.username}
                    </span>
                  ) : (
                    'Not issued'
                  )
                }
              />
              <Row
                label="Issued"
                value={
                  dealer.portalCredentials?.setAt
                    ? formatDateTime(dealer.portalCredentials.setAt)
                    : '—'
                }
              />
              <Row label="Password" value={dealer.portalCredentials ? '••••••••' : '—'} />
              <Row
                label="Must change on first login"
                value={
                  dealer.portalCredentials
                    ? dealer.portalCredentials.mustChangeOnFirstLogin
                      ? 'Yes'
                      : 'No'
                    : '—'
                }
              />
            </dl>
          </CardContent>
        </Card>
      </div>

      <PortalCredentialsSection dealerId={dealer.id} />

      <AuditAccordion dealerId={dealer.id} />
    </div>
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
                <li
                  key={log.id}
                  className="flex items-start justify-between gap-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-text">{log.action}</p>
                    <p className="text-xs text-text-muted">by {log.actorId}</p>
                  </div>
                  <span className="text-xs text-text-muted">
                    {formatDateTime(log.at)}
                  </span>
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
