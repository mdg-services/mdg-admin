import { Link } from 'react-router-dom';

import type { KeyValueItem } from '@/components/ui';
import { subscriptionLines } from '@/lib/billing';
import { paymentLine } from '@/lib/onboarding';
import type { OutletSetupAdmin } from '@dk/shared';

/**
 * The rows billing adds to the Setup card, in the order a person reads them: the
 * bill (with the way to open it on the Payments page, where it can be looked at,
 * cancelled or its link copied), its live payment link, and — once a month has
 * been paid — how far it is paid, when the next bill is raised, whether one is
 * overdue and whether the services are paused for non-payment.
 *
 * `today` is an IST `YYYY-MM-DD`, passed in so the words are the same on every
 * render of one day.
 */
export function billingItems(setup: OutletSetupAdmin, today: string): KeyValueItem[] {
  const p = setup.payment;
  const items: KeyValueItem[] = [
    {
      key: 'bill',
      label: 'Bill',
      value: (
        <>
          {paymentLine(p)}
          {p.paymentId ? (
            <>
              {' · '}
              <Link className="text-brand underline" to={`/payments?payment=${p.paymentId}`}>
                Open
              </Link>
            </>
          ) : null}
        </>
      ),
      block: true,
    },
  ];
  // The link is shown for copying only while it can still be paid.
  if (p.state === 'sent' && p.linkUrl) {
    items.push({
      key: 'link',
      label: 'Payment link',
      value: p.linkUrl,
      mono: true,
      copyable: true,
      block: true,
    });
  }
  for (const l of subscriptionLines(setup.subscription, today)) {
    items.push({
      key: l.key,
      label: l.label,
      block: true,
      value:
        l.tone === 'normal' ? (
          l.value
        ) : (
          <span className={l.tone === 'danger' ? 'text-danger' : 'text-warning-strong'}>
            {l.value}
          </span>
        ),
    });
  }
  return items;
}
