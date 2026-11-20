/** A per-km price: `baseFee` covers the first `includedKm`, every further km costs `perKmRate`. */
export interface FareRule {
  baseFee: number;
  includedKm: number;
  perKmRate: number;
}

/** The fare in whole rupees for a trip of `km` (partial km is charged pro rata). */
export function fareForKm(rule: FareRule, km: number): number {
  if (!Number.isFinite(km) || km < 0) throw new Error('Distance must be zero or more');
  const extra = Math.max(0, km - (rule.includedKm || 0));
  return Math.round(rule.baseFee + extra * rule.perKmRate);
}

/** The rule a service stores (its `price` is the base fee). */
export const ruleOf = (s: { price: number; includedKm?: number | null; perKmRate?: number | null }): FareRule => ({
  baseFee: s.price,
  includedKm: s.includedKm ?? 0,
  perKmRate: s.perKmRate ?? 0,
});
