import { ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui';
import { useOpenPaper } from '@/hooks/useOpenPaper';

/**
 * Open a paper (always a PDF by the time it is stored) through its short-lived
 * link.
 *
 * Inside the admin's phone app, or on a narrow screen, it opens in the app's own
 * PDF reader — the shell's file handler used to hand it to Chrome, out of the
 * app. In a laptop browser it is a plain new tab. See `useOpenPaper`.
 *
 * A link that has expired answers an error page rather than the file, so the
 * pane's live refresh matters: every re-read brings fresh links.
 */
export function OpenFileButton({ url, filename }: { url: string | null; filename: string }) {
  const paper = useOpenPaper('Could not open the paper');

  if (!url) {
    return <span className="text-xs text-text-subtle">No link right now</span>;
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        tone="brand"
        padding="none"
        leftIcon={<ExternalLink width={14} height={14} strokeWidth={1.75} />}
        onClick={() =>
          paper.open({
            viewUrl: url,
            downloadUrl: url,
            filename,
            contentType: 'application/pdf',
          })
        }
        aria-label={`Open ${filename}`}
      >
        Open
      </Button>
      {paper.reader}
    </>
  );
}
