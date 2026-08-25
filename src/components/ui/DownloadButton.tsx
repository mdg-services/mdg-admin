import { Download } from 'lucide-react';
import * as React from 'react';

import { downloadFile } from '@/lib/downloadFile';

import { Button, type ButtonSize } from './Button';
import { useToast } from './Toast';

/**
 * The only supported way to put a file on the device.
 *
 * Everything else that looks like it should work is a silent no-op inside the
 * Expo shell, and every one of them had shipped here: a synthetic
 * `target="_blank"` click (the shell runs `setSupportMultipleWindows={false}`,
 * so the second window is dropped on the floor), a cross-origin `<a download>`
 * (the attribute is ignored across origins, and the anchor navigates the
 * WebView off the SPA), and a `blob:` URL (Android's download manager cannot
 * read one). That is the DSR Excel and JSON, the Credit & DOD source files
 * including the PAD statement, and every run artifact — all of them a tap that
 * did nothing and said nothing.
 *
 * `downloadFile` picks the route that works where the app is actually running.
 * This adds the two things a button owes the person pressing it: a spinner
 * while the bridge is in flight, and a toast when it fails. A download either
 * produces a file or an explanation — never nothing.
 *
 * It also inherits `Button`'s `min-h-11 md:min-h-0` floor, which is how the six
 * hand-rolled 32px `h-8` download controls get to 44px without touching them.
 */
export interface DownloadButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** A fetchable URL. Required inside the native shell — see `downloadFile`. */
  url?: string;
  /** Build the file on demand. Browser-only path. */
  blob?: () => Blob | Promise<Blob>;
  filename: string;
  contentType?: string;
  kind?: 'image' | 'file' | 'audio';
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: ButtonSize;
  /**
   * Called on success with where the file went. Supply it to own the
   * confirmation yourself; without it this shows a toast naming the
   * destination, because a gallery save leaves no other trace on screen.
   */
  onDone?: (mode: 'gallery' | 'browser') => void;
}

/**
 * A name for the saved file, taken from the URL's own last path segment — for a
 * signed S3 link that is the storage key's basename, i.e. what the object was
 * uploaded as. Only an unparseable URL falls back to the caller's label.
 *
 * It lives beside the button rather than in `downloadFile` because it is a
 * presentation guess, not part of the download contract: every caller that
 * knows the real filename should pass it and skip this.
 */
export function filenameFromUrl(url: string, fallback: string): string {
  try {
    const { pathname } = new URL(url, window.location.href);
    const base = pathname.slice(pathname.lastIndexOf('/') + 1);
    if (base) return decodeURIComponent(base);
  } catch {
    // Not a parseable URL — the fallback is the answer.
  }
  return fallback;
}

export function DownloadButton({
  url,
  blob,
  filename,
  contentType,
  kind,
  label = 'Download',
  variant = 'secondary',
  size = 'sm',
  onDone,
  disabled,
  ...rest
}: DownloadButtonProps) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  // The button can unmount while the bridge is still deciding — a drawer that
  // closes behind the download, a list that refetches. Settling state on a dead
  // component is a React warning and, worse, a toast nobody asked for.
  const aliveRef = React.useRef(true);
  React.useEffect(
    () => () => {
      aliveRef.current = false;
    },
    [],
  );

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      // The blob is built even when the shell will refuse it. `downloadFile`
      // owns the sentence explaining why a locally-built file cannot leave the
      // WebView, and duplicating that message here is how the two drift apart.
      const built = blob ? await blob() : undefined;
      const result = await downloadFile({
        ...(url ? { url } : {}),
        ...(built ? { blob: built } : {}),
        filename,
        ...(contentType ? { contentType } : {}),
        ...(kind ? { kind } : {}),
      });
      if (!aliveRef.current) return;
      if (!result.ok) {
        toast.error('The download did not finish', {
          description: result.reason ?? 'Try again in a moment.',
        });
        return;
      }
      if (onDone) {
        onDone(result.mode ?? 'browser');
        return;
      }
      toast.success(
        result.mode === 'gallery'
          ? `${filename} was saved to your photos`
          : `${filename} was handed to your browser`,
      );
    } catch (err) {
      if (!aliveRef.current) return;
      toast.error('The download did not finish', {
        description:
          err instanceof Error && err.message
            ? err.message
            : 'The file could not be prepared.',
      });
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      loading={busy}
      disabled={disabled}
      onClick={() => void run()}
      leftIcon={
        <Download
          width={size === 'sm' ? 14 : 16}
          height={size === 'sm' ? 14 : 16}
          strokeWidth={1.75}
        />
      }
      {...rest}
    >
      {label}
    </Button>
  );
}
