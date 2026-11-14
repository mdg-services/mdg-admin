import * as React from 'react';

import { Button, Input, useToast } from '@/components/ui';
import { useSettleUnclearPress } from '@/hooks/api/useFuelIndent';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { FuelOrderView } from '@dk/shared';

import { EVENT_WORDS, NOTICE_STATE_WORDS, productName } from './format';

interface Step {
  at: string | null;
  text: string;
}

/**
 * One chat order's story, oldest first, built from what the server keeps on the
 * order (ADR 0041, robustness pass): who set each part of the draft, the
 * read-back the owner answered, the yes (and whether it was the "ek aur" kind on
 * top of an order already there), the run that pressed, and every message MDG
 * sent about it with its state. Folded by default: it is for the call where an
 * owner says "I never asked for that".
 */
export function OrderTimeline({ order: o }: { order: FuelOrderView }) {
  const [open, setOpen] = React.useState(false);
  const t = o.trail;
  if (!t) return null;
  const steps: Step[] = [];
  const sb = t.setBy;
  if (sb?.deliveryDate) steps.push({ at: sb.deliveryDate.at, text: `${sb.deliveryDate.userName ?? 'An owner'} set the date` });
  for (const l of sb?.lines ?? []) {
    steps.push({
      at: l.at,
      text: `${l.userName ?? 'An owner'} set ${productName(l.product, l.product)} to ${l.kl ?? '?'} KL`,
    });
  }
  if (sb?.tanker) steps.push({ at: sb.tanker.at, text: `${sb.tanker.userName ?? 'An owner'} set the tanker` });
  if (t.replacesOrderNo) steps.push({ at: null, text: `Replaces order ${t.replacesOrderNo} (placed only after that one is cancelled)` });
  if (t.readBackMessageId) steps.push({ at: null, text: `Read back in the chat (message ${t.readBackMessageId})` });
  if (o.confirmed) {
    const extra = t.extraConfirmed
      ? ` — an EXTRA load on top of ${t.acknowledgedKeys.map((k) => k.replace(/^sap:/, 'order ').replace(/^id:.*/, 'a chat order')).join(', ')}`
      : '';
    steps.push({
      at: o.confirmed.at,
      text: `${o.confirmed.byName ?? 'An owner'} said yes${o.confirmed.text ? `: “${o.confirmed.text}”` : ''}${extra}`,
    });
  }
  if (t.cancelWanted) steps.push({ at: t.cancelWanted.at, text: 'The owner said stop, too late; the placed message offered the cancel' });
  if (t.lastAttempt) steps.push({ at: t.lastAttempt.at, text: `The portal could not be reached (${t.lastAttempt.code})` });
  if (o.submit?.at) {
    steps.push({
      at: o.submit.at,
      text: `Run ${t.runId ?? '—'}: ${o.submit.verdict ?? 'no answer'}${o.submit.reason ? ` (${o.submit.reason})` : ''}`,
    });
  }
  for (const [event, n] of Object.entries(t.notices)) {
    if (!n) continue;
    steps.push({
      at: n.at,
      text: `${EVENT_WORDS[event] ?? event}: ${NOTICE_STATE_WORDS[n.state] ?? n.state}${n.key ? ` (${n.key})` : ''}`,
    });
  }
  steps.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));

  return (
    <span className="block">
      <button type="button" className="min-h-11 text-xs font-medium text-brand underline md:min-h-0" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide the timeline' : 'Show the timeline'}
      </button>
      {open ? (
        <ol className="mt-1 grid gap-0.5 text-xs text-text-muted">
          {steps.map((s, i) => (
            <li key={i} className="break-words">
              {s.at ? <span className="tabular-nums text-text-subtle">{formatDateTime(s.at)} · </span> : null}
              {s.text}
            </li>
          ))}
        </ol>
      ) : null}
    </span>
  );
}

/**
 * Submit was pressed and the portal's answer was lost, and the list has not
 * settled it. A person checks View/Cancel Indents and records how it ended:
 * placed as order X, or not placed. Nothing is pressed; the owner is told.
 */
export function SettlePress({ dealerId, indentId }: { dealerId: string; indentId: string }) {
  const settle = useSettleUnclearPress(dealerId);
  const toast = useToast();
  const [no, setNo] = React.useState('');
  const fail = (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'Could not record it');
  const valid = /^\d{4,14}$/.test(no.trim());
  return (
    <span className="mt-1 block text-xs text-text-muted">
      Submit was pressed, the answer was not read. After checking the portal:
      <span className="mt-1 flex flex-wrap items-center gap-2">
        <span className="w-40">
          <Input
            aria-label="Order number on the portal"
            placeholder="Order no."
            inputMode="numeric"
            value={no}
            onChange={(e) => setNo(e.target.value.replace(/\D/g, ''))}
          />
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={settle.isPending || !valid}
          onClick={() => settle.mutate({ indentId, outcome: 'placed', sapOrderNo: no.trim() }, { onError: fail })}
        >
          It went through as this order
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={settle.isPending}
          onClick={() => settle.mutate({ indentId, outcome: 'not_placed' }, { onError: fail })}
        >
          It was not placed
        </Button>
      </span>
    </span>
  );
}
