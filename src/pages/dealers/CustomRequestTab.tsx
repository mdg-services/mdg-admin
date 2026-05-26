import type { Dealer } from '@dk/shared';
import { Send } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Card,
  CardContent,
  EmptyState,
  FieldError,
  Label,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  useDealerServicesQuery,
  useRunNow,
} from '@/hooks/api/useDealerServices';
import { ApiError } from '@/lib/api';

import { RunsListInline } from './RunsListInline';

const CUSTOM_REQUEST_PLUGIN = 'custom-request';

interface Props {
  dealer: Dealer;
}

export function CustomRequestTab({ dealer }: Props) {
  const toast = useToast();
  const { data: services } = useDealerServicesQuery(dealer.id);
  const runNow = useRunNow(dealer.id);

  const customRequest = (services ?? []).find(
    (s) => s.serviceId === CUSTOM_REQUEST_PLUGIN,
  );

  const [payload, setPayload] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

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
    <div className="grid gap-4">
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
            <Textarea
              id="customPayload"
              rows={8}
              placeholder='{"action":"refresh","notes":"manual"}'
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              invalid={!!error}
              className="font-mono"
            />
            <FieldError message={error ?? undefined} />
          </div>
          <div className="flex justify-end">
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
        <CardContent className="p-0">
          <div className="border-b border-border p-4">
            <p className="text-base font-semibold text-text">Recent runs</p>
            <p className="text-sm text-text-muted">
              Runs from the custom-request plugin for this dealer.
            </p>
          </div>
          <RunsListInline
            dealerId={dealer.id}
            serviceId={CUSTOM_REQUEST_PLUGIN}
          />
        </CardContent>
      </Card>
    </div>
  );
}
