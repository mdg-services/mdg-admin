import { AlertTriangle, Maximize2 } from 'lucide-react';
import * as React from 'react';

import { Button, ImageLightbox } from '@/components/ui';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { describeCreditDodFailure } from '@/lib/creditDodFailure';
import type { ServiceRunWithSteps } from '@/types/serviceRun';

interface Props {
  run: ServiceRunWithSteps;
  /** `attachment`-flavoured URL — saves the file. */
  buildArtifactUrl: (artifactId: string) => string;
  /**
   * `inline`-flavoured URL, for the screenshot we RENDER and the "open full
   * size" link. Signed download URLs now carry `Content-Disposition:
   * attachment`, so opening one in a new tab downloads it instead of showing it.
   * Falls back to `buildArtifactUrl` when the caller has no inline twin.
   */
  buildArtifactViewUrl?: (artifactId: string) => string;
}

/**
 * Failure summary for a FAILED `credit-dod-monitoring` run.
 *
 * Every viewer gets the plain-language "what went wrong / what to do" pair. The
 * diagnostics that sit under it — the step it failed at, the raw error message
 * and the `fail_*.png` capture — are super-admin only, and their labels are
 * gated with them so a plain admin never sees an empty "Technical details"
 * stub.
 */
export function CreditDodFailurePanel({
  run,
  buildArtifactUrl,
  buildArtifactViewUrl,
}: Props) {
  const isSuperAdmin = useIsSuperAdmin();
  const viewUrl = buildArtifactViewUrl ?? buildArtifactUrl;
  const { phase, copy, message } = describeCreditDodFailure(run);
  const [shotOpen, setShotOpen] = React.useState(false);

  const hint = isSuperAdmin ? copy.hint : copy.adminHint ?? copy.hint;

  const shot = isSuperAdmin
    ? (run.artifacts ?? []).find(
        (a) =>
          a.filename.startsWith('fail_') &&
          a.filename.toLowerCase().endsWith('.png'),
      )
    : undefined;

  return (
    <div className="rounded-md border border-danger bg-danger-soft p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle
          width={20}
          height={20}
          strokeWidth={2}
          className="mt-0.5 shrink-0 text-danger"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-danger">{copy.title}</p>
          <p className="mt-1 text-sm text-text">{hint}</p>

          {isSuperAdmin && phase ? (
            <p className="mt-2 text-xs text-text-muted">
              Failed at step:{' '}
              <span className="font-semibold text-text">{phase}</span>
            </p>
          ) : null}

          {isSuperAdmin && message ? (
            <details className="mt-2 text-xs">
              {/* A `<summary>` is a ~16px target by default. */}
              <summary className="inline-flex min-h-11 cursor-pointer select-none items-center text-text-muted hover:text-text md:min-h-0">
                Technical details
              </summary>
              {/* `.scroll-pane` is `overscroll-behavior: contain`: this sits
                  inside the run Dialog's own scroller, and without it reaching
                  the end of the stack drags the sheet closed mid-read. */}
              <pre className="scroll-pane mt-1 overflow-x-auto whitespace-pre-wrap rounded-sm bg-surface-2 p-2 font-mono text-xs text-text-muted">
                {message}
              </pre>
            </details>
          ) : null}
        </div>
      </div>

      {shot ? (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Screenshot at failure
          </p>
          {/* This is a full desktop SDMS page rendered ~296px wide on a phone,
              with pinch-zoom off app-wide. The only route to reading it was a
              16px-tall `target="_blank"` link. Both the image and the button
              now open the shared lightbox, which has real pinch and pan — and
              the run dialog behind it survives, which a navigation would not. */}
          <button
            type="button"
            onClick={() => setShotOpen(true)}
            aria-label="Open the failure screenshot full size"
            className="block w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            style={{ maxWidth: 480 }}
          >
            <img
              src={viewUrl(shot.id)}
              alt="SDMS page at the point of failure"
              draggable={false}
              className="w-full rounded-md border border-border bg-surface"
            />
          </button>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2 w-full md:w-auto"
            onClick={() => setShotOpen(true)}
            leftIcon={<Maximize2 width={14} height={14} strokeWidth={1.75} />}
          >
            Open full size
          </Button>
          <ImageLightbox
            open={shotOpen}
            onClose={() => setShotOpen(false)}
            src={viewUrl(shot.id)}
            alt="SDMS page at the point of failure"
            title={shot.filename}
            downloadUrl={buildArtifactUrl(shot.id)}
          />
        </div>
      ) : null}
    </div>
  );
}
