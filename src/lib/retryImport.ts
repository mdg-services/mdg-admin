/** Key under which "we already reloaded once for a missing chunk" is remembered. */
const RELOADED_KEY = 'dk.chunk-reload';

/** Backoff between the first attempt and the retry. */
const RETRY_DELAY_MS = 700;

function alreadyReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOADED_KEY) === '1';
  } catch {
    // Storage can throw outright — a WebView with site data blocked. A guard we
    // cannot write is worse than no reload at all: it would reload, forget, and
    // reload again. Read an unusable store as "already done" and let the error
    // reach the ErrorBoundary instead.
    return true;
  }
}

function rememberReload(done: boolean) {
  try {
    if (done) sessionStorage.setItem(RELOADED_KEY, '1');
    else sessionStorage.removeItem(RELOADED_KEY);
  } catch {
    // See above. Nothing downstream depends on this having worked.
  }
}

/**
 * Wraps a `React.lazy` factory so the two ways a split bundle fails on the
 * phones this runs on do not end the session.
 *
 * **The request just drops.** A cell handover or a 2G stall kills the chunk
 * request. One retry after a short pause clears almost all of these. The retry
 * has to happen INSIDE the factory, and that is the trap worth naming:
 * `React.lazy` calls its factory exactly once and then remembers the outcome
 * forever — on rejection it parks the component in a Rejected state and every
 * later render re-throws the same error without ever asking again. So the
 * ErrorBoundary's "Try again" button, the obvious way out, cannot work by
 * itself. Retrying here is the only place it can be done.
 *
 * **The chunk is gone.** The admin app is a WebView shell around a deployed
 * SPA, so a session routinely outlives the deploy it started on. Chunk
 * filenames carry a content hash, and after a redeploy the ones this page was
 * built against 404. Nothing recovers that in place; the fix is to fetch the
 * new `index.html`, which means one reload. It happens at most once per tab —
 * a genuinely offline device would otherwise reload forever — and the flag is
 * cleared as soon as any chunk loads, so a second deploy later in the same
 * session can still heal itself.
 *
 * Before the bundle was split there were no chunks to lose and none of this was
 * reachable, which is exactly why it has to be handled now.
 */
export function retryImport<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      const mod = await load();
      rememberReload(false);
      return mod;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      try {
        const mod = await load();
        rememberReload(false);
        return mod;
      } catch (err) {
        if (alreadyReloaded()) throw err;
        rememberReload(true);
        window.location.reload();
        // Never settle: the reload is already in flight, and rejecting here
        // would flash the crash screen on the way out.
        return new Promise<T>(() => {});
      }
    }
  };
}
