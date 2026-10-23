import { Download } from 'lucide-react';
import * as React from 'react';

import { Button, type KeyValueItem, KeyValueList, useToast } from '@/components/ui';
import { useGstDocumentDownload, useIssueInvoice } from '@/hooks/api/usePayments';
import { downloadFile } from '@/lib/downloadFile';
import { istStamp } from '@/lib/intake';
import {
  billToFacts,
  billToHint,
  canEditBillTo,
  canIssueInvoice,
  creditNoteLine,
  invoiceSentence,
  issuedMessage,
  newestFirst,
  splitText,
} from '@/pages/payments/format';
import type { AdminPayment, GstDocumentSummary } from '@dk/shared';

/**
 * Who the GST invoice is made out to, with a button to say or correct it while
 * the invoice has not been issued. Read-only after: the name and address on an
 * issued invoice are the legal record (ADR 0022 §11).
 */
export function BillToCard({ payment: p, onEdit }: { payment: AdminPayment; onEdit: () => void }) {
  const facts = p.billTo ? billToFacts(p.billTo) : null;
  const items: KeyValueItem[] = facts
    ? [
        { key: 'name', label: 'Name', value: facts.name },
        // A GSTIN is read out over the phone and pasted into returns, so it is copyable;
        // "Not registered for GST" is a sentence, not something to copy.
        p.billTo?.gstin
          ? { key: 'gstin', label: 'GSTIN', value: facts.gstin, mono: true, copyable: true }
          : { key: 'gstin', label: 'GSTIN', value: facts.gstin },
        { key: 'address', label: 'Address', value: facts.address, block: true },
        { key: 'state', label: 'State', value: facts.state },
      ]
    : [];

  return (
    <div className="grid gap-2">
      {facts ? (
        <KeyValueList items={items} labelWidth="150px" />
      ) : (
        <p className="text-sm text-text-muted">Nobody is named to bill yet.</p>
      )}
      <p className="text-xs text-text-subtle">{billToHint(p)}</p>
      {canEditBillTo(p) ? (
        <div>
          <Button size="sm" variant="secondary" onClick={onEdit}>
            {p.billTo ? 'Change who to bill' : 'Add who to bill'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The invoice for a paid payment: its number, date and tax split with a
 * Download — or, while there is none, the plain reason and an Issue invoice
 * button. The reason is the server's (`invoiceBlocker`); the button is offered
 * only when pressing it can work (`canIssueInvoice`).
 */
export function InvoiceBody({ payment: p }: { payment: AdminPayment }) {
  const toast = useToast();
  const issue = useIssueInvoice();
  const sentence = invoiceSentence(p);

  async function onIssue() {
    if (issue.isPending) return;
    try {
      const after = await issue.mutateAsync(p.id);
      toast.success(issuedMessage(after));
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
    }
  }

  if (p.invoice) {
    const inv = p.invoice;
    return (
      <div className="grid gap-3">
        <KeyValueList
          labelWidth="150px"
          items={[
            {
              key: 'number',
              label: 'Invoice number',
              value: inv.number,
              mono: true,
              copyable: true,
            },
            { key: 'issued', label: 'Issued', value: istStamp(inv.issuedAt) || '—' },
            { key: 'split', label: 'Tax split', value: splitText(inv), block: true },
          ]}
        />
        <div>
          <GstDocumentButton paymentId={p.id} doc={inv} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {sentence ? <p className="text-sm text-text-muted">{sentence}</p> : null}
      <div>
        <Button
          size="sm"
          loading={issue.isPending}
          disabled={!canIssueInvoice(p)}
          onClick={() => void onIssue()}
        >
          Issue invoice
        </Button>
      </div>
    </div>
  );
}

/** Credit notes, one per refund that went through, each with the invoice it reduces. */
export function CreditNotesBody({ payment: p }: { payment: AdminPayment }) {
  const notes = newestFirst(p.creditNotes, (c) => c.issuedAt);
  return (
    <ul className="grid gap-2">
      {notes.map((c) => (
        <li key={c.id} className="rounded-md border border-border p-2.5">
          <p className="select-text break-all font-mono text-sm text-text">{c.number}</p>
          <p className="mt-0.5 break-words text-sm text-text-muted">{creditNoteLine(c)}</p>
          <p className="mt-0.5 break-words text-xs tabular-nums text-text-subtle">
            {splitText(c)} · {istStamp(c.issuedAt)}
          </p>
          <div className="mt-2">
            <GstDocumentButton paymentId={p.id} doc={c} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Download a GST invoice or credit note as a PDF.
 *
 * The file is a short-lived signed link the server makes when asked, so it is
 * fetched on the press and never kept: a link kept from an earlier press would
 * have expired. The first ask for a document can take a few seconds while the
 * server draws the PDF, so the button spins for the whole of it. The save itself
 * goes through `downloadFile`, the one route that works inside the phone app as
 * well as in a browser, and a failure at either step is a toast with a reason —
 * never a press that appears to do nothing.
 */
export function GstDocumentButton({
  paymentId,
  doc,
}: {
  paymentId: string;
  doc: GstDocumentSummary;
}) {
  const toast = useToast();
  const fetchLink = useGstDocumentDownload();
  const [saving, setSaving] = React.useState(false);
  const busy = fetchLink.isPending || saving;
  const what = doc.kind === 'invoice' ? 'invoice' : 'credit note';

  async function run() {
    if (busy) return;
    try {
      const { url, filename } = await fetchLink.mutateAsync({ paymentId, docId: doc.id });
      setSaving(true);
      const result = await downloadFile({
        url,
        filename,
        contentType: 'application/pdf',
        kind: 'file',
      });
      if (!result.ok) {
        toast.error('The download did not finish', {
          description: result.reason ?? 'Try again in a moment.',
        });
        return;
      }
      toast.success(`${filename} was handed to your browser`);
    } catch (e) {
      toast.error(`Could not get the ${what}`, {
        description: e instanceof Error && e.message ? e.message : 'Try again in a moment.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      loading={busy}
      onClick={() => void run()}
      leftIcon={<Download width={14} height={14} strokeWidth={1.75} />}
    >
      {doc.kind === 'invoice' ? 'Download invoice' : 'Download credit note'}
    </Button>
  );
}
