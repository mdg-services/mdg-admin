import type { ServicePluginCatalogEntry } from '@dk/shared';
import { AlertCircle, Plug } from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Drawer,
  EmptyState,
  Skeleton,
} from '@/components/ui';
import { useServicesQuery } from '@/hooks/api/useServices';
import { statusIntent } from '@/lib/statusIntent';

export function ServiceCatalogPage() {
  const { data, isLoading, isError, error } = useServicesQuery();
  const [selected, setSelected] = React.useState<ServicePluginCatalogEntry | null>(
    null,
  );

  return (
    <div>
      <PageHeader
        title="Service catalog"
        subtitle="Plugins available to attach to dealers."
      />

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-1 h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
          title="Could not load services"
          description={(error as Error).message}
        />
      ) : data && data.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelected(s)}
              className="text-left"
            >
              <Card className="h-full transition-colors hover:bg-surface-2">
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-text">
                        {s.name}
                      </p>
                      <p className="text-xs text-text-subtle">{s.id}</p>
                    </div>
                    <Badge intent={statusIntent('cadence', s.cadence)}>
                      {s.cadence}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-text-muted">
                    {s.description}
                  </p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Plug width={28} height={28} strokeWidth={1.75} />}
          title="No plugins installed"
          description="Drop a plugin folder under backend/src/services to make it available here."
        />
      )}

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? 'Service'}
        description={selected?.description}
        width="lg"
        footer={
          <Button variant="secondary" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected ? (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Field label="ID" value={selected.id} />
              <Field
                label="Default cadence"
                value={
                  <Badge intent={statusIntent('cadence', selected.cadence)}>
                    {selected.cadence}
                  </Badge>
                }
              />
            </div>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Config schema
              </p>
              <pre className="max-h-96 overflow-auto rounded-md bg-surface-2 p-3 text-xs">
                {JSON.stringify(selected.defaultConfigSchema, null, 2)}
              </pre>
            </section>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-text-subtle">
        {label}
      </p>
      <p className="text-text">{value}</p>
    </div>
  );
}
