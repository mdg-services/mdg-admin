import {
  AlertTriangle,
  CheckCheck,
  DownloadCloud,
  FlaskConical,
  Send,
  ThumbsDown,
  ThumbsUp,
  Undo2,
} from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  KeyValueList,
  type KeyValueItem,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import type { DeclarationStatusView, DeclarationsAdminView } from '@dk/shared';

import {
  actionKey,
  brandedButtons,
  brandedTaskLines,
  dueLine,
  fileAction,
  fileGate,
  filedKindOf,
  kindBadge,
  kindTitle,
  lastFiledLine,
  lastTryLine,
  portalStateView,
  readFailureLine,
  ruleWords,
  settleAction,
  showSettle,
  type Gate,
  type PaneControls,
} from './format';

/**
 * One line per button that cannot be pressed, saying why. A tooltip would not
 * do: there is no hover on a phone. Reasons the top of the pane already gives
 * (the service is off) stay quiet here.
 */
export function GateNotes({ notes }: { notes: readonly { label: string; gate: Gate }[] }) {
  const shown = notes.filter((n) => !n.gate.ok && n.gate.reason && !n.gate.quiet);
  if (shown.length === 0) return null;
  return (
    <ul className="grid gap-0.5 text-xs text-text-subtle">
      {shown.map((n) => (
        <li key={n.label} className="break-words">
          <span className="font-medium text-text-muted">{n.label}:</span> {n.gate.reason}
        </li>
      ))}
    </ul>
  );
}

/**
 * One declaration: the rule in words, what IndianOil's page says, when it was
 * last filed and the portal's reply, what is due, and what a person has to do.
 *
 * Branded Fuels with a task is drawn in the alert colour and has no filing
 * button of any kind: MDG never fills that page. Its buttons only say whether an
 * admin has filled it (or ask for the page to be read again).
 */
export function KindCard({
  status,
  view,
  controls,
  children,
}: {
  status: DeclarationStatusView;
  view: DeclarationsAdminView;
  controls: PaneControls;
  /** Washroom: the photos and the cycle, drawn between the facts and the buttons. */
  children?: React.ReactNode;
}) {
  const { runBusy, requestBusy, pendingKey, checking, today, onAct } = controls;
  const branded = status.kind === 'branded';
  const badge = kindBadge(status);
  const portal = portalStateView(status.portalState);
  const due = dueLine(status);
  const tried = lastTryLine(status);
  const readFailed = readFailureLine(status);
  const fileKind = filedKindOf(status.kind);
  // What the card's task box says: Branded Fuels' own words, then its fixed instruction
  // only if those words do not carry it; every other card prints the server's line as it is.
  const taskLines = branded ? brandedTaskLines(status) : status.todo ? [status.todo] : [];
  const realAction = fileAction(status.kind, false);
  const testAction = fileAction(status.kind, true);
  const settleYes = showSettle(status) ? settleAction(status.kind, true) : null;
  const settleNo = showSettle(status) ? settleAction(status.kind, false) : null;

  const items: KeyValueItem[] = [
    {
      key: 'portal',
      label: 'On IndianOil’s portal',
      block: true,
      value: (
        <span className="grid gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <Badge intent={portal.intent}>{portal.label}</Badge>
            {status.checkedAt ? (
              <span className="text-xs text-text-muted">
                Read {formatDateTime(status.checkedAt)}
              </span>
            ) : null}
          </span>
          <span className="text-text-muted">{portal.line}</span>
        </span>
      ),
    },
    {
      key: 'filed',
      label: branded ? 'Marked as filled' : 'Last filed',
      value: lastFiledLine(status),
    },
  ];
  if (due) items.push({ key: 'due', label: 'Due', value: due });
  if (tried) items.push({ key: 'tried', label: 'Last try', value: tried, block: true });
  if (readFailed) {
    items.push({ key: 'readFailed', label: 'Last read failed', value: readFailed, block: true });
  }

  const fileG = fileKind ? fileGate(fileKind, view, false, today) : null;
  const testG = fileKind ? fileGate(fileKind, view, true, today) : null;
  const buttons = brandedButtons(status);

  const pressed = (key: string) => pendingKey === key;
  const keyFile = realAction ? actionKey(realAction) : '';
  const keyTest = testAction ? actionKey(testAction) : '';

  return (
    <Card
      className={cn(
        status.todo && branded && 'border-danger/40 bg-danger-soft/40',
        status.todo && !branded && 'border-warning bg-warning-soft/40',
      )}
    >
      <CardHeader padding="comfortable" align="center">
        <div className="min-w-0">
          <CardTitle>{kindTitle(status.kind)}</CardTitle>
          <CardSubtitle>{ruleWords(status, view.config.washroomEveryDays)}</CardSubtitle>
        </div>
        <Badge intent={badge.intent}>{badge.label}</Badge>
      </CardHeader>
      <CardContent className="grid gap-3">
        {taskLines.length > 0 ? (
          <div
            role="note"
            className={cn(
              'flex items-start gap-2 rounded-md border px-3 py-2 text-sm font-medium',
              branded
                ? 'border-danger/40 bg-danger-soft text-danger-strong'
                : 'border-warning bg-warning-soft text-warning-strong',
            )}
          >
            <AlertTriangle
              width={16}
              height={16}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0"
              aria-hidden
            />
            <div className="grid min-w-0 gap-1">
              {taskLines.map((line) => (
                <p key={line} className="break-words">
                  {line}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {settleYes && settleNo ? (
          <div className="grid gap-2 rounded-md border border-warning bg-warning-soft/40 p-3">
            <p className="text-sm text-text">
              MDG pressed Submit and never heard back. Open IndianOil’s page yourself and look, then
              say what you saw. Check now reads the page instead.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={runBusy}
                loading={pressed(actionKey(settleYes))}
                leftIcon={<ThumbsUp width={14} height={14} strokeWidth={1.75} />}
                onClick={() => onAct(settleYes)}
              >
                I checked: it went through
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={runBusy}
                loading={pressed(actionKey(settleNo))}
                leftIcon={<ThumbsDown width={14} height={14} strokeWidth={1.75} />}
                onClick={() => onAct(settleNo)}
              >
                I checked: it did not go through
              </Button>
            </div>
          </div>
        ) : null}

        <KeyValueList items={items} />

        {status.lastReply ? (
          <blockquote className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              What IndianOil’s portal replied
            </p>
            <p className="mt-0.5 whitespace-pre-wrap break-words">{status.lastReply}</p>
          </blockquote>
        ) : null}

        {children}

        <div className="flex flex-wrap items-center gap-2">
          {realAction && testAction ? (
            <>
              <Button
                size="sm"
                disabled={runBusy || !fileG?.ok}
                loading={pressed(keyFile)}
                leftIcon={<Send width={14} height={14} strokeWidth={1.75} />}
                onClick={() => onAct(realAction)}
              >
                File now
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={runBusy || !testG?.ok}
                loading={pressed(keyTest)}
                leftIcon={<FlaskConical width={14} height={14} strokeWidth={1.75} />}
                onClick={() => onAct(testAction)}
              >
                Test fill
              </Button>
            </>
          ) : (
            <>
              {buttons.filled ? (
                <Button
                  size="sm"
                  disabled={requestBusy}
                  loading={pressed('mark_branded_done:yes')}
                  leftIcon={<CheckCheck width={14} height={14} strokeWidth={1.75} />}
                  onClick={() => onAct({ action: 'mark_branded_done', done: true })}
                >
                  I filled it
                </Button>
              ) : null}
              {buttons.undo ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={requestBusy}
                  loading={pressed('mark_branded_done:no')}
                  leftIcon={<Undo2 width={14} height={14} strokeWidth={1.75} />}
                  onClick={() => onAct({ action: 'mark_branded_done', done: false })}
                >
                  Not filled after all
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                disabled={runBusy || !view.active}
                loading={checking}
                leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
                onClick={() => onAct({ action: 'check' })}
              >
                Check again
              </Button>
            </>
          )}
        </div>

        {fileKind && fileG && testG ? (
          <GateNotes
            notes={[
              { label: 'File now', gate: fileG },
              { label: 'Test fill', gate: testG },
            ]}
          />
        ) : null}
        {fileKind ? (
          <p className="text-xs text-text-subtle">
            Test fill fills IndianOil’s form and reads it back. It does not submit.
          </p>
        ) : (
          <p className="text-xs text-text-subtle">
            MDG never fills or presses anything on this page. Check again only reads it.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
