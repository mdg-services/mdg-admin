import { AlertTriangle, ExternalLink } from 'lucide-react';

import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { describeCreditDodFailure } from '@/lib/creditDodFailure';
import type { ServiceRunWithSteps } from '@/types/serviceRun';

interface Props {
  run: ServiceRunWithSteps;
  buildArtifactUrl: (artifactId: string) => string;
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
export function CreditDodFailurePanel({ run, buildArtifactUrl }: Props) {
  const isSuperAdmin = useIsSuperAdmin();
  const { phase, copy, message } = describeCreditDodFailure(run);

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
              <summary className="cursor-pointer select-none text-text-muted hover:text-text">
                Technical details
              </summary>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-sm bg-surface-2 p-2 font-mono text-xs text-text-muted">
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
          <a
            href={buildArtifactUrl(shot.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <img
              src={buildArtifactUrl(shot.id)}
              alt="SDMS page at the point of failure"
              className="w-full rounded-md border border-border bg-surface"
              style={{ maxWidth: 480 }}
            />
          </a>
          <a
            href={buildArtifactUrl(shot.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-info hover:underline"
          >
            <ExternalLink width={12} height={12} strokeWidth={1.75} />
            Open full size
          </a>
        </div>
      ) : null}
    </div>
  );
}
