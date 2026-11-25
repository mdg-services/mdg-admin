import { reportDataOf, type MessageAiMeta, type MessageReport, type ReportKind } from '@dk/shared';

import { REPORT_KIND_SHORT_NAME } from './reportSummary';

/**
 * Two small admin-only marks the inbox thread puts on a bubble. The dealer's app
 * shows neither (ADR 0055): to the dealer a report is a team message that opens on
 * their Today page, and nothing says a machine wrote it. The team still has to tell
 * those two things apart, so the thread says it for them.
 */

/**
 * What the dealer's chat shows for a report: its words and a button to Today. The
 * thread keeps drawing the picture itself, because the team has to check what went
 * out, so this line says the dealer's side is different.
 */
export const DEALER_SEES_REPORT_LINE = 'Dealer sees: text + Today page';

/** Plain names for the hover text. A new kind fails to compile until it is named here. */
const REPORT_KIND_NAME: Record<ReportKind, string> = {
  dsr_sales: 'Daily sales report',
  dsr_variation: 'Stock variation sheet',
  credit_dod: 'Credit and DOD card',
  water_ingress: 'Water ingress check',
  ro_supply: 'Supply status',
  stock_check: 'Stock check',
  load_plan: 'Tanker plan',
  tanker_density: 'Tanker density',
  tt_ack: 'Tanker acknowledgement',
  fuel_order: 'Fuel order',
  declaration_filed: 'Declaration filed',
  du_otp: 'DU OTP receipt',
  mock_drill: 'Mock drill receipt',
  ledger_watch: 'Ledger watch card',
  announcement: 'Announcement',
  electrical_audit: 'Electrical audit',
  calibration_claim: 'Subsidy claim',
  paper_expiry: 'Papers running out',
};

/**
 * The "Dealer sees" line (ADR 0056). A new report carries a snapshot and no picture: the
 * dealer reads the words in the chat and opens the report, drawn by the app, on Today.
 * An older message has no snapshot, so the dealer's button opens its stored picture and
 * the line keeps its older wording.
 */
export function dealerSeesLine(report: MessageReport): string {
  if (!reportDataOf(report.data, report.kind)) return DEALER_SEES_REPORT_LINE;
  return `Dealer sees: ${REPORT_KIND_SHORT_NAME[report.kind]} report on Today`;
}

/** The hover text on the "Dealer sees" line: which report this is and what it says about itself. */
export function reportNoteTitle(report: MessageReport): string {
  const name = REPORT_KIND_NAME[report.kind];
  const when = report.day ? ` for ${report.day}` : '';
  return `${name}${when} · status: ${report.status}. The dealer reads the words in their chat and opens the report on Today.`;
}

/** The hover text on the "AI" chip: that a machine wrote this, and how. */
export function aiChipTitle(ai: MessageAiMeta): string {
  switch (ai.kind) {
    case 'answer':
      return 'Written by the AI from a ready template. The dealer is not told.';
    case 'written':
      return 'Written by the AI. The dealer is not told.';
    case 'handoff':
      return 'The AI’s line before a person takes over. The dealer is not told.';
    case 'reshare':
      return 'Re-sent by the AI. The dealer is not told.';
  }
}
