import { statusIntent } from '@/lib/statusIntent';
import type {
  Cadence,
  DealerServiceStatus,
  DealerStatus,
  IrasSnapshotStatus,
  ServiceRunStatus,
  SlaTier,
} from '@dk/shared';


import { Badge } from './Badge';

type Kind =
  | 'dealer'
  | 'dealerService'
  | 'run'
  | 'sla'
  | 'cadence'
  | 'irasSnapshot';
type ValueMap = {
  dealer: DealerStatus;
  dealerService: DealerServiceStatus;
  run: ServiceRunStatus;
  sla: SlaTier;
  cadence: Cadence;
  irasSnapshot: IrasSnapshotStatus;
};

export function StatusChip<K extends Kind>({
  kind,
  value,
}: {
  kind: K;
  value: ValueMap[K];
}) {
  // statusIntent's overloads narrow on kind; cast at the call boundary.
  const intent = statusIntent(kind as 'dealer', value as DealerStatus);
  const label = String(value).replace(/_/g, ' ');
  // Sentence case below md — "Active", "On demand" — so a raw enum does not
  // shout beside the "Expired" and "Sent" chips other screens print on the same
  // phone row. `max-md:` rather than a base class with `md:normal-case` beside
  // it: ANY rule on `::first-letter` makes the browser split the first letter
  // into a box of its own, which loses the kerning between it and the next
  // one — sub-pixel, but enough to shift a table column at md. With `max-md:`
  // no such rule exists from md up, and the label is the capitals it always
  // was.
  return (
    <Badge intent={intent}>
      <span className="inline-block max-md:lowercase max-md:first-letter:uppercase">{label}</span>
    </Badge>
  );
}
