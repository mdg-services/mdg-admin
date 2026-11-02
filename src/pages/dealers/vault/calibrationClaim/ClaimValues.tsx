import { PencilLine } from 'lucide-react';

import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  DataList,
  KeyValueList,
  type DataColumn,
} from '@/components/ui';
import type { CalibrationClaimView } from '@dk/shared';

import { NO_VALUE, type Gate, type UnitRow, buildUnitRows, valueRows } from './format';

/**
 * What was read off the two papers, and which dispensing units are in the claim.
 *
 * The values are what the claim will type into IndianOil, with an admin's
 * correction shown in place of the reading and the reading kept beside it — so
 * what is printed is what will be used, and a hand correction is never invisible.
 * "Corrections" lives on this card because this is where a wrong figure is seen.
 */

export function ClaimValues({
  claim,
  corrections,
  onCorrections,
}: {
  claim: CalibrationClaimView;
  corrections: Gate;
  onCorrections: () => void;
}) {
  const rows = valueRows(claim);
  const warnings = [...(claim.certificate?.warnings ?? []), ...(claim.receipt?.warnings ?? [])];
  const nothingRead = !claim.certificate && !claim.receipt;

  return (
    <Card>
      <CardHeader
        padding="comfortable"
        action={
          <Button
            variant="secondary"
            size="sm"
            disabled={!corrections.ok}
            leftIcon={<PencilLine width={14} height={14} strokeWidth={1.75} />}
            onClick={onCorrections}
          >
            Corrections
          </Button>
        }
      >
        <div>
          <CardTitle>Values read</CardTitle>
          <CardSubtitle>
            Taken from the certificate and the receipt. Fix a wrong one with Corrections.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {nothingRead ? (
          <p className="text-sm text-text-muted">The papers have not been read yet.</p>
        ) : (
          <KeyValueList
            labelWidth="14rem"
            items={rows.map((r) => ({
              key: r.key,
              label: r.label,
              mono: r.mono,
              copyable: r.copyable,
              value: r.readAs ? (
                <>
                  {r.value}
                  <span className="block font-sans text-xs text-text-muted">
                    Corrected by hand. The paper says {r.readAs}.
                  </span>
                </>
              ) : (
                r.value
              ),
            }))}
          />
        )}
        {warnings.length > 0 ? (
          <Callout intent="warning">
            <span className="block font-semibold">The reader was not sure about these lines</span>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {warnings.map((w) => (
                <li key={w} className="break-words">
                  {w}
                </li>
              ))}
            </ul>
          </Callout>
        ) : null}
        {!corrections.ok && corrections.reason ? (
          <p className="text-xs text-text-subtle">{corrections.reason}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ClaimedBadge({ row }: { row: UnitRow }) {
  if (row.included === null) return <Badge intent="neutral">Not decided</Badge>;
  return row.included ? (
    <Badge intent="success">Claimed</Badge>
  ) : (
    <Badge intent="neutral">Left out</Badge>
  );
}

function VerifiedBadge({ row }: { row: UnitRow }) {
  if (row.verified === null) return <span className="text-text-muted">{NO_VALUE}</span>;
  return row.verified ? (
    <Badge intent="success">Verified</Badge>
  ) : (
    <Badge intent="danger">Not verified</Badge>
  );
}

const COLUMNS: DataColumn<UnitRow>[] = [
  {
    id: 'unit',
    header: 'Unit',
    mobile: 'primary',
    cell: (r) => (
      <>
        <span className="block font-medium text-text">
          {r.duNo ? `DU ${r.duNo}` : 'No DU number'}
        </span>
        <span className="block break-all font-mono text-xs text-text-muted">{r.serialNo}</span>
      </>
    ),
  },
  { id: 'make', header: 'Make and model', mobile: 'secondary', cell: (r) => r.makeModel },
  { id: 'nozzles', header: 'Nozzles', numeric: true, cell: (r) => r.nozzles ?? NO_VALUE },
  { id: 'verified', header: 'Verified', cell: (r) => <VerifiedBadge row={r} /> },
  {
    id: 'claimed',
    header: 'In the claim',
    mobile: 'primaryRight',
    cell: (r) => <ClaimedBadge row={r} />,
  },
  {
    id: 'why',
    header: 'Why',
    mobile: 'meta',
    cell: (r) => <span className="break-words text-text-muted">{r.reason}</span>,
  },
];

/** The dispensing units: serial, DU number, make and model, nozzles, verified, in the claim or not and why. */
export function ClaimUnits({ claim }: { claim: CalibrationClaimView }) {
  const rows = buildUnitRows(claim);
  return (
    <Card>
      <CardHeader padding="comfortable">
        <div>
          <CardTitle>Dispensing units</CardTitle>
          <CardSubtitle>
            A unit is claimed only when it is on the certificate and every nozzle on it was
            verified.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent padding="none" className="md:p-4">
        <DataList
          rows={rows}
          columns={COLUMNS}
          rowKey={(r) => r.key}
          cardVariant="rows"
          rowTone={(r) => (r.included === false ? 'muted' : 'default')}
          empty={
            <p className="px-3 py-4 text-sm text-text-muted md:px-0">
              No units have been read yet.
            </p>
          }
        />
      </CardContent>
    </Card>
  );
}
