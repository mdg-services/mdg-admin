import { AlertCircle, FileClock, Save } from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  Checkbox,
  DataList,
  Drawer,
  EmptyState,
  HowThisWorks,
  Input,
  Label,
  Skeleton,
  Textarea,
  useToast,
  type DataColumn,
} from '@/components/ui';
import { useDocumentKindsQuery, useUpdateDocumentKind } from '@/hooks/api/useDocumentKinds';
import { ApiError } from '@/lib/api';
import {
  resolveReminderOffsets,
  sameReminderLadder,
  type DocumentKind,
} from '@dk/shared';
import type { UpdateDocumentKindInput } from '@dk/shared/schemas';

import { cadenceSentence } from './documents/format';
import {
  ladderValueFrom,
  ladderValueToOffsets,
  ReminderLadderField,
  type ReminderLadderValue,
} from './documents/ReminderLadderField';

/**
 * THE DOCUMENT CATALOG — what MDG can ask any dealer for, and how often it
 * chases them about the ones that run out.
 *
 * WHY THIS IS SUPER-ADMIN ONLY. Editing a row here changes what EVERY dealer can
 * be asked for and how often every one of them is chased — the same blast radius
 * as the Kavach task defaults and the staff work list, which is the precedent
 * followed both here and on the route (`/v1/super-admin/document-kinds`). The
 * nav flag only HIDES the link; the URL is guarded by `RequireSuperAdmin` in
 * `App.tsx`, and the two are kept in step by hand.
 *
 * WHAT THIS SCREEN DELIBERATELY CANNOT DO, because the route refuses all four:
 *
 *  1. Rename a code. `kindCode` is an ask's only link to what it is, so renaming
 *     orphans every paper ever filed under it. Retire the row and add a new one.
 *  2. Change `periodKind`. Every existing ask carries a key in the old shape,
 *     and the formatter would then be asked to turn `2026-09` into a day.
 *  3. Turn review off. A kind MDG reads by hand must be accepted by a person, or
 *     the platform publishes an acceptance nobody made — ADR 0011 with a nice UI
 *     on it.
 *  4. Delete. `active: false` retires a row; the row itself stays for ever,
 *     because every ask filed under it still has to be able to say what it was.
 *
 * ADDING A NEW KIND IS NOT OFFERED HERE. `POST /v1/super-admin/document-kinds`
 * exists, but `code`, `periodKind` and `freeform` are chosen once and can never
 * be corrected afterwards — a create form is a one-way door and was not part of
 * what this change was asked for. It is a deliberate gap, not an oversight.
 *
 * THE LADDER HAS NO "BACK TO THE SHIPPED DEFAULT" BUTTON, and that is the
 * route's decision rather than a missing control: an admin who wants 15/3/2/1
 * can type 15/3/2/1, and a magic reset that stored `null` would be
 * indistinguishable at read time from a row nobody has ever edited.
 */

/**
 * The ladder in force for one catalog row.
 *
 * The route RESOLVES this before it sends it, so a row nobody has ever edited
 * comes back as the shipped `[15, 3, 2, 1]` rather than as an absent field. This
 * wrapper is therefore a guard against an older server rather than everyday
 * arithmetic — and it is worth keeping, because the one thing an absent field
 * must NOT be read as is the empty ladder, which means never remind.
 *
 * The consequence of that resolution is worth stating, because it removed a
 * distinction this editor used to draw: "never edited" is no longer observable
 * from the wire, so the drawer cannot say so, and it no longer tries.
 */
function ladderOf(kind: { reminderOffsetDays?: number[] } | null | undefined): number[] {
  return resolveReminderOffsets(undefined, kind?.reminderOffsetDays);
}

/** The sentence that has to sit above every save control on this page. */
const CONSEQUENCE =
  'A ladder changed here decides when every outlet with no override for that paper next hears from MDG. Reminders already sent stay sent — this moves what happens from now on.';

export function DocumentKindsPage() {
  const toast = useToast();
  // Retired rows INCLUDED: a screen that hid them would be the only place a
  // retired kind could be revived from, and it would not show it.
  const catalogQ = useDocumentKindsQuery({ activeOnly: false });
  const [editing, setEditing] = React.useState<DocumentKind | null>(null);

  const kinds = React.useMemo(
    () => [...(catalogQ.data ?? [])].sort((a, b) => a.srNo - b.srNo || a.code.localeCompare(b.code)),
    [catalogQ.data],
  );
  const activeCount = kinds.filter((k) => k.active).length;
  const trackingCount = kinds.filter((k) => k.tracksValidity).length;

  const columns: DataColumn<DocumentKind>[] = [
    {
      id: 'paper',
      header: 'Paper',
      mobile: 'primary',
      cell: (k) => (
        <span className="block min-w-0">
          <span className="break-words font-medium">{k.titleEn}</span>
          <span className="block text-xs text-text-muted">{k.titleHi}</span>
          <span className="block break-all text-xs text-text-subtle">
            <code>{k.code}</code>
          </span>
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      width: '7rem',
      mobile: 'primaryRight',
      cell: (k) => (
        <Badge intent={k.active ? 'success' : 'neutral'}>{k.active ? 'Active' : 'Retired'}</Badge>
      ),
    },
    {
      id: 'runsOut',
      header: 'Runs out',
      width: '9rem',
      mobile: 'kv',
      cell: (k) =>
        k.tracksValidity ? (
          <span className="whitespace-nowrap">
            Yes{k.validityMonths ? ` · about ${k.validityMonths} months` : ''}
          </span>
        ) : (
          <span className="text-text-subtle">No</span>
        ),
    },
    {
      id: 'ladder',
      header: 'Reminders',
      mobile: 'kv',
      cell: (k) => (
        <span className="break-words">
          {k.tracksValidity ? cadenceSentence(ladderOf(k)) : '—'}
        </span>
      ),
    },
    {
      id: 'renewal',
      header: 'Renewal',
      width: '9rem',
      mobile: 'kv',
      cell: (k) =>
        !k.tracksValidity ? (
          <span className="text-text-subtle">—</span>
        ) : k.autoRenew === false ? (
          <span className="whitespace-nowrap">MDG raises it</span>
        ) : (
          <span className="whitespace-nowrap">Opens by itself</span>
        ),
    },
    {
      id: 'audience',
      header: 'Dealer sees it',
      width: '8rem',
      mobile: 'meta',
      cell: (k) =>
        k.dealerVisible ? (
          <span className="whitespace-nowrap">On their list</span>
        ) : (
          <span className="whitespace-nowrap text-text-subtle">Internal only</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Document catalog"
        subtitle="What MDG can ask any dealer for, which of those papers run out, and how far ahead each one is chased. A per-paper override for one outlet lives on that paper's own row in Documents."
        actions={<HowThisWorks surface="admin-document-kinds" label="Document catalog" />}
      />

      {/* Written twice rather than as one node inside a `<details>` carrying an
          `md:` rule: a `<details>` body is hidden by the browser's own
          machinery, which no class can reopen, so a desktop reader would get the
          summary and never the paragraph. Same shape as the Kavach defaults
          page, and for the same measured reason — the sentence is ~120px of an
          already crowded first screen at 360px. */}
      {/* `text-warning-strong`, not `text-warning`: #d97706 on #fef3c7 is 3.14:1
          and this is a consequence warning somebody has to actually read. The
          strong shade measures 6.37:1 on the same background. */}
      <details className="mb-4 rounded-md border border-warning bg-warning-soft px-3 text-xs text-warning-strong md:hidden">
        <summary className="min-h-11 cursor-pointer select-none py-3 font-semibold">
          What editing these does
        </summary>
        <p className="pb-3">{CONSEQUENCE}</p>
      </details>
      <Callout className="mb-4 hidden md:flex" intent="warning">
        {CONSEQUENCE}
      </Callout>

      {catalogQ.isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : catalogQ.isError ? (
        <EmptyState
          icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
          title="Could not load the catalog"
          description={
            catalogQ.error instanceof ApiError ? catalogQ.error.message : 'Please try again.'
          }
          cta={
            <Button variant="secondary" size="sm" onClick={() => void catalogQ.refetch()}>
              Retry
            </Button>
          }
        />
      ) : (
        <>
          <p className="mb-2 text-sm text-text-muted">
            {activeCount} paper{activeCount === 1 ? '' : 's'} MDG can ask for, {trackingCount} of
            which {trackingCount === 1 ? 'runs' : 'run'} out.
          </p>
          <Card>
            <CardContent padding="none" className="md:p-4">
              <DataList
                rows={kinds}
                columns={columns}
                rowKey={(k) => k.code}
                onRowClick={setEditing}
                rowTone={(k) => (k.active ? 'default' : 'muted')}
                cardVariant="rows"
                empty={
                  <EmptyState
                    icon={<FileClock width={28} height={28} strokeWidth={1.75} />}
                    title="The catalog is empty"
                    description="The server seeds this on boot, so an empty catalog means the seeder has not run."
                  />
                }
              />
            </CardContent>
          </Card>
        </>
      )}

      <EditKindDrawer
        kind={editing}
        onClose={() => setEditing(null)}
        onSaved={(k) => toast.success(`${k.titleEn} saved`)}
      />
    </div>
  );
}

/* ─────────────────────────────── The editor ─────────────────────────────── */

/**
 * One catalog row's editable half.
 *
 * Plain state rather than react-hook-form, matching every other form in this
 * feature (`AskDocumentDialog`, `FileForDealerDialog`): the ladder is not a
 * field a resolver can validate on its own — it is a mode plus a text box whose
 * empty case is a real setting — and half a form under a resolver with the
 * dangerous half outside it is worse than neither.
 *
 * ONLY WHAT CHANGED IS SENT. `updateDocumentKindSchema` refuses an empty body,
 * and more to the point every field named in a PATCH is written: sending the
 * whole form back would stamp the ladder onto a row whose ladder nobody touched,
 * turning "follows the shipped default" into "pinned to 15/3/2/1" with nothing
 * on any screen looking different.
 */
function EditKindDrawer({
  kind,
  onClose,
  onSaved,
}: {
  kind: DocumentKind | null;
  onClose: () => void;
  onSaved: (kind: DocumentKind) => void;
}) {
  const update = useUpdateDocumentKind();

  const [titleEn, setTitleEn] = React.useState('');
  const [titleHi, setTitleHi] = React.useState('');
  const [hintEn, setHintEn] = React.useState('');
  const [hintHi, setHintHi] = React.useState('');
  const [confirmEn, setConfirmEn] = React.useState('');
  const [confirmHi, setConfirmHi] = React.useState('');
  const [tracksValidity, setTracksValidity] = React.useState(false);
  const [validityMonths, setValidityMonths] = React.useState('');
  const [autoRenew, setAutoRenew] = React.useState(true);
  const [dealerVisible, setDealerVisible] = React.useState(true);
  const [active, setActive] = React.useState(true);
  const [ladder, setLadder] = React.useState<ReminderLadderValue>({ mode: 'remind', text: '' });
  const [error, setError] = React.useState<string | null>(null);

  /** The ladder actually in force for this kind. */
  const effectiveLadder = React.useMemo(() => ladderOf(kind), [kind]);

  // Re-seeded per row. A drawer that remembered the last paper's Hindi hint
  // would put it on the next one the moment somebody pressed Save.
  const code = kind?.code;
  React.useEffect(() => {
    if (!kind) return;
    setTitleEn(kind.titleEn);
    setTitleHi(kind.titleHi);
    setHintEn(kind.hintEn);
    setHintHi(kind.hintHi);
    setConfirmEn(kind.confirmEn);
    setConfirmHi(kind.confirmHi);
    setTracksValidity(kind.tracksValidity ?? false);
    setValidityMonths(kind.validityMonths ? String(kind.validityMonths) : '');
    setAutoRenew(kind.autoRenew !== false);
    setDealerVisible(kind.dealerVisible);
    setActive(kind.active);
    setLadder(ladderValueFrom(ladderOf(kind)));
    setError(null);
    // Keyed on the CODE, not the object: the catalog query hands back a new
    // object on every refetch, and re-seeding on that would wipe a half-typed
    // Hindi hint the moment anything else on the page refreshed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (!kind) return null;

  const parsedLadder = ladderValueToOffsets(ladder);

  async function handleSave(): Promise<void> {
    if (!kind) return;
    setError(null);

    const words: Array<[string, string, number]> = [
      ['English title', titleEn, 200],
      ['Hindi title', titleHi, 200],
      ['English hint', hintEn, 300],
      ['Hindi hint', hintHi, 300],
      ['English confirm line', confirmEn, 200],
      ['Hindi confirm line', confirmHi, 200],
    ];
    for (const [name, value, max] of words) {
      if (value.trim() === '') {
        // Both languages are required, exactly as in the Kavach catalog: every
        // dealer-facing surface is Hindi-first, and a kind with no Hindi title
        // renders as an English line in the middle of a Hindi list — which is
        // where a non-technical reader stops reading.
        setError(`${name} cannot be empty.`);
        return;
      }
      if (value.trim().length > max) {
        setError(`${name} is longer than ${max} characters.`);
        return;
      }
    }

    let months: number | null = null;
    if (tracksValidity && validityMonths.trim() !== '') {
      const n = Number(validityMonths.trim());
      if (!Number.isInteger(n) || n < 1 || n > 600) {
        setError('The usual term is a whole number of months, between 1 and 600.');
        return;
      }
      months = n;
    }

    if (tracksValidity && parsedLadder.error) {
      setError(parsedLadder.error);
      return;
    }

    const patch: UpdateDocumentKindInput = {
      ...(titleEn.trim() !== kind.titleEn ? { titleEn: titleEn.trim() } : {}),
      ...(titleHi.trim() !== kind.titleHi ? { titleHi: titleHi.trim() } : {}),
      ...(hintEn.trim() !== kind.hintEn ? { hintEn: hintEn.trim() } : {}),
      ...(hintHi.trim() !== kind.hintHi ? { hintHi: hintHi.trim() } : {}),
      ...(confirmEn.trim() !== kind.confirmEn ? { confirmEn: confirmEn.trim() } : {}),
      ...(confirmHi.trim() !== kind.confirmHi ? { confirmHi: confirmHi.trim() } : {}),
      ...(tracksValidity !== (kind.tracksValidity ?? false) ? { tracksValidity } : {}),
      ...(months !== (kind.validityMonths ?? null) ? { validityMonths: months } : {}),
      ...(autoRenew !== (kind.autoRenew !== false) ? { autoRenew } : {}),
      ...(dealerVisible !== kind.dealerVisible ? { dealerVisible } : {}),
      ...(active !== kind.active ? { active } : {}),
      // The ladder is only sent when it actually MOVED. Sending it unchanged
      // would pin a row that follows the shipped default to a literal copy of
      // it — same numbers today, and no longer following the default tomorrow.
      ...(tracksValidity &&
      parsedLadder.offsets !== null &&
      !sameReminderLadder(parsedLadder.offsets, effectiveLadder)
        ? { reminderOffsetDays: parsedLadder.offsets }
        : {}),
    };

    if (Object.keys(patch).length === 0) {
      setError('Nothing has changed yet.');
      return;
    }

    try {
      const saved = await update.mutateAsync({ code: kind.code, ...patch });
      onSaved(saved);
      onClose();
    } catch (err) {
      // The server's own sentence, shown as written — it already says why.
      setError(err instanceof ApiError ? err.message : 'Could not save it');
    }
  }

  return (
    <Drawer
      open={Boolean(kind)}
      onClose={onClose}
      width="lg"
      title={kind.titleEn}
      description={`${kind.code} · ${kind.periodKind === 'NONE' ? 'no period' : `one per ${kind.periodKind.toLowerCase()}`}${kind.freeform ? ' · freeform' : ''}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={update.isPending}>
            Close
          </Button>
          <Button
            onClick={() => void handleSave()}
            loading={update.isPending}
            disabled={update.isPending}
            leftIcon={<Save width={16} height={16} strokeWidth={1.75} />}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Callout intent="warning">{error}</Callout> : null}

        <Callout intent="info">
          The code and the period cannot be changed. A code is an ask&rsquo;s only link to what it
          is, so renaming one would orphan every paper ever filed under it — retire this row and
          add a new one instead.
        </Callout>

        {/* ── Does it run out? ── */}
        <div className="rounded-md border border-border bg-surface-2 p-3">
          <Checkbox
            align="start"
            checked={tracksValidity}
            disabled={update.isPending}
            onChange={(e) => setTracksValidity(e.target.checked)}
            label="This paper carries a date it is good until"
            hint="Switching it on makes the accept dialog ask for that date, and puts the paper in front of the nightly reminder pass."
          />

          {tracksValidity ? (
            <div className="mt-3 space-y-3">
              <div>
                <Label htmlFor="kind-months">Usually good for (months)</Label>
                <Input
                  id="kind-months"
                  inputMode="numeric"
                  value={validityMonths}
                  disabled={update.isPending}
                  placeholder="e.g. 12"
                  className="md:w-40"
                  onChange={(e) => setValidityMonths(e.target.value)}
                />
                <p className="mt-1 text-xs text-text-muted">
                  A PREFILL AND NOTHING MORE. It fills the date box so nobody counts three years
                  forward in their head; the date that governs is the one printed on the paper,
                  which a person then confirms.
                </p>
              </div>

              <ReminderLadderField
                id="kind-ladder"
                value={ladder}
                onChange={setLadder}
                disabled={update.isPending}
                subject={`every outlet's ${kind.titleEn}`}
                inherited="an individual paper may still override this from its own row in Documents"
              />

              <Checkbox
                align="start"
                checked={autoRenew}
                disabled={update.isPending}
                onChange={(e) => setAutoRenew(e.target.checked)}
                label="The first reminder also opens the renewal request"
                hint="Leave it on. A dealer told their licence expires in three days needs somewhere to put the new one — a warning with no upload slot behind it is a worry rather than a job."
              />
            </div>
          ) : null}
        </div>

        {/* ── The words ── */}
        <div className="grid gap-3 [&>*]:min-w-0 md:grid-cols-2">
          <div>
            <Label htmlFor="kind-title-en" required>
              Title (English)
            </Label>
            <Input
              id="kind-title-en"
              value={titleEn}
              maxLength={200}
              disabled={update.isPending}
              onChange={(e) => setTitleEn(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="kind-title-hi" required>
              Title (Hindi)
            </Label>
            <Input
              id="kind-title-hi"
              value={titleHi}
              maxLength={200}
              disabled={update.isPending}
              onChange={(e) => setTitleHi(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 [&>*]:min-w-0 md:grid-cols-2">
          <div>
            <Label htmlFor="kind-hint-en" required>
              What a good photo shows (English)
            </Label>
            <Textarea
              id="kind-hint-en"
              value={hintEn}
              rows={2}
              maxLength={300}
              disabled={update.isPending}
              onChange={(e) => setHintEn(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="kind-hint-hi" required>
              What a good photo shows (Hindi)
            </Label>
            <Textarea
              id="kind-hint-hi"
              value={hintHi}
              rows={2}
              maxLength={300}
              disabled={update.isPending}
              onChange={(e) => setHintHi(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 [&>*]:min-w-0 md:grid-cols-2">
          <div>
            <Label htmlFor="kind-confirm-en" required>
              The confirm question (English)
            </Label>
            <Input
              id="kind-confirm-en"
              value={confirmEn}
              maxLength={200}
              disabled={update.isPending}
              onChange={(e) => setConfirmEn(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="kind-confirm-hi" required>
              The confirm question (Hindi)
            </Label>
            <Input
              id="kind-confirm-hi"
              value={confirmHi}
              maxLength={200}
              disabled={update.isPending}
              onChange={(e) => setConfirmHi(e.target.value)}
            />
          </div>
        </div>

        {/* ── Who it is for, and whether it is still offered ── */}
        <div className="space-y-2 rounded-md border border-border p-3">
          <Checkbox
            align="start"
            checked={dealerVisible}
            disabled={update.isPending}
            onChange={(e) => setDealerVisible(e.target.checked)}
            label="Show this on the dealer's own list"
            hint="Off means MDG tracks the paper internally without putting it on a forecourt owner's screen. It is not the same as retiring it."
          />
          <Checkbox
            align="start"
            checked={active}
            disabled={update.isPending}
            onChange={(e) => setActive(e.target.checked)}
            label="Still offered when asking for a paper"
            hint="Off retires it. Requests already made stay on the dealer's list — a paper MDG has already asked for does not stop being owed because the catalog was tidied."
          />
        </div>

        {kind.profileFieldKey ? (
          <Callout intent="info">
            Accepting one of these writes its date onto the outlet Info tab&rsquo;s{' '}
            <code>{kind.profileFieldKey}</code> field, so the two can never hold rival dates.
            That mapping is set in code and is not editable here.
          </Callout>
        ) : null}
      </div>
    </Drawer>
  );
}
