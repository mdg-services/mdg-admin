import * as React from 'react';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Checkbox,
  Dialog,
  FieldError,
  Input,
  Label,
  useToast,
} from '@/components/ui';
import { BillToFields } from '@/features/payments/BillToFields';
import { useStartOldOutletOnboarding } from '@/hooks/api/useOnboarding';
import { usePaymentsQuery } from '@/hooks/api/usePayments';
import { istTodayYmd } from '@/lib/format';
import { addDays, formatPaise, isDay, ymdLabel } from '@/lib/onboarding';
import {
  type BillToDraft,
  type BillToProblems,
  billToDraftFrom,
  billToForOutlet,
  checkBillTo,
} from '@/pages/payments/format';
import type { Dealer } from '@dk/shared';

/** The last day of this month: what an outlet that has paid this month is paid up to. */
function endOfThisMonth(today: string): string {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return addDays(next, -1);
}

/** A value from the outlet's file, or ''. */
function profileValue(dealer: Dealer, key: string): string {
  return dealer.outletProfile?.find((e) => e.key === key)?.value ?? '';
}

/**
 * An outlet that is not on app onboarding yet (one served before the app) says so on
 * its Info tab, with "Start app onboarding". That gives it a new outlet's setup, with
 * every step it has already given us filled in (`oldOutletBilling.ts` on the server),
 * and the Setup card takes this card's place.
 */
export function StartBillingCard({ dealer }: { dealer: Dealer }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Setup</CardTitle>
          <CardSubtitle>Not on app onboarding yet.</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent>
        <Button size="sm" onClick={() => setOpen(true)}>
          Start app onboarding…
        </Button>
      </CardContent>
      <StartOnboardingDialog dealer={dealer} open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

function StartOnboardingDialog({
  dealer,
  open,
  onClose,
}: {
  dealer: Dealer;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const start = useStartOldOutletOnboarding();
  const uid = React.useId();
  const today = istTodayYmd();
  const [billTo, setBillTo] = React.useState<BillToDraft>(billToDraftFrom(null));
  const [paid, setPaid] = React.useState(false);
  const [free, setFree] = React.useState(false);
  const [paidThrough, setPaidThrough] = React.useState(endOfThisMonth(today));
  // The outlet's open bills: one may be kept as its first bill instead of raising another.
  const openQ = usePaymentsQuery({ status: 'due', dealerId: dealer.id, page: 1, limit: 20 }, open);
  const openBills = openQ.data?.items ?? [];
  const [keepId, setKeepId] = React.useState<string | null>(null);
  // Problems wait for a press of Start: showing them against untouched boxes is a scolding.
  const [attempted, setAttempted] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Each opening starts over from what the outlet's file already holds.
  React.useEffect(() => {
    if (!open) return;
    const base: BillToDraft = {
      ...billToDraftFrom(null),
      name: profileValue(dealer, 'pumpName'),
      address: profileValue(dealer, 'pumpSite'),
    };
    setBillTo(billToForOutlet(base, dealer.gst, false));
    setPaid(false);
    setFree(false);
    setKeepId(null);
    setPaidThrough(endOfThisMonth(istTodayYmd()));
    setAttempted(false);
    setFormError(null);
  }, [open, dealer]);

  // Bill-to may be left empty: the owner is then asked for it in the app, as a new outlet is.
  const check = checkBillTo(billTo, false);
  const billToShown: BillToProblems = attempted && check.kind === 'bad' ? check.problems : {};
  const paidOk = !paid || (isDay(paidThrough) && paidThrough >= today);

  async function submit() {
    if (start.isPending) return;
    setAttempted(true);
    setFormError(null);
    if (!free && (check.kind === 'bad' || !paidOk)) return;
    try {
      await start.mutateAsync({
        dealerId: dealer.id,
        body: {
          billing: !free && check.kind === 'ok' ? check.billTo : null,
          paidThrough: !free && paid ? paidThrough : null,
          firstBillId: free || paid ? null : keepId,
          free,
        },
      });
      toast.success(`${dealer.code ?? 'The outlet'} is on app onboarding.`);
      onClose();
    } catch (e) {
      setFormError(e instanceof Error && e.message ? e.message : 'That did not go through.');
    }
  }

  return (
    <Dialog
      open={open}
      onClose={start.isPending ? () => {} : onClose}
      title={`Start app onboarding for ${dealer.code ?? 'this outlet'}`}
      description="The same steps as a new outlet. Whatever the outlet has already given us is filled in and not asked again."
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={start.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={start.isPending}>
            Start app onboarding
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Checkbox
          checked={free}
          onChange={(e) => setFree(e.target.checked)}
          label="Served free"
          hint="Never billed: no bill-to, bill or payment is asked for or sent."
          align="start"
        />

        {free ? null : (
          <>
            <div className="grid gap-2">
              <p className="text-sm font-semibold text-text">Bill to</p>
              <p className="text-xs text-text-muted">
                Filled from the outlet&rsquo;s file. Leave it empty and the owner is asked in the
                app.
              </p>
              <BillToFields value={billTo} onChange={setBillTo} problems={billToShown} />
            </div>

            {openBills.length > 0 && !paid ? (
              <div className="grid gap-2">
                {openBills.map((b) => (
                  <Checkbox
                    key={b.id}
                    checked={keepId === b.id}
                    onChange={(e) => setKeepId(e.target.checked ? b.id : null)}
                    label={`Keep ${b.number} as the first bill`}
                    hint={`${formatPaise(b.amountPaise)}${b.dueDate ? `, due ${ymdLabel(b.dueDate)}` : ''}. Paying it counts as the outlet's first payment; no new bill is sent.`}
                    align="start"
                  />
                ))}
              </div>
            ) : null}

            <div className="grid gap-2">
              <Checkbox
                checked={paid}
                onChange={(e) => {
                  setPaid(e.target.checked);
                  if (e.target.checked) setKeepId(null);
                }}
                label="Already paid for this month"
                hint="The next bill goes from the app by itself when this month ends."
                align="start"
              />
              {paid ? (
                <div>
                  <Label htmlFor={`${uid}-paid`} required>
                    Paid up to
                  </Label>
                  <Input
                    id={`${uid}-paid`}
                    type="date"
                    value={paidThrough}
                    min={today}
                    onChange={(e) => setPaidThrough(e.target.value)}
                    invalid={attempted && !paidOk}
                  />
                  <FieldError
                    message={attempted && !paidOk ? 'Pick a day from today on.' : undefined}
                  />
                </div>
              ) : null}
            </div>
          </>
        )}
        <FieldError message={formError ?? billToShown.form} />
      </form>
    </Dialog>
  );
}
