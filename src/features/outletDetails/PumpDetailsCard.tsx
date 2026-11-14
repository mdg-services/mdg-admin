import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  KeyValueList,
  Skeleton,
} from '@/components/ui';
import { useOutletDetails } from '@/hooks/api/useOutletDetails';
import {
  answerWords,
  completionWords,
  englishWords,
  hindiUnder,
  savedByLine,
  suggestedLine,
  completionIntent,
} from '@/lib/outletDetails';
import type { OutletDetailsQuestionView } from '@dk/shared';

import { FillPumpDetailsDialog } from './FillPumpDetailsDialog';

/**
 * The outlet's "Pump details" card on its Info tab: every question the dealer's form
 * asks, with the answer, who filled it and when, and a button to fill it for the dealer.
 *
 * Drawn entirely from what the server sends (`useOutletDetails`), so a question added
 * there appears here with no release, and nothing here counts or names one.
 *
 * It sits on the Identity row, not inside the Setup card, because it is the one place
 * that shows for every outlet: a live one, an old one with no setup, and (read-only) an
 * archived one. Two cards for one subject is the fault this tab has been audited for.
 *
 * A server that has not got the form yet answers 404 and the card is simply not there.
 */
export function PumpDetailsCard({
  dealerId,
  code,
  archived = false,
  className,
}: {
  dealerId: string;
  code: string | null | undefined;
  /** An archived outlet is read, not edited: every write is refused for one. */
  archived?: boolean;
  className?: string;
}) {
  const q = useOutletDetails(dealerId);
  const [filling, setFilling] = React.useState(false);
  // One clock for the whole card, so every "Filled by…" line reads the same year.
  const now = React.useMemo(() => new Date(), []);

  if (q.isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Pump details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
        </CardContent>
      </Card>
    );
  }
  // An older server: no card, no noise.
  if (!q.isError && q.data === null) return null;

  const view = q.data;
  const canFill = !!view && view.canEdit && !archived;

  return (
    <Card className={className}>
      <CardHeader
        action={
          canFill ? (
            <Button size="sm" variant="secondary" onClick={() => setFilling(true)}>
              Fill for the dealer…
            </Button>
          ) : undefined
        }
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Pump details</CardTitle>
            {view ? (
              <Badge intent={completionIntent(view)}>{completionWords(view)}</Badge>
            ) : null}
          </div>
          <CardSubtitle>What the dealer tells us about the pump, from the form in their chat.</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent>
        {!view ? (
          <Callout intent="warning" onRetry={() => void q.refetch()}>
            The pump details could not be read.
          </Callout>
        ) : view.questions.length === 0 ? (
          <p className="text-sm text-text-muted">Nothing is asked yet.</p>
        ) : (
          <KeyValueList
            className="select-text"
            layout="stacked"
            items={view.questions.map((question) => ({
              key: question.id,
              label: <QuestionLabel q={question} />,
              value: <AnswerCell q={question} now={now} />,
            }))}
          />
        )}
      </CardContent>
      {canFill ? (
        <FillPumpDetailsDialog
          dealerId={dealerId}
          code={code}
          view={filling ? (view ?? null) : null}
          onClose={() => setFilling(false)}
        />
      ) : null}
    </Card>
  );
}

function QuestionLabel({ q }: { q: OutletDetailsQuestionView }) {
  const hindi = hindiUnder(q.label);
  return (
    <>
      {englishWords(q.label)}
      {hindi ? (
        <span lang="hi" className="block text-xs text-text-subtle">
          {hindi}
        </span>
      ) : null}
    </>
  );
}

function AnswerCell({ q, now }: { q: OutletDetailsQuestionView; now: Date }) {
  const words = answerWords(q);
  if (words === null) {
    const suggestion = suggestedLine(q);
    return (
      <div>
        <p className="text-text-muted">Not answered yet</p>
        {suggestion ? <p className="text-xs text-text-muted">{suggestion}</p> : null}
      </div>
    );
  }
  const by = savedByLine(q.answer, now);
  return (
    <div>
      <p className="font-medium">{words}</p>
      {by ? <p className="text-xs text-text-muted">{by}</p> : null}
    </div>
  );
}
