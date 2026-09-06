import { Pencil, ScrollText } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  HowThisWorks,
  KeyValueList,
  type KeyValueItem,
} from '@/components/ui';
import { formatYmd } from '@/lib/format';
import {
  groupDealerProfile,
  resolveDealerProfile,
  type Dealer,
  type DealerProfileExpiryState,
  type ResolvedDealerProfileField,
} from '@dk/shared';

interface Props {
  dealer: Dealer;
  /**
   * Opens the editor. Absent for an archived dealer, where every write 409s —
   * an Edit button that always fails is worse than no button.
   */
  onEdit?: () => void;
}

/** What an expiry looks like on screen. Never a bare date with no verdict beside it. */
const EXPIRY_BADGE: Record<
  DealerProfileExpiryState,
  { intent: 'danger' | 'warning' | 'success'; text: string }
> = {
  expired: { intent: 'danger', text: 'Expired' },
  expiring: { intent: 'warning', text: 'Expiring' },
  valid: { intent: 'success', text: 'Valid' },
};

/**
 * The outlet's own paperwork, as the Info tab shows it.
 *
 * ONE ROW PER FIELD, PLUS ONE FOR AN EXPIRY. A licence takes two rows rather
 * than one so the number itself stays a plain string — which is what lets
 * `KeyValueList` render it through `Copyable`, and copying is the whole point:
 * every one of these is transcribed by hand into somebody else's portal. Folding
 * the date into the value node would have bought one row back and taken the copy
 * control with it.
 *
 * EMPTY FIELDS ARE NOT DRAWN. `includeEmpty: false` — twenty-five rows of "Not
 * collected yet" is a form, not a record, and the Info tab already has four
 * cards above this one that a reader has to get past. The place to see what is
 * missing is the editor, where every box is present whether or not it is filled.
 * That is why `mono` here is decided by the field's KIND rather than by whether
 * a value exists, as the Tax card above has to: there is no placeholder string
 * to keep out of the monospace face.
 *
 * The list comes from `resolveDealerProfile`, the SAME function the AI first
 * line's lookup calls. That is deliberate: this screen and the machine answering
 * a dealer in chat must not be able to disagree about what this outlet's W&M
 * licence is, and the only way to guarantee that is for neither of them to hold
 * its own copy of the rule.
 */
export function DealerOutletProfileCards({ dealer, onEdit }: Props) {
  /**
   * Today, in IST, read ONCE.
   *
   * Read on every render, and IST.
   *
   * NOT memoised on `[]`: an admin who leaves this tab open overnight would
   * otherwise keep yesterday's verdicts, and a licence that expires today would
   * still be painted green in the morning. It costs one `Date` per render, and
   * it is a STRING — so the memo below still only recomputes when the day
   * actually turns over, not on every render.
   *
   * IST rather than the browser's own calendar, because the AI first line
   * answers the same question off an IST day (`istDateKey`). An operator on a
   * laptop set to another zone would otherwise see a red "Expired" badge on a
   * licence the app was still calling valid, and neither screen could explain
   * the other.
   */
  const today = istDay(new Date());
  const filled = React.useMemo(
    () => resolveDealerProfile(dealer, { today, includeEmpty: false }),
    [dealer, today],
  );
  const groups = React.useMemo(() => groupDealerProfile(filled), [filled]);

  const expiringSoon = filled.filter(
    (f) => f.expiryState === 'expired' || f.expiryState === 'expiring',
  );

  return (
    <div className="grid gap-3 md:gap-4">
      <Card>
        {/* The button goes in `action`, NOT beside the title. `CardHeader` says
            why in its own props: a second child is just another item in a
            `justify-between` row that cannot wrap, and a `whitespace-nowrap`
            Button in a 296px card squeezes the title to nothing or runs off the
            edge — where `main`'s `overflow-x-hidden` cuts it. */}
        <CardHeader
          action={
            <div className="flex items-center gap-2">
              {onEdit ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onEdit}
                  // `leftIcon`, not a child: `Button` wraps its children in one
                  // `<span>`, so an icon passed as a child sits inside that span
                  // and never gets the flex `gap` between glyph and label.
                  leftIcon={<Pencil width={14} height={14} strokeWidth={1.75} />}
                >
                  {filled.length > 0 ? 'Edit' : 'Add details'}
                </Button>
              ) : (
                <ScrollText width={18} height={18} strokeWidth={1.75} className="text-text-muted" />
              )}
              <HowThisWorks
                surface="admin-dealer-outlet-profile"
                label="Outlet details"
                variant="icon"
              />
            </div>
          }
        >
          <div className="min-w-0">
            <CardTitle>Outlet details</CardTitle>
            <CardSubtitle>
              {/* No claim about chat here. Whether the app answers a dealer at
                  all depends on their own first-line mode, which this screen
                  does not know — and the per-field decision that IS an admin's
                  to make is on the custom-detail checkbox, where it belongs. */}
              {filled.length > 0
                ? 'The registration file for this pump.'
                : 'Nothing recorded yet — the oil company, the licences, the codes.'}
            </CardSubtitle>
          </div>
        </CardHeader>
        {expiringSoon.length > 0 ? (
          <CardContent>
            {/* The one thing on this screen somebody has to act on, so it leads
                rather than sitting six rows down inside the Licences card. */}
            <ul className="grid gap-2">
              {expiringSoon.map((f) => (
                <li key={f.key} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge intent={EXPIRY_BADGE[f.expiryState!].intent}>
                    {EXPIRY_BADGE[f.expiryState!].text}
                  </Badge>
                  <span className="min-w-0 break-words text-text">{f.label}</span>
                  <span className="text-text-muted">
                    {f.expiryState === 'expired' ? 'since' : 'on'} {formatYmd(f.expiresOn)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        ) : null}
      </Card>

      {groups.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          {groups.map((group) => (
            <Card key={group.group}>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle>{group.label}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <KeyValueList
                  // Without it a code cannot be selected or long-pressed on a
                  // phone at all — `#root` is `user-select: none` and the
                  // long-press allow-list is matched with `closest()`.
                  className="select-text"
                  items={group.fields.flatMap(itemsFor)}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The IST calendar day of an instant, `YYYY-MM-DD`.
 *
 * Fixed offset: India has not observed DST since 1945, which is why the backend
 * writes the same three lines rather than reaching for a timezone library.
 */
const IST_OFFSET_MS = 330 * 60 * 1000;
function istDay(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** One resolved field as one or two `KeyValueList` rows. */
function itemsFor(field: ResolvedDealerProfileField): KeyValueItem[] {
  const transcribed = field.kind === 'code' || field.kind === 'phone';
  const value: KeyValueItem = {
    key: field.key,
    label: field.label,
    value: field.kind === 'date' ? formatYmd(field.value) : field.value,
    mono: transcribed,
    // Every identifier here is retyped into a portal by hand. `Copyable` is
    // also the only way to get one off the screen on a phone.
    copyable: transcribed,
  };
  if (!field.expiryLabel) return [value];
  return [
    value,
    {
      key: `${field.key}:expiry`,
      label: field.expiryLabel,
      value: field.expiresOn ? (
        <span className="flex flex-wrap items-center gap-2">
          <span>{formatYmd(field.expiresOn)}</span>
          {field.expiryState ? (
            <Badge intent={EXPIRY_BADGE[field.expiryState].intent}>
              {EXPIRY_BADGE[field.expiryState].text}
            </Badge>
          ) : null}
        </span>
      ) : (
        'Not recorded'
      ),
    },
  ];
}
