import { funnelTiles } from '@/lib/onboarding';
import type { OnboardingBoard } from '@dk/shared';

/**
 * Registered, approved, signed in, paid, live: how many got how far over the
 * last 90 days, with each step's share of the one before it.
 *
 * Counts, not a chart: five numbers an admin reads across in a second, and the
 * share beside each is what shows where people drop away. Three to a row on a
 * phone and five from md, so no number is squeezed.
 */
export function OnboardingFunnel({ funnel }: { funnel: OnboardingBoard['funnel'] }) {
  const tiles = funnelTiles(funnel);
  return (
    <section aria-label="Funnel, last 90 days" className="mb-4">
      <ol className="grid grid-cols-3 gap-2 md:grid-cols-5">
        {tiles.map((t, i) => (
          <li
            key={t.key}
            className="min-w-0 rounded-md border border-border bg-surface p-2.5 md:p-3"
          >
            <p className="truncate text-xs text-text-muted">{t.label}</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-text">
              {t.count.toLocaleString('en-IN')}
            </p>
            <p className="mt-0.5 min-h-4 truncate text-[11px] text-text-subtle">
              {t.ofPrevious === null ? (
                i === 0 ? (
                  'last 90 days'
                ) : (
                  ''
                )
              ) : (
                <>
                  {/* "71% of registered" does not fit a third of a phone, so there it is the
                      figure alone, and a screen reader still hears what it is a share of. */}
                  <span className="md:hidden">
                    {t.ofPrevious}%
                    <span className="sr-only"> of {tiles[i - 1]!.label.toLowerCase()}</span>
                  </span>
                  <span className="hidden md:inline">
                    {t.ofPrevious}% of {tiles[i - 1]!.label.toLowerCase()}
                  </span>
                </>
              )}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
