import { useQueryClient } from '@tanstack/react-query';
import { Download, Eye } from 'lucide-react';
import * as React from 'react';

import {
  ActionRow,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  useToast,
} from '@/components/ui';
import { fetchClaimFileUrls } from '@/hooks/api/useCalibrationClaim';
import { downloadFile } from '@/lib/downloadFile';
import { formatDateTime } from '@/lib/format';
import type { CalibrationClaimView, ClaimDocumentView } from '@dk/shared';

import { SLOT_LABEL, SLOT_ORDER, SOURCE_LABEL, fileSize, isClosed, isUploadSlot } from './format';
import { UploadPaperButton } from './UploadPaperButton';

/**
 * The claim's papers: the certificate and the receipt from the Bihar site, the
 * request letter MDG made, the owner's signed copy, and the PDF of it that goes to
 * IndianOil. Each one can be read here (`onView` opens the viewer the pane owns),
 * saved to the device, and — for the three an admin can supply by hand —
 * replaced.
 *
 * A slot an admin could fill that has nothing in it still gets a row with an
 * Upload button, so "the owner emailed me the receipt" has somewhere to go.
 */

/** Save a paper to the device. The signed links are fetched when it is pressed, never earlier. */
function PaperDownloadButton({ claimId, doc }: { claimId: string; doc: ClaimDocumentView }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    try {
      const urls = await fetchClaimFileUrls(qc, claimId, doc.slot);
      const result = await downloadFile({
        url: urls.downloadUrl,
        filename: urls.filename,
        contentType: urls.contentType,
        kind: urls.contentType.startsWith('image/') ? 'image' : 'file',
      });
      if (!result.ok) throw new Error(result.reason || 'The file could not be saved.');
      toast.success(
        result.mode === 'gallery'
          ? `${urls.filename} was saved to your photos`
          : `${urls.filename} was handed to your browser`,
      );
    } catch (err) {
      toast.error('The download did not finish', {
        description:
          err instanceof Error && err.message ? err.message : 'The file could not be prepared.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={busy}
      leftIcon={<Download width={14} height={14} strokeWidth={1.75} />}
      onClick={() => void run()}
    >
      Download
    </Button>
  );
}

export function ClaimPapers({
  dealerId,
  claim,
  onView,
}: {
  dealerId: string;
  claim: CalibrationClaimView;
  onView: (doc: ClaimDocumentView) => void;
}) {
  const open = !isClosed(claim);
  const byslot = new Map(claim.documents.map((d) => [d.slot, d]));
  const slots = SLOT_ORDER.filter((slot) => byslot.has(slot) || (open && isUploadSlot(slot)));

  return (
    <Card>
      <CardHeader padding="comfortable">
        <div>
          <CardTitle>Papers</CardTitle>
          <CardSubtitle>What the claim is made from, and what goes to IndianOil.</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent padding="tight" className="md:p-4">
        {slots.length === 0 ? (
          <p className="px-1 text-sm text-text-muted">No papers are stored for this claim.</p>
        ) : (
          <ul className="divide-y divide-border">
            {slots.map((slot) => {
              const doc = byslot.get(slot);
              return (
                <li
                  key={slot}
                  className="flex flex-col gap-2 px-1 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text">{SLOT_LABEL[slot]}</p>
                    {doc ? (
                      <p className="break-words text-xs text-text-muted">
                        {doc.filename} · {SOURCE_LABEL[doc.source]} · {fileSize(doc.size)} ·{' '}
                        {formatDateTime(doc.addedAt)}
                      </p>
                    ) : (
                      <p className="text-xs text-text-muted">Not here yet.</p>
                    )}
                  </div>
                  <ActionRow below="wrap" align="start" className="shrink-0">
                    {doc ? (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<Eye width={14} height={14} strokeWidth={1.75} />}
                          onClick={() => onView(doc)}
                        >
                          View
                        </Button>
                        <PaperDownloadButton claimId={claim.id} doc={doc} />
                      </>
                    ) : null}
                    {open && isUploadSlot(slot) ? (
                      <UploadPaperButton
                        dealerId={dealerId}
                        claimId={claim.id}
                        slot={slot}
                        label={doc ? 'Replace' : 'Upload'}
                        variant={doc ? 'ghost' : 'secondary'}
                      />
                    ) : null}
                  </ActionRow>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
