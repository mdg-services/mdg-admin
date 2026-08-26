import { PartyPopper } from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Checkbox,
  Input,
  Label,
  Select,
  Skeleton,
  StickyActionBar,
  useToast,
} from '@/components/ui';
import { useFestivalQuery, useUpdateFestival } from '@/hooks/api/useFestival';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import {
  FESTIVAL_CATALOG,
  addDays,
  festivalWindow,
  findFestival,
  type FestivalDefinition,
  type FestivalKey,
} from '@dk/shared';

/** The smallest scale at which the band's 20px English greeting is still
 *  readable (~11px). Below md the preview is floored here and pans instead. */
const MIN_READABLE_SCALE = 0.55;

/** "Sat, 15 Aug 2026" from a YYYY-MM-DD calendar date. */
function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The next time a fixed-date festival comes round, as YYYY-MM-DD — this year's
 * date if it hasn't passed, otherwise next year's. Used only to pre-fill the
 * form when the admin picks a festival; they can always type over it.
 */
function nextOccurrence(observedOn: string, today: string): string {
  const year = Number(today.slice(0, 4));
  const thisYear = `${year}-${observedOn}`;
  return thisYear >= today ? thisYear : `${year + 1}-${observedOn}`;
}

/**
 * What the dealer will actually see, drawn from the same catalog entry the
 * server renders from — the greeting, the colours, the emblem, the proportions.
 *
 * Scaled to fit rather than reflowed: the band is 78px tall on a 1000px card,
 * and a preview that let the text wrap or the pill breathe differently would be
 * reassuring about a layout that isn't the one being shipped. The maroon strip
 * underneath is the top of the real card, so the band is judged in its place
 * instead of floating on the page.
 */
function BandPreview({ festival }: { festival: FestivalDefinition }) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = React.useState(1);
  const isMd = useMediaQuery('(min-width: 768px)');

  React.useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => setFitScale(Math.min(1, el.clientWidth / 1000));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Fit-to-width is honest at desktop widths and useless at 360: the card has
     ~294px inside it, so scale = 0.294 and the 27px Hindi greeting renders at
     8px. This page exists so an admin can APPROVE what dealers will see, and
     with `maximum-scale=1.0` there is no pinch to read it. Below md the scale
     is floored at a legible 0.55 and the 1000px stage pans sideways in its own
     scroller instead. At md the behaviour is exactly what it was. */
  const scale = isMd ? fitScale : Math.max(fitScale, MIN_READABLE_SCALE);
  const pannable = scale > fitScale;

  const [a, b, c] = festival.colors;
  // Kept in step with `festivalBand.ts` — same heights, same stops, same pill
  // rule. A preview that flatters the real band is worse than no preview.
  const isFlag = festival.bandStyle === 'stripes';
  const background = isFlag
    ? `linear-gradient(180deg, ${a} 0 26%, ${b} 26% 74%, ${c} 74% 100%)`
    : `linear-gradient(90deg, ${a}, ${b} 50%, ${c})`;
  const pill = isFlag
    ? {}
    : {
        padding: '9px 26px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.94)',
        boxShadow: '0 2px 10px rgba(24,24,27,0.16)',
      };

  return (
    <>
      {/* `overflow-hidden` first and `overflow-x-auto` after it: Tailwind emits
          the axis utilities later, so this resolves to `overflow-x: auto` with
          `overflow-y: hidden`, and `md:overflow-x-hidden` puts the desktop box
          back to plain `overflow: hidden`. */}
      <div
        ref={wrapRef}
        className="overflow-hidden overflow-x-auto overscroll-x-contain rounded-md border border-border md:overflow-x-hidden"
        // 86px band + 124px card header, both scaled — keeps the box exactly as
        // tall as its contents at any width.
        style={{ height: (86 + 124) * scale }}
      >
        <div
          style={{
            width: 1000,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <div
            style={{
              height: 86,
              background,
              borderBottom: '2px solid #7f1d1d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                whiteSpace: 'nowrap',
                color: festival.ink,
                ...pill,
              }}
            >
              {festival.emblemSvg ? (
                <span
                  style={{ display: 'flex', alignItems: 'center' }}
                  // Static markup from our own catalog — never admin input.
                  dangerouslySetInnerHTML={{ __html: festival.emblemSvg }}
                />
              ) : null}
              <span style={{ fontSize: 27, fontWeight: 800 }}>{festival.greetingHi}</span>
              <span style={{ fontSize: 22, fontWeight: 700, opacity: 0.45 }}>·</span>
              <span style={{ fontSize: 20, fontWeight: 700, opacity: 0.82 }}>
                {festival.greetingEn}
              </span>
              {festival.emblemSvg ? (
                <span
                  style={{ display: 'flex', alignItems: 'center' }}
                  dangerouslySetInnerHTML={{ __html: festival.emblemSvg }}
                />
              ) : null}
            </div>
          </div>
          {/* The real card's header, so the band is seen in context. */}
          <div
            style={{
              height: 124,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '0 22px',
              background: 'linear-gradient(180deg, #7f1d1d, #5c1010)',
            }}
          >
            <div
              style={{
                width: 70,
                height: 70,
                borderRadius: 16,
                background: '#fff',
                color: '#7f1d1d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 21,
                fontWeight: 800,
              }}
            >
              MDG
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 38, fontWeight: 800, color: '#fff', lineHeight: 1.05 }}>
                CREDIT &amp; DOD MONITORING
              </div>
              <div style={{ fontSize: 21, fontWeight: 600, color: '#f59e0b', marginTop: 4 }}>
                रोज़ का उधार-हिसाब
              </div>
            </div>
            <div
              style={{
                background: '#f59e0b',
                color: '#7f1d1d',
                borderRadius: 10,
                padding: '8px 16px',
                fontSize: 25,
                fontWeight: 800,
              }}
            >
              RO CODE
            </div>
          </div>
        </div>
      </div>
      {pannable ? (
        <p className="mt-1 text-xs text-text-subtle md:hidden">
          Drag sideways to see the whole band.
        </p>
      ) : null}
    </>
  );
}

export function FestivalPage() {
  const toast = useToast();
  const festivalQ = useFestivalQuery();
  const save = useUpdateFestival();

  const today = festivalQ.data?.today ?? '';

  const [key, setKey] = React.useState<FestivalKey>('independence-day');
  const [startDate, setStartDate] = React.useState('');
  const [days, setDays] = React.useState(3);
  const [enabled, setEnabled] = React.useState(false);

  /**
   * Seed the form from the server, exactly once per distinct saved version.
   *
   * Tracked by `updatedAt` in a ref rather than by effect dependencies: the
   * query is deliberately `staleTime: 0`, so react-query refetches on window
   * focus and hands back a NEW object with identical contents. Depending on
   * that object would reset the form under the admin's hands every time they
   * tabbed away and back. A save produces a genuinely new `updatedAt`, which is
   * the one case that SHOULD re-sync the form to what the server stored.
   */
  const seeded = React.useRef<string | null>(null);
  React.useEffect(() => {
    const data = festivalQ.data;
    if (!data) return;
    const s = data.setting;
    if (s) {
      const stamp = s.updatedAt ?? '';
      if (seeded.current === stamp) return;
      seeded.current = stamp;
      setKey(s.festivalKey);
      setStartDate(s.startDate);
      setDays(s.days);
      setEnabled(s.enabled);
      return;
    }
    // Never configured: pre-fill from the catalog once, so the form opens
    // usable rather than with an empty date the admin has to guess at.
    if (seeded.current !== null) return;
    seeded.current = '';
    const def = findFestival(key);
    setStartDate(
      def?.observedOn ? nextOccurrence(def.observedOn, data.today) : data.today,
    );
    setDays(def?.defaultDays ?? 3);
  }, [festivalQ.data, key]);

  function onPickFestival(next: FestivalKey) {
    setKey(next);
    const def = findFestival(next);
    if (!def) return;
    setDays(def.defaultDays);
    // A fixed-date festival knows when it falls; a lunar one has to be typed.
    if (def.observedOn && today) setStartDate(nextOccurrence(def.observedOn, today));
  }

  const selected = findFestival(key);
  // The window the CURRENT form describes, judged against the server's today —
  // so the admin sees the consequence of an edit before saving it.
  const draftWindow =
    startDate && today ? festivalWindow({ enabled, startDate, days }, today) : null;
  const savedWindow = festivalQ.data?.window ?? null;

  const dirty =
    festivalQ.data?.setting == null ||
    festivalQ.data.setting.festivalKey !== key ||
    festivalQ.data.setting.startDate !== startDate ||
    festivalQ.data.setting.days !== days ||
    festivalQ.data.setting.enabled !== enabled;

  async function onSave() {
    try {
      await save.mutateAsync({ festivalKey: key, enabled, startDate, days });
      toast.success('Festival greeting saved');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not save the festival greeting',
      );
    }
  }

  const savedDef = findFestival(festivalQ.data?.setting?.festivalKey);

  // What the sticky bar says, including WHY Save is dead when it is.
  const saveSummary = !startDate
    ? 'Pick a start date to save.'
    : days < 1
      ? 'Show for must be at least 1 day.'
      : dirty
        ? 'Unsaved changes.'
        : 'No unsaved changes.';

  return (
    <div>
      <PageHeader
        title="Festival greeting"
        subtitle="A seasonal greeting band on the report images shared with dealers."
      />

      {festivalQ.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        // `[&>*]:min-w-0` is load-bearing, not tidiness. A grid item's automatic
        // minimum size is its min-content width, and the Preview card holds a
        // 1000px stage — so without this the single mobile column sizes itself
        // to 1000px, every card in it inherits that width, and `main`'s
        // `overflow-x-hidden` then clips two thirds of the page away with no
        // gesture that reaches it. The stage has its own `overflow-x-auto`; this
        // is what stops it recruiting its ancestors into the scroll.
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          {/* Below md the Status card is ~250px of prose sitting between the
              Preview and the festival picker that drives it, so the admin chose
              a festival with the preview off the top of the screen. `order-last`
              moves it under both; `md:order-none` leaves every width from 768px
              up in DOM order, exactly as today. */}
          <Card className="order-last md:order-none">
            <CardHeader>
              <div>
                <CardTitle>Status</CardTitle>
                <CardSubtitle>
                  What dealers are receiving right now
                  {today ? ` (${formatDay(today)}, IST)` : ''}
                </CardSubtitle>
              </div>
              {savedWindow?.active ? (
                <Badge intent="success">Live</Badge>
              ) : (
                <Badge intent="neutral">Off</Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {savedWindow?.active && savedDef ? (
                <p className="text-sm text-text">
                  <strong>{savedDef.label}</strong> is on every card generated from now
                  until the end of <strong>{formatDay(savedWindow.endDate)}</strong> —{' '}
                  {savedWindow.daysLeft === 1
                    ? 'today is the last day'
                    : `${savedWindow.daysLeft} days including today`}
                  . It then switches off on its own; nothing to remember.
                </p>
              ) : festivalQ.data?.setting && savedWindow ? (
                <p className="text-sm text-text-muted">
                  {!festivalQ.data.setting.enabled
                    ? `${savedDef?.label ?? 'A festival'} is configured but switched off.`
                    : savedWindow.startDate > today
                      ? `${savedDef?.label ?? 'A festival'} is scheduled to start on ${formatDay(savedWindow.startDate)}.`
                      : `${savedDef?.label ?? 'The last festival'} finished on ${formatDay(savedWindow.endDate)}.`}{' '}
                  Cards are going out with the usual MDG brand band.
                </p>
              ) : (
                <p className="text-sm text-text-muted">
                  No festival configured. Cards are going out with the usual MDG brand
                  band.
                </p>
              )}
              <Callout intent="info">
                The band is applied when a report is <strong>generated</strong>, not when
                it is shared. A card generated today keeps its greeting even if you share
                it next week, and one generated before you switch this on will not gain
                it.
              </Callout>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Preview</CardTitle>
                <CardSubtitle>
                  Replaces the MDG brand strip at the top of the card; nothing below it
                  moves
                </CardSubtitle>
              </div>
            </CardHeader>
            <CardContent>
              {selected ? <BandPreview festival={selected} /> : null}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Settings</CardTitle>
                <CardSubtitle>
                  Pick a festival, when it starts, and how long it runs
                </CardSubtitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="festival">Festival</Label>
                  <Select
                    id="festival"
                    value={key}
                    onChange={(e) => onPickFestival(e.target.value as FestivalKey)}
                  >
                    {FESTIVAL_CATALOG.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label} — {f.labelHi}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="startDate">Starts on</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="days">Show for (days)</Label>
                  <Input
                    id="days"
                    type="number"
                    min={1}
                    max={30}
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* `align="start"` so the box lines up with the first line of a
                  two-line label. This was a raw input because the primitive's
                  base `items-center` could not be overridden from a call site
                  (`cn` is clsx); it takes the alignment as a prop now. */}
              <Checkbox
                align="start"
                labelClassName="gap-2.5 rounded-md border border-border p-3"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                label={
                  <>
                    <span className="font-medium text-text">
                      Show this greeting to dealers
                    </span>
                    <span className="block text-text-muted">
                      Turning this off removes the band immediately, whatever the dates say.
                    </span>
                  </>
                }
              />

              {draftWindow && startDate ? (
                <p className="text-sm text-text-muted">
                  {enabled ? (
                    <>
                      {formatDay(draftWindow.startDate)} →{' '}
                      {formatDay(draftWindow.endDate)} (last day). Off from{' '}
                      {formatDay(addDays(draftWindow.endDate, 1))}.{' '}
                      {draftWindow.active ? (
                        <span className="font-medium text-text">Live today.</span>
                      ) : draftWindow.startDate > today ? (
                        'Not live yet.'
                      ) : (
                        'This window has already passed — nothing will show.'
                      )}
                    </>
                  ) : (
                    'Switched off — nothing will show.'
                  )}
                </p>
              ) : null}

              <div className="hidden items-center gap-3 md:flex">
                <Button
                  onClick={() => void onSave()}
                  loading={save.isPending}
                  disabled={!dirty || !startDate || days < 1}
                  leftIcon={<PartyPopper width={16} height={16} strokeWidth={1.75} />}
                >
                  Save
                </Button>
                {!dirty ? (
                  <span className="text-sm text-text-muted">No unsaved changes.</span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Save sat at the natural end of a ~1200px single-column page, and the
          only unsaved-state cue sat next to it — off screen while editing. The
          bar carries both, and states the reason the button is dead rather than
          leaving it to a `title` no phone renders. */}
      {festivalQ.isLoading ? null : (
        <StickyActionBar
          visibility="below-md"
          summary={saveSummary}
          summaryOnMobile
        >
          <Button
            onClick={() => void onSave()}
            loading={save.isPending}
            disabled={!dirty || !startDate || days < 1}
            leftIcon={<PartyPopper width={16} height={16} strokeWidth={1.75} />}
          >
            Save
          </Button>
        </StickyActionBar>
      )}
    </div>
  );
}
