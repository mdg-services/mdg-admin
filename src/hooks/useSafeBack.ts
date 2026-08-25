import * as React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * "Back" that cannot walk out of the app.
 *
 * `navigate(-1)` assumes there is somewhere to go back to. There often is not:
 * a push notification deep-links straight to `/inbox?c=<id>`, so the thread is
 * the *first* entry in the session's history and Back leaves the admin staring
 * at whatever preceded the app — or at a blank tab. React Router stamps its own
 * position on `history.state.idx`, so a zero there means "this is where we came
 * in"; in that case go to `fallback` instead, replacing the entry so the two
 * screens do not build a loop between them.
 */
export function useSafeBack(fallback: string): () => void {
  const navigate = useNavigate();
  return React.useCallback(() => {
    const idx =
      typeof window === 'undefined'
        ? undefined
        : (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1);
      return;
    }
    navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}
