/**
 * Period reconciliation for a single item.
 *
 * Stock Take displays opening/closing balances that are reverse-computed from
 * today's on-hand figure plus the period's movements. Negative on-hand is a
 * legitimate accounting state (an oversold item), so nothing here is clamped
 * to zero — clamping silently invents stock that does not exist.
 *
 *   closing = now − movementsAfterPeriod
 *   opening = closing − net movement inside the period
 *
 * where the in-period net movement is: −sold + received + adjustments
 * (sold is expressed as a positive quantity issued).
 */
export type ItemPeriodFlow = {
  /** Units issued to customers inside the period (positive). */
  sold: number;
  /** Units received from suppliers inside the period (positive). */
  received: number;
  /** Signed manual adjustment total inside the period. */
  adjustments: number;
  /** Units issued after the period end (positive). */
  soldAfter: number;
  /** Units received after the period end (positive). */
  receivedAfter: number;
  /** Signed adjustments after the period end. */
  adjustmentsAfter: number;
  /** On-hand right now (may be negative). */
  nowStock: number;
};

export function reconcileItem(flow: ItemPeriodFlow): {
  opening: number;
  closing: number;
} {
  const closing =
    Number(flow.nowStock || 0) +
    Number(flow.soldAfter || 0) -
    Number(flow.receivedAfter || 0) -
    Number(flow.adjustmentsAfter || 0);
  const opening =
    closing +
    Number(flow.sold || 0) -
    Number(flow.received || 0) -
    Number(flow.adjustments || 0);
  return { opening, closing };
}
