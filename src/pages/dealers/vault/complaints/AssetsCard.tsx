import { Card, CardContent, CardHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { ComplaintsDealerAdminView } from '@dk/shared';

/**
 * The outlet's own lists as the robot read them from the portals: card-machine IDs,
 * dispensers and tanks. MDG fills the complaint form from these and never asks the
 * dealer for them, so a wrong or empty list here is why a question gets asked.
 */
export function AssetsCard({ assets }: { assets: ComplaintsDealerAdminView['assets'] }) {
  return (
    <Card>
      <CardContent>
        <CardHeader align="center">
          <p className="text-base font-semibold text-text">The outlet as the portals list it</p>
          <p className="text-sm text-text-muted">
            {assets ? `Read ${formatDateTime(assets.readAt)}` : 'Not read yet. The first check reads them.'}
          </p>
        </CardHeader>
        {assets ? (
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <List title="Card machines (TID)" empty="None listed">
              {assets.tids.map((t) => (
                <li key={t} className="tabular-nums">
                  {t}
                </li>
              ))}
            </List>
            <List title="Dispensers" empty="None listed">
              {assets.dus.map((d) => (
                <li key={`${d.label}:${d.serial ?? ''}`} className="[overflow-wrap:anywhere]">
                  {d.label}
                  <span className="block text-xs text-text-subtle">
                    {[d.make, d.model, d.serial ? `serial ${d.serial}` : null].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </List>
            <List title="Tanks" empty="None listed">
              {assets.tanks.map((t) => (
                <li key={t.tankNo}>
                  Tank {t.tankNo}
                  {t.product ? <span className="text-text-muted"> · {t.product}</span> : null}
                </li>
              ))}
            </List>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function List({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="grid content-start gap-1">
      <p className="font-medium text-text">{title}</p>
      {children.length === 0 ? (
        <p className="text-text-muted">{empty}</p>
      ) : (
        <ul className="grid gap-1 text-text">{children}</ul>
      )}
    </div>
  );
}
