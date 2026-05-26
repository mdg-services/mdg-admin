import { AlertCircle } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => this.setState({ error: null });

  override render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
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
            <p className="mb-4 text-sm text-text-muted">
              {this.state.error.message}
            </p>
            <Button variant="secondary" onClick={this.reset}>
              Try again
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
