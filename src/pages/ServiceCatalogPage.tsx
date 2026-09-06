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
  HowThisWorks,
  Skeleton,
} from '@/components/ui';
import { useServicesQuery } from '@/hooks/api/useServices';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { statusIntent } from '@/lib/statusIntent';
import type { ServicePluginCatalogEntry } from '@dk/shared';

export function ServiceCatalogPage() {
  const isSuperAdmin = useIsSuperAdmin();
  const { data, isLoading, isError, error } = useServicesQuery();
  const [selected, setSelected] = React.useState<ServicePluginCatalogEntry | null>(
    null,
  );

  return (
    <div>
      <PageHeader
        title="Service catalog"
        subtitle="Plugins available to attach to dealers."
        actions={<HowThisWorks surface="admin-service-catalog" label="Service catalog" />}
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
                    {/* `min-w-0` so a long service name shrinks instead of
                        pushing the cadence Badge — a hard 22px box — until its
                        own label wraps inside it and clips. */}
                    <div className="min-w-0">
                      <p className="break-words text-base font-semibold text-text">
                        {s.name}
                      </p>
                      <p className="break-all text-xs text-text-subtle">
                        {s.id}
                      </p>
                    </div>
                    <Badge intent={statusIntent('cadence', s.cadence)}>
                      {s.cadence}
                    </Badge>
                  </div>
                  {/* Clamped below md: the longest plugin description is 545
                      characters, which is thirteen lines in a 294px card — one
                      screen would show two services. The Drawer this card opens
                      carries the whole text. */}
                  <p className="mt-2 line-clamp-3 text-sm text-text-muted md:line-clamp-none">
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
            {/* The Drawer prints its own `description` clamped to two lines
                below md, and two lines is ~90 of the 545 characters the longest
                plugin has to say — so on a phone the full text lands here
                instead. `md:hidden` because at md the header already shows it
                whole and this would be a second copy of it. */}
            <p className="text-sm text-text-muted md:hidden">
              {selected.description}
            </p>
            {/* One column below md: each of the two 150px columns is narrower
                than a plugin slug, and a slug without hyphens has no break
                opportunity at all. */}
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 md:gap-2">
              <Field label="ID" value={selected.id} identifier />
              <Field
                label="Default cadence"
                value={
                  <Badge intent={statusIntent('cadence', selected.cadence)}>
                    {selected.cadence}
                  </Badge>
                }
              />
            </div>
            {/* The raw plugin config schema is engineer-grade; the page itself
                is super-admin only, and this is gated again so the drawer can
                be reused elsewhere without leaking it. */}
            {isSuperAdmin ? (
              <section>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Config schema
                </p>
                {/* `.scroll-pane` — this 384px dual-axis scroller sits inside
                    the Drawer's own body, and without `overscroll-contain`
                    reaching its bottom starts dragging the sheet closed. */}
                <pre className="scroll-pane max-h-96 overflow-auto rounded-md bg-surface-2 p-3 text-xs">
                  {JSON.stringify(selected.defaultConfigSchema, null, 2)}
                </pre>
              </section>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

/** `identifier` is `break-all`: a plugin slug is one unbreakable token unless it
 *  happens to carry hyphens, and this Drawer is 360px wide on a phone. */
function Field({
  label,
  value,
  identifier = false,
}: {
  label: string;
  value: React.ReactNode;
  identifier?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-text-subtle">
        {label}
      </p>
      <p
        className={
          identifier
            ? 'min-w-0 break-all font-mono text-text'
            : 'min-w-0 break-words text-text'
        }
      >
        {value}
      </p>
    </div>
  );
}
