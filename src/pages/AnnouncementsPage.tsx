import { Megaphone } from 'lucide-react';
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
  ConfirmDialog,
  Input,
  Label,
  SegmentedControl,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  useAnnouncement,
  useAnnouncementOptions,
  useAnnouncementPreview,
  useAnnouncements,
  useSendAnnouncement,
} from '@/hooks/api/useAnnouncements';
import { ApiError } from '@/lib/api';
import {
  ANNOUNCEMENT_LIMITS,
  ANNOUNCEMENT_TONE_LABELS,
  SHARE_AUDIENCE_LABELS,
  type AnnouncementTarget,
  type AnnouncementTone,
  type AnnouncementView,
  type ShareAudience,
} from '@dk/shared';
import type { PreviewAnnouncementInput } from '@dk/shared/schemas';

type TargetKind = AnnouncementTarget['kind'];

/** The strip colours, written out so the preview does not depend on this app's palette. */
const STRIP: Record<AnnouncementTone, { bg: string; fg: string }> = {
  new: { bg: '#059669', fg: '#ffffff' },
  notice: { bg: '#0284c7', fg: '#ffffff' },
  important: { bg: '#f59e0b', fg: '#451a03' },
};

const TONE_OPTIONS = (Object.keys(ANNOUNCEMENT_TONE_LABELS) as AnnouncementTone[]).map((t) => ({
  value: t,
  label: ANNOUNCEMENT_TONE_LABELS[t],
}));

const AUDIENCE_OPTIONS = (Object.keys(SHARE_AUDIENCE_LABELS) as ShareAudience[]).map((a) => ({
  value: a,
  label: SHARE_AUDIENCE_LABELS[a],
}));

const TARGET_OPTIONS: Array<{ value: TargetKind; label: string }> = [
  { value: 'service', label: 'Pumps with a service' },
  { value: 'dealers', label: 'Pick pumps' },
  { value: 'all', label: 'Every pump' },
];

const newKey = () =>
  globalThis.crypto?.randomUUID?.().replace(/-/g, '') ??
  `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** `*bold*` the way the dealer's chat draws it; everything else as typed. */
function bold(text: string): React.ReactNode {
  const parts = text.split(/(^|[\s(])\*(\S(?:[^*\n]*?\S)?)\*(?=$|[\s.,!?;:)])/g);
  // split with two capture groups yields [text, lead, bold, text, lead, bold, …]
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    out.push(<React.Fragment key={`t${i}`}>{parts[i]}</React.Fragment>);
    if (i + 2 < parts.length) {
      out.push(<React.Fragment key={`l${i}`}>{parts[i + 1]}</React.Fragment>);
      out.push(<strong key={`b${i}`}>{parts[i + 2]}</strong>);
    }
  }
  return out;
}

/** What the dealer sees: the same strip, title and words as the chat card. */
function CardPreview({
  tone,
  title,
  body,
}: {
  tone: AnnouncementTone;
  title: string;
  body: string;
}) {
  const strip = STRIP[tone];
  return (
    <div className="rounded-md p-3" style={{ background: '#efeae2' }}>
      <div
        className="w-full max-w-[330px] overflow-hidden rounded-md shadow-sm"
        style={{ background: '#ffffff', color: '#111b21' }}
      >
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
          style={{ background: strip.bg, color: strip.fg }}
        >
          <Megaphone width={14} height={14} strokeWidth={2.4} aria-hidden />
          <span>{ANNOUNCEMENT_TONE_LABELS[tone]}</span>
          <span className="ml-auto normal-case tracking-normal opacity-90">MDG</span>
        </div>
        <div className="px-2.5 pb-2 pt-2">
          <p className="break-words text-[17px] font-bold leading-snug">
            {title.trim() || 'Your title'}
          </p>
          <div className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-[1.4]">
            {body.trim() ? bold(body) : <span style={{ color: '#667781' }}>Your message</span>}
          </div>
          <p className="mt-1 text-right text-[11px]" style={{ color: '#667781' }}>
            now
          </p>
        </div>
      </div>
    </div>
  );
}

function targetLabel(t: AnnouncementTarget, services: Map<string, string>): string {
  if (t.kind === 'all') return 'Every pump';
  if (t.kind === 'service') return `Pumps with ${services.get(t.serviceId) ?? t.serviceId}`;
  return t.codes.length <= 6 ? t.codes.join(', ') : `${t.codes.length} pumps`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function DetailCard({ id }: { id: string }) {
  const q = useAnnouncement(id);
  const a = q.data;
  if (q.isLoading || !a) return <Skeleton className="h-24 w-full" />;
  const stale = a.status === 'sending' && Date.now() - new Date(a.createdAt).getTime() > 10 * 60_000;
  return (
    <div className="mt-3 rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{a.title}</strong>
        <Badge intent={a.status === 'sent' ? 'success' : stale ? 'danger' : 'info'}>
          {a.status === 'sent' ? 'Sent' : stale ? 'Stopped part-way' : 'Sending…'}
        </Badge>
        <span className="text-text-subtle">
          {a.counts.posted} reached · {a.counts.skipped} left out · {a.counts.failed} failed
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-text-muted">{a.body}</p>
      <ul className="mt-3 grid gap-1 sm:grid-cols-2">
        {(a.deliveries ?? []).map((d) => (
          <li key={d.dealerId} className="flex items-center gap-2">
            <span className="w-12 font-medium">{d.code}</span>
            <Badge intent={d.state === 'posted' ? 'success' : d.state === 'skipped' ? 'warning' : 'danger'}>
              {d.state === 'posted' ? 'Reached' : d.state === 'skipped' ? 'Left out' : 'Failed'}
            </Badge>
            {d.reason ? <span className="min-w-0 break-words text-text-subtle">{d.reason}</span> : null}
          </li>
        ))}
      </ul>
      {stale ? (
        <Callout intent="warning" className="mt-3">
          This send stopped before every pump was dealt with. The pumps listed above got it; the rest did not.
        </Callout>
      ) : null}
    </div>
  );
}

export function AnnouncementsPage() {
  const toast = useToast();
  const options = useAnnouncementOptions();
  const history = useAnnouncements();
  const send = useSendAnnouncement();

  const [tone, setTone] = React.useState<AnnouncementTone>('new');
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [pushText, setPushText] = React.useState('');
  const [audience, setAudience] = React.useState<ShareAudience>('owners');
  const [kind, setKind] = React.useState<TargetKind>('service');
  const [serviceId, setServiceId] = React.useState('');
  const [codesText, setCodesText] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  // One key per form: a second press, or a retry after a dropped connection, sends
  // the same key and the server posts nothing more. Fresh after a successful send.
  const sendKey = React.useRef(newKey());

  const services = React.useMemo(
    () => (options.data?.services ?? []).filter((s) => s.attached > 0),
    [options.data],
  );
  const serviceNames = React.useMemo(
    () => new Map((options.data?.services ?? []).map((s) => [s.serviceId, s.label])),
    [options.data],
  );
  React.useEffect(() => {
    if (!serviceId && services[0]) setServiceId(services[0].serviceId);
  }, [services, serviceId]);

  const codes = React.useMemo(
    () => [...new Set(codesText.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean))],
    [codesText],
  );

  const target: AnnouncementTarget | null =
    kind === 'all'
      ? { kind: 'all' }
      : kind === 'service'
        ? serviceId
          ? { kind: 'service', serviceId }
          : null
        : codes.length > 0
          ? { kind: 'dealers', codes }
          : null;

  const previewInput: PreviewAnnouncementInput | null = target ? { audience, target } : null;
  const preview = useAnnouncementPreview(previewInput);

  const titleOk = title.trim().length >= 3;
  const bodyOk = body.trim().length >= 5;
  const canSend = titleOk && bodyOk && !!preview.data && preview.data.willSend > 0 && !send.isPending;

  async function doSend() {
    if (!target) return;
    try {
      const sent = await send.mutateAsync({
        title: title.trim(),
        body: body.trim(),
        tone,
        pushText: pushText.trim(),
        audience,
        target,
        sendKey: sendKey.current,
      });
      sendKey.current = newKey();
      setConfirming(false);
      setOpenId(sent.id);
      toast.success('Sending. Watch the list below for who it reached.');
    } catch (err) {
      setConfirming(false);
      toast.error(err instanceof ApiError ? err.message : 'Could not send the announcement');
    }
  }

  return (
    <div>
      <PageHeader
        title="Announcements"
        subtitle="One message to many pumps at once. Each pump sees it in its chat as a coloured card, and the owner can answer by writing."
      />

      <div className="grid gap-3 lg:grid-cols-2 md:gap-4 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Write it</CardTitle>
              <CardSubtitle>Plain words, as you would write to the owner. *Stars* make a word bold.</CardSubtitle>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div>
              <Label>Kind of message</Label>
              <SegmentedControl value={tone} onChange={setTone} options={TONE_OPTIONS} aria-label="Kind of message" />
            </div>
            <div>
              <Label hint={`${title.length}/${ANNOUNCEMENT_LIMITS.title}`}>Title</Label>
              <Input
                value={title}
                maxLength={ANNOUNCEMENT_LIMITS.title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="TT Acknowledgement: ab bhool bhi gaye to tension nahi"
              />
            </div>
            <div>
              <Label hint={`${body.length}/${ANNOUNCEMENT_LIMITS.body}`}>Message</Label>
              <Textarea
                rows={9}
                value={body}
                maxLength={ANNOUNCEMENT_LIMITS.body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={'Aaj se agar aap bhool gaye to raat ko *hamari team* mark kar degi…'}
              />
            </div>
            <div>
              <Label hint="Optional">Line on the phone&apos;s lock screen</Label>
              <Input
                value={pushText}
                maxLength={ANNOUNCEMENT_LIMITS.pushText}
                onChange={(e) => setPushText(e.target.value)}
                placeholder="Left empty, the title is shown"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>How the dealer sees it</CardTitle>
              <CardSubtitle>The card in their chat. There is no button on it.</CardSubtitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardPreview tone={tone} title={title} body={body} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Who gets it</CardTitle>
              <CardSubtitle>Check the list before you send. A message in a chat cannot be taken back.</CardSubtitle>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Which pumps</Label>
                <SegmentedControl value={kind} onChange={setKind} options={TARGET_OPTIONS} aria-label="Which pumps" />
              </div>
              <div>
                <Label>Who in the pump</Label>
                <SegmentedControl
                  value={audience}
                  onChange={setAudience}
                  options={AUDIENCE_OPTIONS}
                  aria-label="Who in the pump"
                />
              </div>
            </div>

            {kind === 'service' ? (
              <div>
                <Label hint="Only pumps where it is running; a paused one is left out">Service</Label>
                {options.isLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                    {services.map((s) => (
                      <option key={s.serviceId} value={s.serviceId}>
                        {s.label} ({s.attached} running)
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            ) : null}
            {kind === 'dealers' ? (
              <div>
                <Label hint="Codes like 1E, 15E — separated by spaces or commas">Pump codes</Label>
                <Textarea rows={2} value={codesText} onChange={(e) => setCodesText(e.target.value)} placeholder="1E 3E 15E" />
              </div>
            ) : null}

            {!target ? (
              <p className="text-sm text-text-subtle">Choose who it goes to.</p>
            ) : preview.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : preview.isError ? (
              <Callout intent="warning" onRetry={() => void preview.refetch()}>
                Could not work out who gets it.
              </Callout>
            ) : preview.data ? (
              <div>
                <p className="text-sm">
                  <strong>{preview.data.willSend}</strong> {preview.data.willSend === 1 ? 'pump' : 'pumps'} will get it
                  {preview.data.willSkip > 0 ? `, ${preview.data.willSkip} will be left out` : ''}.
                </p>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {preview.data.recipients.map((r) => (
                    <li key={`${r.dealerId}-${r.code}`} className="flex flex-wrap items-center gap-2 rounded-sm border border-border px-2 py-1 text-sm">
                      <span className="w-10 font-medium">{r.code}</span>
                      {r.cannotSend ? (
                        <Badge intent="danger">Left out</Badge>
                      ) : (
                        <span className="text-text-subtle">
                          {r.reach.owners > 0 && audience !== 'managers' ? `${r.reach.owners} owner${r.reach.owners > 1 ? 's' : ''}` : ''}
                          {r.reach.owners > 0 && audience !== 'managers' && r.reach.managers > 0 && audience !== 'owners' ? ' · ' : ''}
                          {r.reach.managers > 0 && audience !== 'owners' ? `${r.reach.managers} manager${r.reach.managers > 1 ? 's' : ''}` : ''}
                        </span>
                      )}
                      {r.cannotSend ? <span className="min-w-0 break-words text-xs text-danger-strong">{r.cannotSend}</span> : null}
                      {r.warning ? <span className="w-full break-words text-xs text-warning-strong">{r.warning}</span> : null}
                    </li>
                  ))}
                </ul>
                {preview.data.recipients.some((r) => r.warning) ? (
                  <Callout intent="warning" className="mt-3">
                    Some pumps above have a note. They will still get the message; read the note first.
                  </Callout>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => setConfirming(true)} disabled={!canSend} loading={send.isPending}>
                Send to {preview.data ? preview.data.willSend : '…'} {preview.data?.willSend === 1 ? 'pump' : 'pumps'}
              </Button>
              {!titleOk || !bodyOk ? <span className="text-sm text-text-subtle">Write a title and a message first.</span> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Sent so far</CardTitle>
              <CardSubtitle>Tap one to see who it reached.</CardSubtitle>
            </div>
          </CardHeader>
          <CardContent>
            {history.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (history.data ?? []).length === 0 ? (
              <p className="text-sm text-text-subtle">Nothing sent yet.</p>
            ) : (
              <ul className="grid gap-2">
                {(history.data ?? []).map((a: AnnouncementView) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(openId === a.id ? null : a.id)}
                      className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-surface-muted"
                      aria-expanded={openId === a.id}
                    >
                      <span className="min-w-0 flex-1 break-words font-medium">{a.title}</span>
                      <Badge intent={a.status === 'sent' ? 'success' : 'info'}>{a.status === 'sent' ? 'Sent' : 'Sending…'}</Badge>
                      <span className="text-text-subtle">
                        {targetLabel(a.target, serviceNames)} · {SHARE_AUDIENCE_LABELS[a.audience]} · {a.counts.posted} reached
                        {a.counts.skipped + a.counts.failed > 0 ? `, ${a.counts.skipped + a.counts.failed} not` : ''} · {when(a.createdAt)}
                      </span>
                    </button>
                    {openId === a.id ? <DetailCard id={a.id} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Send to ${preview.data?.willSend ?? 0} ${preview.data?.willSend === 1 ? 'pump' : 'pumps'}?`}
        description="It goes into their chats now and cannot be taken back."
        confirmLabel="Send"
        loading={send.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void doSend()}
      />
    </div>
  );
}
