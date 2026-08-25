import { AlertCircle } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Label for the second, navigating recovery action. */
  homeLabel?: string;
  /** Where that action goes. Omit it — as the outer, above-the-router boundary
   *  does — and only "Try again" is offered. */
  onGoHome?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render error and offers a way out of it.
 *
 * Two of these are mounted, and the inner one is the important one. Wrapping
 * the router alone means a page that throws also unmounts the sidebar, the
 * header, the tab bar and the back chevron — on a phone that leaves a single
 * "Try again" button on an otherwise empty screen, and if the error is
 * deterministic (bad data for that dealer, say) pressing it just throws again.
 * `AppShell` therefore mounts a second boundary around `<Outlet />`, so the
 * navigation survives the crash and `onGoHome` offers a route that is known to
 * work.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => this.setState({ error: null });

  // Navigating does not clear the caught error by itself — this state is not
  // keyed on the location — so the recovery route has to do both. React batches
  // the two updates, so the crashed page is never re-rendered in between.
  goHome = () => {
    this.props.onGoHome?.();
    this.reset();
  };

  override render() {
    if (this.state.error) {
      return (
        // dvh, not vh: on a phone `60vh` measures the LARGE viewport (the one
        // with the browser chrome hidden) and overshoots what is on screen.
        <div className="flex min-h-[60dvh] items-center justify-center p-6">
          <div className="max-w-md rounded-md border border-border bg-surface p-6 text-center shadow-sm">
            <AlertCircle
              width={28}
              height={28}
              strokeWidth={1.75}
              className="mx-auto mb-2 text-danger"
            />
            <h2 className="mb-1 text-lg font-semibold text-text">
              Something went wrong
            </h2>
            <p className="mb-4 break-words text-sm text-text-muted">
              {this.state.error.message}
            </p>
            {/* Stacked full-width below md so both are thumb-sized; the row it
                has always been at md. */}
            <div className="flex flex-col-reverse items-stretch gap-2 md:flex-row md:items-center md:justify-center">
              <Button variant="secondary" onClick={this.reset}>
                Try again
              </Button>
              {this.props.onGoHome ? (
                <Button onClick={this.goHome}>
                  {this.props.homeLabel ?? 'Go back'}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
