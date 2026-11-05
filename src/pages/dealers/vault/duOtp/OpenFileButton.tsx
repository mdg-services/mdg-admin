import { ExternalLink } from 'lucide-react';
import * as React from 'react';

import { Button, useToast } from '@/components/ui';
import { isNativeShell, requestNativeDownload } from '@/lib/nativeBridge';

/**
 * Open a paper through its short-lived link.
 *
 * Inside the admin's phone shell `window.open` is unreliable (the shell runs
 * with `setSupportMultipleWindows={false}`), so the shell's own handler saves the
 * file and hands it to whatever the phone uses for PDFs; an older shell that
 * never answers falls through to the browser. In a browser it is a plain new tab.
 *
 * A link that has expired answers an error page rather than the file, so the
 * pane's live refresh matters: every re-read brings fresh links.
 */
export function OpenFileButton({ url, filename }: { url: string | null; filename: string }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  if (!url) {
    return <span className="text-xs text-text-subtle">No link right now</span>;
  }

  async function open(link: string): Promise<void> {
    if (isNativeShell()) {
      setBusy(true);
      try {
        const result = await requestNativeDownload({
          id: `du-otp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          url: link,
          filename,
          contentType: 'application/pdf',
          kind: 'file',
        });
        if (result.ok) return;
        if (!result.timedOut) {
          toast.error(result.error || 'Could not open the paper');
          return;
        }
        // An old shell without the handler: fall through to the browser.
      } finally {
        setBusy(false);
      }
    }
    window.open(link, '_blank', 'noopener');
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      tone="brand"
      padding="none"
      loading={busy}
      leftIcon={<ExternalLink width={14} height={14} strokeWidth={1.75} />}
      onClick={() => void open(url)}
      aria-label={`Open ${filename}`}
    >
      Open
    </Button>
  );
}
