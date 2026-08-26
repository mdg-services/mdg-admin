import { Droplet, Fuel } from 'lucide-react';
import * as React from 'react';

import { Badge, Card, CardContent, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { TtLatestDensity } from '@dk/shared';

import {
  densityFreshnessStyle,
  formatDensity,
  heroEyebrow,
  heroProvenance,
  heroSpokenLabel,
} from './format';

/**
 * The Density@15 figures, in the largest type on the screen.
 *
 * This IS the feature. Everything else in the pane — the invoice list, the PDF
 * drawer, the register calendar — exists to say where these numbers came from
 * and to let somebody check them. The owner's requirement was one sentence:
 * *"these extracted values are the important values … needs to be shown at the
 * top in big fonts"*, and a 40–48px figure is what that means in practice, next
 * to an operator holding the dealer's paper register.
 *
 * THREE THINGS HERE ARE NOT STYLE CHOICES.
 *
 * The tiles render in the order the API returned them and are NOT re-sorted.
 * `getLatestDensities` sorts diesel first, then petrol, then everything else,
 * and the dealer's own app renders the same array the same way — so the figure
 * that leads on a phone is the figure that leads here. Two screens each doing
 * their own sort is two screens that can disagree about which number is the
 * important one, on a number somebody is copying into a book by hand.
 *
 * The figure is `toFixed(3)`, never `toLocaleString`. The invoice prints
 * `727.300`; `toLocaleString` prints `727.3` and drops exactly the trailing
 * zeros the dealer is transcribing.
 *
 * A stale tile still shows its figure. It is the last true reading, it recedes
 * to muted, and it says how old it is in words — a blanked tile would be a worse
 * lie than an old number that admits its age.
 *
 * There is deliberately no "no invoice yet" tile. This service knows which
 * grades have ARRIVED; it has no idea which grades an outlet STOCKS, so a tile
 * for an absent product would be a dash on screen for a grade the pump may not
 * even sell.
 */

export interface DensityHeroProps {
  /** Already sorted by the API — render in the order given. */
  products: TtLatestDensity[];
  loading?: boolean;
}

export function DensityHero({ products, loading = false }: DensityHeroProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 md:p-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-10 w-40" />
              <Skeleton className="mt-3 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (products.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {products.map((product) => (
        <DensityTile key={`${product.productKey}-${product.invoiceId}`} product={product} />
      ))}
    </div>
  );
}

/** One product's latest reading. */
function DensityTile({ product }: { product: TtLatestDensity }) {
  const labelId = React.useId();
  const style = densityFreshnessStyle(product.ageDays);
  const Glyph = product.family === 'DIESEL' ? Droplet : Fuel;

  return (
    <Card className={style.borderClass} role="group" aria-labelledby={labelId}>
      {/* One sentence carries the whole tile for a screen reader; the visual
          parts below are hidden from it, because read as laid out the figure
          comes out as "eight two zero point five zero zero". */}
      <span id={labelId} className="sr-only">
        {heroSpokenLabel(product)}
      </span>
      <CardContent className="p-4 md:p-5" aria-hidden>
        <div className="flex items-start justify-between gap-2">
          {/* `min-w-0` + a two-line clamp: for a provisional product the eyebrow
              is `materialCode · description`, and SAP descriptions are long, so
              with the badge group beside it holding its width the eyebrow got
              ~138px of a 264px card and stacked to four lines of uppercase —
              pushing the figure this tile exists to show off the fold. The full
              text is still spoken: `heroSpokenLabel` above carries it. */}
          <span className="line-clamp-2 min-w-0 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {heroEyebrow(product)}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {product.provisional ? <Badge intent="neutral">New product</Badge> : null}
            {style.badgeLabel ? (
              <Badge intent={style.badgeIntent ?? 'neutral'}>{style.badgeLabel}</Badge>
            ) : null}
            <Glyph
              width={18}
              height={18}
              strokeWidth={1.75}
              className="text-text-subtle"
            />
          </span>
        </div>

        <p
          className={cn(
            'mt-3 text-[40px] font-semibold leading-none tracking-tight tabular-nums md:text-5xl',
            style.numberClass,
          )}
        >
          {formatDensity(product.density15, product.density15Raw)}
        </p>
        <p className="mt-1 text-xs text-text-subtle">kg/m³ at 15 °C</p>
        <p className="mt-3 text-xs text-text-subtle">{heroProvenance(product)}</p>
      </CardContent>
    </Card>
  );
}
