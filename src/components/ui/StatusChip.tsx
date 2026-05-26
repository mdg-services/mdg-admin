import type {
  Cadence,
  DealerServiceStatus,
  DealerStatus,
  ServiceRunStatus,
  SlaTier,
} from '@dk/shared';

import { statusIntent } from '@/lib/statusIntent';

import { Badge } from './Badge';

type Kind = 'dealer' | 'dealerService' | 'run' | 'sla' | 'cadence';
type ValueMap = {
  dealer: DealerStatus;
  dealerService: DealerServiceStatus;
  run: ServiceRunStatus;
  sla: SlaTier;
  cadence: Cadence;
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
  return <Badge intent={intent}>{label}</Badge>;
}
