import {
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  KeyValueList,
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
 *
 * The fields go through `KeyValueList` rather than a `grid-cols-[140px_1fr]` of
 * their own. That grid left ~144px for the login address, and an email has no
 * break opportunity CSS will take (not at `@`, not at `.`), so the track grew
 * past the card and `main`'s `overflow-x-hidden` cut the tail off with no
 * gesture to bring it back. The address is also `copyable`: `#root` sets
 * `user-select: none`, so a value printed into a `<div>` cannot be selected or
 * long-pressed on a phone at all — telling the admin to "copy it manually" is
 * not advice they can act on here.
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
        {/* `select-text` on the list, not on one value: the native shell's
            long-press allow-list is matched with `closest()`, so the class has
            to sit on the value or an ancestor. Everything in this card is a
            read-only reference figure someone may need to read out. */}
        <KeyValueList
          className="select-text"
          columnsAtMd={2}
          items={[
            {
              key: 'username',
              label: 'Login email',
              value: creds?.username ?? 'Not issued',
              mono: !!creds?.username,
              copyable: !!creds?.username,
            },
            {
              key: 'issued',
              label: 'Issued',
              value: creds?.setAt ? formatDateTime(creds.setAt) : '—',
            },
            {
              key: 'password',
              label: 'Password',
              value: creds ? '••••••••' : '—',
            },
            {
              key: 'must-change',
              label: 'Must change on first login',
              value: creds ? (creds.mustChangeOnFirstLogin ? 'Yes' : 'No') : '—',
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
