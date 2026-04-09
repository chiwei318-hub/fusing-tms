/**
 * settlementEngine.ts — 物流清算計算引擎
 *
 * 資金流向：
 *   總運費 (total_freight)
 *     − 系統服務費（抽成）  = total × commission_rate%
 *     − 保險費              = total × insurance_rate%
 *     − 其他手續費          = total × other_fee_rate%  +  other_fee_fixed
 *   ─────────────────────────────────────────────
 *   = 撥付給加盟主          (franchisee_payout)
 */

export interface SettlementParams {
  totalFreight:    number;
  commissionRate:  number;   // % (系統服務費抽成, e.g. 15)
  insuranceRate:   number;   // % (保險費率, e.g. 1)
  otherFeeRate:    number;   // % (其他手續費率, e.g. 0.5)
  otherFeeFixed?:  number;   // NT$ 固定手續費 (疊加在 %)
}

export interface SettlementResult {
  totalFreight:      number;   // 總運費
  systemCommission:  number;   // 系統服務費（抽成）
  insuranceFee:      number;   // 保險費
  otherHandlingFee:  number;   // 其他手續費（% + fixed）
  totalDeductions:   number;   // 系統扣項合計
  franchiseePayout:  number;   // 撥付給加盟主金額
  effectiveRate:     number;   // 總扣除率 (%)
}

export interface SettlementBreakdown extends SettlementResult {
  params: SettlementParams;
  calculatedAt: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 計算單趟清算金額
 */
export function calculateSettlement(params: SettlementParams): SettlementResult {
  const {
    totalFreight,
    commissionRate,
    insuranceRate,
    otherFeeRate,
    otherFeeFixed = 0,
  } = params;

  const systemCommission  = round2(totalFreight * commissionRate  / 100);
  const insuranceFee      = round2(totalFreight * insuranceRate   / 100);
  const otherHandlingFee  = round2(totalFreight * otherFeeRate    / 100 + otherFeeFixed);
  const totalDeductions   = round2(systemCommission + insuranceFee + otherHandlingFee);
  const franchiseePayout  = round2(totalFreight - totalDeductions);
  const effectiveRate     = totalFreight > 0
    ? round2(totalDeductions / totalFreight * 100)
    : 0;

  return {
    totalFreight,
    systemCommission,
    insuranceFee,
    otherHandlingFee,
    totalDeductions,
    franchiseePayout,
    effectiveRate,
  };
}

/**
 * 計算 + 加上 metadata，方便記錄與除錯
 */
export function calculateSettlementWithMeta(params: SettlementParams): SettlementBreakdown {
  return {
    ...calculateSettlement(params),
    params,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * 批次計算（多趟）
 */
export function calculateBatchSettlement(
  trips: Array<{ id: string | number; totalFreight: number }>,
  baseParams: Omit<SettlementParams, "totalFreight">
): Array<{ id: string | number } & SettlementResult> {
  return trips.map(trip => ({
    id: trip.id,
    ...calculateSettlement({ ...baseParams, totalFreight: trip.totalFreight }),
  }));
}
