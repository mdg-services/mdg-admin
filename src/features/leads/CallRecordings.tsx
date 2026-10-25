import { Upload } from 'lucide-react';
import * as React from 'react';

import { Button, useToast } from '@/components/ui';
import { useRefreshListsWhenAnalysed, useUploadLeadRecording } from '@/hooks/api/useLeads';
import {
  RECORDING_ACCEPT,
  isClosed,
  recordingFileProblem,
  uploadLine,
  type ContactPrefill,
} from '@/lib/leads';
import { RecordingUploadError } from '@/lib/uploadLeadRecording';
import type { LeadRecording, LeadRow } from '@dk/shared';

import { RecordingCard } from './RecordingCard';
import { errorText } from './shared';

/** The newest few are shown; the rest wait behind "Show all". */
const FIRST = 3;

/** Where an upload has got to, for the line and the bar under the button. */
interface Sending {
  name: string;
  stage: 'sending' | 'saving';
  percent: number;
}

/**
 * The "Call recordings" section of a lead's drawer: the button that adds one,
 * how far an upload has got, and the recordings themselves, newest first.
 *
 * The team rings a lead, records the call, and uploads it here; the server
 * writes it down and a model boils it to a few lines, so whoever rings next
 * reads the gist instead of asking the lead to say it all again. While a call is
 * being listened to the drawer asks again every few seconds (in `useLeadQuery`)
 * and the summary appears by itself.
 *
 * The file is checked when it is picked, with a sentence that says what to do,
 * and nothing is sent for one the server would refuse. An upload that is under
 * way stops if the drawer is closed (it could be 40 MB on a phone's connection,
 * and nobody is watching it), and the line under the button says so. Once the
 * server is being told about the file it is not stopped: it is already up.
 */
export function CallRecordings({
  lead,
  recordings,
  now,
  onLogCall,
}: {
  lead: LeadRow;
  recordings: readonly LeadRecording[];
  now: number;
  onLogCall: (prefill: ContactPrefill) => void;
}) {
  const toast = useToast();
  const upload = useUploadLeadRecording();
  const pick = React.useRef<HTMLInputElement | null>(null);
  const abort = React.useRef<AbortController | null>(null);
  const saving = React.useRef(false);
  const [sending, setSending] = React.useState<Sending | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [all, setAll] = React.useState(false);

  useRefreshListsWhenAnalysed(recordings);

  React.useEffect(
    () => () => {
      if (!saving.current) abort.current?.abort();
    },
    [],
  );

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared at once, or picking the same file again after a failed try fires nothing.
    e.target.value = '';
    if (!file || sending) return;
    const refused = recordingFileProblem(file);
    if (refused) {
      setProblem(refused);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    saving.current = false;
    setProblem(null);
    setSending({ name: file.name, stage: 'sending', percent: 0 });
    try {
      await upload.mutateAsync({
        id: lead.id,
        file,
        signal: controller.signal,
        onStage: (stage) => {
          saving.current = stage === 'saving';
          setSending((s) => (s ? { ...s, stage } : s));
        },
        onProgress: (percent) => setSending((s) => (s ? { ...s, percent } : s)),
      });
      toast.success('Uploaded. Listening to the call…');
    } catch (err) {
      if (err instanceof RecordingUploadError && err.kind === 'STOPPED') {
        toast.info(err.message);
      } else {
        setProblem(errorText(err));
      }
    } finally {
      abort.current = null;
      setSending(null);
    }
  }

  const shown = all ? recordings : recordings.slice(0, FIRST);
  return (
    <div>
      <input
        ref={pick}
        type="file"
        accept={RECORDING_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void onPick(e)}
      />
      <Button
        size="sm"
        variant="secondary"
        className="w-full md:w-auto"
        leftIcon={<Upload width={15} height={15} strokeWidth={1.75} />}
        disabled={!!sending}
        onClick={() => pick.current?.click()}
      >
        Add call recording
      </Button>

      {sending ? (
        <div className="mt-2 min-w-0 rounded-md border border-border bg-surface-2 p-2.5 text-sm">
          <p className="truncate text-xs text-text-subtle">{sending.name}</p>
          <p className="mt-0.5 text-text">{uploadLine(sending.stage, sending.percent)}</p>
          {/* Hand-drawn, as the film bar and the slip upload's are: there is no progress-bar primitive yet. */}
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuenow={sending.stage === 'saving' ? 100 : sending.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface"
          >
            <div
              className="h-full rounded-full bg-brand transition-[width]"
              style={{ width: `${sending.stage === 'saving' ? 100 : sending.percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-text-muted">Keep this open until it is done.</p>
          {sending.stage === 'sending' ? (
            <Button
              size="sm"
              variant="ghost"
              className="mt-1 w-full md:w-auto"
              onClick={() => abort.current?.abort()}
            >
              Stop
            </Button>
          ) : null}
        </div>
      ) : null}
      {problem ? (
        // `text-sm`, not `FieldError`'s `text-xs`: a refusal has to be read on a phone in the sun.
        <p
          role="alert"
          className="mt-2 text-sm text-danger-strong [overflow-wrap:anywhere] md:text-danger"
        >
          {problem}
        </p>
      ) : null}

      {recordings.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">
          No recordings yet. Add one after a call, and the next person to ring sees the gist here.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {shown.map((r) => (
            <li key={r.id} className="min-w-0">
              <RecordingCard
                lead={lead}
                recording={r}
                now={now}
                canLog={!isClosed(lead.status)}
                onLogCall={onLogCall}
              />
            </li>
          ))}
        </ul>
      )}
      {recordings.length > FIRST ? (
        <Button
          variant="ghost"
          size="sm"
          tone="brand"
          padding="none"
          align="start"
          className="mt-2"
          onClick={() => setAll((v) => !v)}
        >
          {all ? 'Show fewer' : `Show all ${recordings.length}`}
        </Button>
      ) : null}
    </div>
  );
}
