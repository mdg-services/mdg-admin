import { ChevronDown, RotateCw, Trash2 } from 'lucide-react';
import * as React from 'react';

import { Badge, Button, ConfirmDialog, Menu, MenuItem, Spinner, useToast } from '@/components/ui';
import { useDeleteLeadRecording, useRetryLeadRecording } from '@/hooks/api/useLeads';
import { cn } from '@/lib/cn';
import {
  interestLabel,
  interestTone,
  logCallPrefill,
  recordingFailureWords,
  recordingHeader,
  canRetryRecording,
  shortList,
  type ContactPrefill,
} from '@/lib/leads';
import type { LeadRecording, LeadRow } from '@dk/shared';

import { RecordingPlayer } from './RecordingPlayer';
import { errorText } from './shared';

const ICON = { width: 15, height: 15, strokeWidth: 1.75 } as const;

/**
 * One call recording in the drawer, built to be taken in at a glance.
 *
 * The top is the summary and nothing else: the one-line gist with a badge for
 * how keen they sounded, then what was said that matters and what to do next,
 * three short bullets each at most. Under it are the things a person does with
 * the call: play it, log it, or read every word. A call still being listened to
 * says so (a spinner and how long it usually takes), and one that could not be
 * says why in a sentence and offers "Try again" beside Play, where trying again
 * can help. The audio plays in every case.
 *
 * Every control is its own full-width 44px button below md, in a stack. Nothing
 * sits inside another tap target. The menu holds the one destructive thing,
 * behind a confirm, because a removed recording is gone for everybody.
 *
 * `canLog` is false for a closed lead: Log contact is not offered on one.
 */
export function RecordingCard({
  lead,
  recording: r,
  now,
  canLog,
  onLogCall,
}: {
  lead: LeadRow;
  recording: LeadRecording;
  now: number;
  canLog: boolean;
  onLogCall: (prefill: ContactPrefill) => void;
}) {
  const toast = useToast();
  const retry = useRetryLeadRecording();
  const remove = useDeleteLeadRecording();
  const [confirm, setConfirm] = React.useState(false);
  const [words, setWords] = React.useState(false);
  const wordsId = React.useId();

  const summary = r.status === 'ready' ? r.summary : null;
  const keyPoints = shortList(summary?.keyPoints);
  const nextSteps = shortList(summary?.nextSteps);
  // The words come back before the summary does, so a call whose summary failed can still be read.
  const transcript = r.transcript?.trim() ?? '';

  async function onRetry() {
    try {
      await retry.mutateAsync({ id: lead.id, recordingId: r.id });
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  async function onRemove() {
    try {
      await remove.mutateAsync({ id: lead.id, recordingId: r.id });
      toast.success('Recording removed.');
      setConfirm(false);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <div className="min-w-0 rounded-md border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-text-muted [overflow-wrap:anywhere]">
          {recordingHeader(r, now)}
        </p>
        <div className="-my-2 shrink-0">
          <Menu label="More for this recording" title="Call recording">
            <MenuItem danger icon={<Trash2 {...ICON} />} onSelect={() => setConfirm(true)}>
              Remove recording
            </MenuItem>
          </Menu>
        </div>
      </div>

      {summary ? (
        <>
          <div className="mt-1.5 flex items-start gap-2">
            <Badge intent={interestTone(summary.interest)} className="mt-px">
              {interestLabel(summary.interest)}
            </Badge>
            <p className="min-w-0 flex-1 select-text text-sm font-medium text-text [overflow-wrap:anywhere]">
              {summary.gist}
            </p>
          </div>
          {keyPoints.length > 0 || nextSteps.length > 0 ? (
            <div
              className={cn(
                'mt-3 grid gap-3',
                keyPoints.length > 0 && nextSteps.length > 0 && 'md:grid-cols-2 md:gap-4',
              )}
            >
              <Bullets title="Key points" items={keyPoints} />
              <Bullets title="Next steps" items={nextSteps} />
            </div>
          ) : null}
        </>
      ) : r.status === 'processing' ? (
        <>
          <Filename name={r.filename} />
          <p role="status" className="mt-2 flex items-center gap-2 text-sm text-text-muted">
            <span aria-hidden className="flex shrink-0">
              <Spinner size={14} />
            </span>
            <span>Listening to the call… usually under a minute.</span>
          </p>
        </>
      ) : r.status === 'failed' ? (
        <>
          <Filename name={r.filename} />
          <p className="mt-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-strong [overflow-wrap:anywhere] md:text-danger">
            {recordingFailureWords(r.failure)}
          </p>
        </>
      ) : (
        // Done, with nothing to show: not something the server should send, but not a blank card either.
        <>
          <Filename name={r.filename} />
          <p className="mt-2 text-sm text-text-muted">There is no summary for this call.</p>
        </>
      )}

      <div className="mt-3 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-start">
        {canRetryRecording(r, now) ? (
          <Button
            size="sm"
            variant="secondary"
            className="w-full md:w-auto"
            leftIcon={<RotateCw {...ICON} />}
            loading={retry.isPending}
            onClick={() => void onRetry()}
          >
            Try again
          </Button>
        ) : null}
        <RecordingPlayer leadId={lead.id} recordingId={r.id} />
        {summary && canLog ? (
          <Button
            size="sm"
            variant="secondary"
            className="w-full md:w-auto"
            onClick={() => onLogCall(logCallPrefill(summary))}
          >
            Log this call
          </Button>
        ) : null}
        {transcript ? (
          <Button
            size="sm"
            variant="ghost"
            tone="brand"
            className="w-full md:w-auto"
            aria-expanded={words}
            aria-controls={words ? wordsId : undefined}
            rightIcon={
              <ChevronDown
                {...ICON}
                className={cn('transition-transform', words && 'rotate-180')}
              />
            }
            onClick={() => setWords((v) => !v)}
          >
            What was said
          </Button>
        ) : null}
      </div>

      {words && transcript ? (
        <div
          id={wordsId}
          role="region"
          aria-label="What was said"
          tabIndex={0}
          // Its own box, so a long call scrolls here and not the whole drawer.
          className="mt-2 max-h-52 select-text overflow-y-auto overscroll-contain whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-2.5 text-sm text-text-muted [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {transcript}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void onRemove()}
        title="Remove this recording?"
        description="The audio and its summary are deleted for everyone."
        confirmLabel="Remove"
        confirmVariant="danger"
        loading={remove.isPending}
      />
    </div>
  );
}

/** What was uploaded, for a call that has no summary to say which it is. */
function Filename({ name }: { name: string }) {
  return <p className="mt-0.5 truncate text-xs text-text-subtle">{name}</p>;
}

/** A heading and its few short bullets. Nothing at all when there are none. */
function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="min-w-0">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">{title}</h4>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-text marker:text-text-subtle">
        {items.map((t, i) => (
          <li key={`${i}-${t}`} className="select-text [overflow-wrap:anywhere]">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
