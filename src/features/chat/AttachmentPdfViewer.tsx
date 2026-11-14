import { PdfViewer, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { downloadAttachment } from '@/lib/downloadAttachment';
import { fetchPdfBytes, isPdfFile } from '@/lib/pdf';
import type { Attachment } from '@dk/shared';

/** A chat file the app reads itself rather than downloading: a PDF, by name or type. */
export function isPdfAttachment(attachment: Attachment): boolean {
  return isPdfFile(attachment.filename, attachment.contentType);
}

/**
 * The PDF's bytes: through the link that came with the message while it is
 * still good (it is signed for every file the thread shows, including a
 * service's own papers under `dealers/`, which the generic signing route below
 * refuses), and through a freshly signed link once that one has expired.
 */
async function loadAttachmentPdf(attachment: Attachment): Promise<ArrayBuffer> {
  if (attachment.url) {
    try {
      return await fetchPdfBytes(attachment.url);
    } catch {
      // Expired (a 403 from the storage): sign a new one.
    }
  }
  const { url } = await api.get<{ url: string }>('/uploads/download-url', {
    key: attachment.storageKey,
  });
  return fetchPdfBytes(url);
}

/**
 * A PDF from a chat message, read inside the app (`loadAttachmentPdf` above has
 * where the bytes come from), and Save takes
 * the ordinary download road: the phone app's own saver, or a browser download.
 *
 * Before this a PDF tap was always a download, which inside the admin phone app
 * the shell handed to Chrome — out of the app to read one page.
 */
export function AttachmentPdfViewer({
  attachment,
  onClose,
}: {
  attachment: Attachment;
  onClose: () => void;
}) {
  const toast = useToast();
  return (
    <PdfViewer
      title={attachment.filename}
      load={() => loadAttachmentPdf(attachment)}
      onSave={() => {
        downloadAttachment(attachment).catch(() => toast.error('Download failed'));
      }}
      onClose={onClose}
    />
  );
}
