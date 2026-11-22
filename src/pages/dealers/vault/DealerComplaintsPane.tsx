import {
  AlertCircle,
  DownloadCloud,
  MessageCircleQuestion,
  Plug,
  ScanSearch,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import * as React from "react";

import {
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Skeleton,
  useToast,
} from "@/components/ui";
import {
  useCheckComplaintsNow,
  useComplaintsDealerView,
  useComplaintsLive,
} from "@/hooks/api/useComplaints";
import { ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  StatTile,
  StatTileRow,
  StatTileSkeletons,
} from "@/pages/dataVault/StatTile";
import { dealerCodeLabel } from "@dk/shared";

import { AssetsCard } from "./complaints/AssetsCard";
import { ComplaintDrawer } from "./complaints/ComplaintDrawer";
import { ComplaintsTable } from "./complaints/ComplaintsTable";
import { isOpenOnPortal, waitingForDealer } from "./complaints/format";
import { PauseCard } from "./complaints/PauseCard";
import { useComplaintsRunWatcher } from "./complaints/useComplaintsRunWatcher";
import type { DealerVaultPaneProps } from "./types";

/**
 * An outlet's maintenance complaints (ADR 0052): what the dealer raised in the chat,
 * what MDG filed on IndianOil's four complaint systems, where each stands, and what
 * the robot found on the portals that nobody here raised.
 *
 * Reads top to bottom as the phone call goes: how many are open, which wait on the
 * dealer, which need a person, then the list and, in a drawer, the whole story of one.
 *
 * The admin never files or acknowledges anything from here. Filing and acknowledging
 * happen only on the dealer's own "yes" in the chat. The buttons record what a person
 * saw on the portal after an unclear step, ask the dealer the "is it fixed?" question
 * for a complaint the portal raised, or pause the service for the outlet.
 */
export function DealerComplaintsPane({ dealer }: DealerVaultPaneProps) {
  const toast = useToast();
  const viewQ = useComplaintsDealerView(dealer.id);
  useComplaintsLive(dealer.id);
  const check = useCheckComplaintsNow(dealer.id);
  const watcher = useComplaintsRunWatcher(dealer.id);
  const busy = check.isPending || watcher.busy;
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  // Ages are relative; keep them honest on a pane left open.
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  function runCheck() {
    check.mutate(undefined, {
      onSuccess: (res) => {
        const { outcome, reason, runId } = res.start;
        // Only a run that is going (new, joined or queued behind one) is watched. A check that
        // did not start has nothing to wait for: say why, plainly, and stop the spinner.
        if (outcome === "not_started") {
          toast.error(reason || "The check did not start.");
          return;
        }
        watcher.watch(runId);
        toast.success(
          "Checking. The portals take a minute or two; this section refreshes when it is done.",
        );
      },
      onError: (err) =>
        toast.error(
          err instanceof ApiError ? err.message : "Could not start the check",
        ),
    });
  }

  if (viewQ.isLoading) {
    return (
      <div className="grid gap-3 md:gap-4">
        <StatTileSkeletons count={4} />
        <Card>
          <CardContent className="grid gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // A failed background refetch keeps what was already loaded: the error screen is for
  // when there is nothing to show (a drawer with settle buttons must not vanish on a blip).
  if (viewQ.isError && !viewQ.data) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load the complaints"
        description={
          viewQ.error instanceof ApiError
            ? viewQ.error.message
            : "Please try again."
        }
        cta={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void viewQ.refetch()}
          >
            Retry
          </Button>
        }
      />
    );
  }

  const view = viewQ.data!;
  if (!view.attached && view.rows.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<Plug width={28} height={28} strokeWidth={1.75} />}
            title={`Complaints are not set up for ${dealerCodeLabel(dealer.code)}`}
            description="Attach Complaints from the Services tab. The outlet’s complaints on the portals then show here."
          />
        </CardContent>
      </Card>
    );
  }

  const open = view.rows.filter((r) => isOpenOnPortal(r.stage)).length;
  const waiting = view.rows.filter(waitingForDealer).length;
  const attention = view.rows.filter((r) => r.attention).length;
  const portalFound = view.rows.filter((r) => r.origin === "portal").length;
  const selected = view.rows.find((r) => r.id === openId) ?? null;

  return (
    <div className="grid gap-3 md:gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text">Complaints</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Outlet {dealerCodeLabel(dealer.code)} · Last checked{" "}
            {view.lastReadAt ? formatDateTime(view.lastReadAt) : "never"}
            {view.nextReadAt
              ? ` · Next check ${formatDateTime(view.nextReadAt)}`
              : ""}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          disabled={!view.attached}
          leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
          onClick={runCheck}
        >
          Check now
        </Button>
      </div>

      {viewQ.isError ? (
        <Callout>
          Could not refresh just now. This is the last list that loaded.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void viewQ.refetch()}
          >
            Try again
          </button>
        </Callout>
      ) : null}

      {view.pausedByTeam ? (
        <Callout>
          Complaints are paused for this outlet: nothing is filed or
          acknowledged for the dealer until it is resumed below.
        </Callout>
      ) : !view.serviceActive && view.attached ? (
        <Callout>
          The Complaints service is not active for this outlet, so nothing is
          filed or acknowledged for the dealer. Switch it on from the Services
          tab.
        </Callout>
      ) : null}

      <StatTileRow>
        <StatTile
          label="Open"
          value={open}
          tone="neutral"
          icon={<Wrench width={16} height={16} strokeWidth={1.75} />}
          hint={`of ${view.rows.length} kept`}
        />
        <StatTile
          label="Waiting for the dealer"
          value={waiting}
          tone="warning"
          icon={
            <MessageCircleQuestion width={16} height={16} strokeWidth={1.75} />
          }
          hint={
            waiting > 0
              ? "A question, a yes, or “is it working?”"
              : "Nothing waiting"
          }
        />
        <StatTile
          label="Needs attention"
          value={attention}
          tone="danger"
          icon={<TriangleAlert width={16} height={16} strokeWidth={1.75} />}
          hint={
            attention > 0 ? "A person has to settle these" : "Nothing stuck"
          }
        />
        <StatTile
          label="Found on the portal"
          value={portalFound}
          tone="neutral"
          icon={<ScanSearch width={16} height={16} strokeWidth={1.75} />}
          hint="Not raised from the chat; the dealer is not told"
        />
      </StatTileRow>

      <Card>
        <CardContent padding="none" className="md:p-4">
          <CardHeader align="center" padding="comfortable">
            <p className="text-base font-semibold text-text">Complaints</p>
            <p className="text-sm text-text-muted">
              Raised in the chat and found on the portals, newest first. Tap one
              for its whole story.
            </p>
          </CardHeader>
          <ComplaintsTable
            rows={view.rows}
            now={now}
            onOpen={(r) => setOpenId(r.id)}
            empty={
              <EmptyState
                icon={<Wrench width={24} height={24} strokeWidth={1.75} />}
                title="No complaints yet"
                description="When the dealer says something is broken in the chat, or the portals list a complaint for this outlet, it shows here."
              />
            }
          />
        </CardContent>
      </Card>

      <AssetsCard assets={view.assets} />
      {view.attached ? (
        <PauseCard
          dealerId={dealer.id}
          pausedByTeam={view.pausedByTeam}
          serviceActive={view.serviceActive}
        />
      ) : null}

      <ComplaintDrawer row={selected} onClose={() => setOpenId(null)} />
    </div>
  );
}
