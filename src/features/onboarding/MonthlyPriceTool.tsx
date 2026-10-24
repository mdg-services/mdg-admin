import * as React from 'react';

import { Button, Dialog, FieldError, Input, Label, useToast } from '@/components/ui';
import { useOnboardingConfigQuery, useSetMonthlyPrice } from '@/hooks/api/useOnboarding';
import { ApiError } from '@/lib/api';
import { amountProblem, formatPaise, paiseToRupeesText, parseRupees } from '@/lib/onboarding';

/**
 * The one flat monthly price every new bill is raised at (onboarding v2, owner's
 * decision D2), GST included. Shown to every admin, and changed by any admin.
 * A change applies to bills raised after it — a bill already sent keeps its
 * amount — and every change is kept with who made it.
 */
export function MonthlyPriceTool() {
  const config = useOnboardingConfigQuery();
  const [open, setOpen] = React.useState(false);
  if (!config.data) return null;
  const { monthlyPricePaise, priceHistory } = config.data;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
      <span>
        Monthly price: <span className="font-semibold text-text">{formatPaise(monthlyPricePaise)}</span> a month,
        GST included
      </span>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Change…
      </Button>
      {open ? (
        <ChangePriceDialog
          current={monthlyPricePaise}
          history={priceHistory}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ChangePriceDialog({
  current,
  history,
  onClose,
}: {
  current: number;
  history: Array<{ monthlyPricePaise: number; at: string; byName: string }>;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSetMonthlyPrice();
  const [text, setText] = React.useState(paiseToRupeesText(current));
  const [tried, setTried] = React.useState(false);
  const problem = amountProblem(text);
  const submit = () => {
    setTried(true);
    if (problem) return;
    save.mutate(parseRupees(text) ?? 0, {
      onSuccess: () => {
        toast.success('Monthly price changed. New bills use it; bills already sent keep theirs.');
        onClose();
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not change the price.'),
    });
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Monthly price"
      description="GST included. Applies to bills raised from now on; a bill already sent keeps its amount."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save price
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div>
          <Label htmlFor="monthly-price" required>
            Rupees a month, GST included
          </Label>
          <Input
            id="monthly-price"
            inputMode="decimal"
            value={text}
            invalid={tried && Boolean(problem)}
            onChange={(e) => setText(e.target.value)}
          />
          <FieldError message={tried ? (problem ?? undefined) : undefined} />
        </div>
        {history.length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-medium text-text-muted">Earlier changes</p>
            <ul className="grid gap-0.5 text-xs text-text-muted">
              {history.slice(0, 8).map((h) => (
                <li key={h.at}>
                  {formatPaise(h.monthlyPricePaise)} · {new Date(h.at).toLocaleDateString('en-IN')} ·{' '}
                  {h.byName || 'someone'}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
