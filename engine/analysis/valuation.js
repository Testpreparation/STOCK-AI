const finite = value => Number.isFinite(value);
const round = (value, digits = 2) => finite(value) ? Number(value.toFixed(digits)) : null;

/**
 * Transparent valuation indicators. Fair-value scenarios are deliberately
 * generic EPS x PE assumptions, not broker targets or sector-relative claims.
 */
export function calculateValuationIndicators({ price, financial } = {}) {
  const metrics = financial?.metrics ?? {};
  const eps = metrics.dilutedEps?.latest;
  const netIncome = metrics.netIncome?.latest;
  const equity = metrics.stockholdersEquity?.latest;
  const revenue = metrics.revenue?.latest;
  const pe = finite(price) && price > 0 && finite(eps) && eps > 0 ? price / eps : null;
  const impliedShares = finite(netIncome) && netIncome > 0 && finite(eps) && eps > 0
    ? netIncome / eps : null;
  const bookValuePerShare = finite(equity) && equity > 0 && finite(impliedShares) && impliedShares > 0
    ? equity / impliedShares : null;
  const pb = finite(price) && price > 0 && finite(bookValuePerShare) && bookValuePerShare > 0
    ? price / bookValuePerShare : null;
  const epsGrowth = metrics.dilutedEps?.yearOverYearGrowth;
  const growth = epsGrowth?.status === "calculated" && finite(epsGrowth.value)
    ? epsGrowth.value : null;
  const fairPe = growth === null ? null : Math.min(24, Math.max(10, 12 + growth * 0.25));
  const fairValue = finite(eps) && eps > 0 && finite(fairPe) ? eps * fairPe : null;
  const scenarios = finite(eps) && eps > 0 ? {
    conservative: round(eps * 10),
    base: round(eps * 16),
    optimistic: round(eps * 22)
  } : null;
  return {
    price: round(price),
    eps: round(eps, 4),
    pe: round(pe),
    bookValuePerShare: round(bookValuePerShare),
    pb: round(pb),
    revenue: round(revenue),
    epsGrowthPercent: round(growth),
    fairPe: round(fairPe),
    fairValue: round(fairValue),
    scenarios,
    upsideToBasePercent: finite(price) && price > 0 && scenarios
      ? round((scenarios.base / price - 1) * 100) : null,
    status: pe !== null || pb !== null ? "available" : "insufficient_data",
    assumptions: [
      "PERは直近通期EPSを使った参考値で、将来利益を保証しません。",
      "PBRは純利益÷EPSから発行株式数を概算できる場合のみ算出します。",
      "価格シナリオはEPS×PER 10倍・16倍・22倍の仮定値で、業種別適正株価ではありません。",
      "EPS成長率は通期データが2期以上あり、正の比較可能な基準値がある場合のみ表示します。"
    ]
  };
}
