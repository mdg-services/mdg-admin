import * as React from 'react';

import { Button, Card, CardContent, CardHeader, CardSubtitle, CardTitle } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { CalibrationClaimView } from '@dk/shared';

import { historyNewestFirst } from './format';

/**
 * Everything that happened to the claim, newest first, with who did it. Folded
 * away until asked for: it is the record to look back on, not something to read
 * down on every visit.
 */
export function ClaimHistory({ history }: { history: CalibrationClaimView['history'] }) {
  const [open, setOpen] = React.useState(false);
  const entries = historyNewestFirst(history);

  return (
    <Card>
      <CardHeader
        padding="comfortable"
        align="center"
        action={
          entries.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? 'Hide' : 'Show'}
            </Button>
          ) : undefined
        }
      >
        <div>
          <CardTitle>History</CardTitle>
          <CardSubtitle>
            {entries.length === 0
              ? 'Nothing has happened yet.'
              : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
          </CardSubtitle>
        </div>
      </CardHeader>
      {open && entries.length > 0 ? (
        <CardContent>
          <ul className="divide-y divide-border">
            {entries.map((h, i) => (
              <li key={`${h.at}-${i}`} className="py-2">
                <p className="break-words text-sm text-text">{h.text}</p>
                <p className="text-xs text-text-muted">
                  {h.actorName} · {formatDateTime(h.at)}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}
