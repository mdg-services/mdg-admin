import { Send } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  EmptyState,
  FieldError,
  Label,
  StickyActionBar,
  Textarea,
  useToast,
} from '@/components/ui';
import { useMeQuery } from '@/hooks/api/useAuth';
import {
  useDealerServicesQuery,
  useRunNow,
} from '@/hooks/api/useDealerServices';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { ApiError } from '@/lib/api';
import type { Dealer } from '@dk/shared';

import { RunsListInline } from './RunsListInline';

const CUSTOM_REQUEST_PLUGIN = 'custom-request';

interface Props {
  dealer: Dealer;
}

/**
 * Hand-written JSON dispatched straight at a plugin — an engineer surface, not
 * an outcome. Super-admins only; the tab is also hidden from the strip in
 * `DealerDetailPage`, this guard covers a direct `?tab=custom` deep link.
 */
export function CustomRequestTab({ dealer }: Props) {
  const toast = useToast();
  const meQ = useMeQuery();
  const isSuperAdmin = useIsSuperAdmin();
  const { data: services } = useDealerServicesQuery(dealer.id);
  const runNow = useRunNow(dealer.id);

  const customRequest = (services ?? []).find(
    (s) => s.serviceId === CUSTOM_REQUEST_PLUGIN,
  );

  const [payload, setPayload] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  if (!isSuperAdmin) {
    // Hold while /auth/me is still deciding, so a super-admin never sees a flash
    // of the "not available" copy.
    if (meQ.isLoading) return null;
    return (
      <Card>
        <CardContent>
          <EmptyState
            title="Not available"
            description="Ad-hoc requests are raised with the MDG team, who run them for you."
          />
        </CardContent>
      </Card>
    );
  }

  if (!customRequest) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title="Custom request not attached"
            description={`Attach the "${CUSTOM_REQUEST_PLUGIN}" plugin from the Services tab to submit ad-hoc requests.`}
          />
        </CardContent>
      </Card>
    );
  }

  async function submit() {
    setError(null);
    let body: Record<string, unknown> = {};
    const trimmed = payload.trim();
    if (trimmed.length > 0) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          setError('Payload must be a JSON object.');
          return;
        }
        body = parsed as Record<string, unknown>;
      } catch {
        setError('Payload is not valid JSON.');
        return;
      }
    }

    try {
      if (!customRequest) return;
      await runNow.mutateAsync({
        dsId: customRequest.id,
        body: { configOverride: body },
      });
      toast.success('Custom request enqueued');
      setPayload('');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Submission failed';
      toast.error(msg);
    }
  }

  return (
    // `flex flex-col`, not `grid`: a grid item's sticky positioning is confined
    // to its own grid area, which auto-sizes to the item — so the bar at the
    // foot of this tab would never actually stick. A flex item is offset within
    // the flex container's content box, which is the whole tab. The stacking
    // and the 1rem gap are identical either way.
    <div className="flex flex-col gap-3 md:gap-4">
      <Card>
        <CardContent className="grid gap-3">
          <div>
            <h3 className="text-base font-semibold text-text">Submit a custom request</h3>
            <p className="text-sm text-text-muted">
              The payload is merged on top of the stored config and dispatched
              to the {CUSTOM_REQUEST_PLUGIN} plugin.
            </p>
          </div>
          <div>
            <Label htmlFor="customPayload" hint="JSON object">
              Payload
            </Label>
            {/* Eight rows is ~190px. With the soft keyboard open the layout
                viewport shrinks to roughly 340px on a 640px device, so the
                field alone filled the screen. `h-40` caps it at 160px below md
                and `md:h-auto` hands the height back to `rows` at md, so the
                desktop field is exactly the eight rows it has always been. */}
            <Textarea
              id="customPayload"
              rows={8}
              placeholder='{"action":"refresh","notes":"manual"}'
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              invalid={!!error}
              className="h-40 font-mono md:h-auto"
            />
            <FieldError message={error ?? undefined} />
          </div>
          {/* Desktop keeps Submit where it has always been. Below md it moves
              to the sticky bar at the foot of the tab; `hidden` beats the row's
              own `flex` (Tailwind emits `.hidden` last) and `md:flex` puts it
              back. */}
          <div className="hidden justify-end md:flex">
            <Button
              leftIcon={<Send width={16} height={16} strokeWidth={1.75} />}
              loading={runNow.isPending}
              onClick={submit}
            >
              Submit request
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader padding="comfortable">
          <CardTitle>Recent runs</CardTitle>
          <CardSubtitle>
            Runs from the custom-request plugin for this dealer.
          </CardSubtitle>
        </CardHeader>
        {/* The run list brings its own padding, so the card body runs to the
            card's edges. `padding="none"`, never `className="p-0"` — `cn` is
            clsx and the class would simply lose to the default. */}
        <CardContent padding="none" className="md:p-4">
          <RunsListInline
            dealerId={dealer.id}
            serviceId={CUSTOM_REQUEST_PLUGIN}
          />
        </CardContent>
      </Card>

      {/* Submit used to sit in normal flow directly under the payload field.
          Once the keyboard opened it was below the fold, so committing meant
          dismissing the keyboard and scrolling. `StickyActionBar` pins it to
          the page scroller instead — and carries its own bottom inset, which
          matters here because this tab only renders inside `/dealers/:id`,
          where the tab bar is hidden and nothing else is holding the safe
          area off the gesture strip. */}
      <StickyActionBar
        className="md:hidden"
        summary="The payload is merged on top of the stored config."
        summaryOnMobile
      >
        <Button
          leftIcon={<Send width={16} height={16} strokeWidth={1.75} />}
          loading={runNow.isPending}
          onClick={submit}
        >
          Submit request
        </Button>
      </StickyActionBar>
    </div>
  );
}
