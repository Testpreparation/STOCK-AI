const COMPANY_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK";

export class SecEdgarError extends Error {
  constructor(message, code = "SEC_ERROR", status = null) {
    super(message);
    this.name = "SecEdgarError";
    this.code = code;
    this.status = status;
  }
}

const METRICS = {
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  dilutedEps: ["EarningsPerShareDiluted"],
  totalAssets: ["Assets"],
  totalLiabilities: ["Liabilities"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
  capitalExpenditures: ["PaymentsToAcquirePropertyPlantAndEquipment"],
  grossProfit: ["GrossProfit"],
  cashAndEquivalents: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  currentAssets: ["AssetsCurrent"],
  currentLiabilities: ["LiabilitiesCurrent"],
  stockholdersEquity: ["StockholdersEquity"],
  longTermDebt: ["LongTermDebtNoncurrent", "LongTermDebt"]
};

const INSTANT_METRICS = new Set(["totalAssets", "totalLiabilities", "cashAndEquivalents", "currentAssets", "currentLiabilities", "stockholdersEquity", "longTermDebt"]);

function latestAnnualFact(facts, tags, { instant = false } = {}) {
  for (const tag of tags) {
    const concept = facts?.["us-gaap"]?.[tag];
    if (!concept?.units) continue;
    const units = Object.entries(concept.units);
    for (const [unit, entries] of units) {
      const annual = entries
        .filter(item => {
          if (item.form !== "10-K" || !item.fy || !item.end || !Number.isFinite(Number(item.val))) return false;
          if (instant) return !item.start;
          if (!item.start) return false;
          const durationDays = (Date.parse(item.end + "T00:00:00Z") - Date.parse(item.start + "T00:00:00Z")) / 86400000 + 1;
          return durationDays >= 300 && durationDays <= 400;
        })
        .sort((a, b) => String(b.end).localeCompare(String(a.end)) || String(b.filed).localeCompare(String(a.filed)));
      if (annual.length) {
        const byPeriod = new Map();
        for (const item of annual) {
          const key = item.end;
          if (!byPeriod.has(key)) byPeriod.set(key, {
            fiscalYearEnd: item.end,
            fiscalYear: item.fy,
            filedAt: item.filed,
            form: item.form,
            value: Number(item.val),
            unit,
            sourceTag: tag
          });
        }
        return [...byPeriod.values()].sort((a, b) => a.fiscalYearEnd.localeCompare(b.fiscalYearEnd));
      }
    }
  }
  return [];
}

/**
 * Fetch SEC Company Facts. Use only in Node.js automation, not browser code.
 * SEC requires an identifying User-Agent and fair-access request behavior.
 */
export async function fetchSecCompanyFacts({ cik, userAgent, fetchImpl = globalThis.fetch } = {}) {
  const normalizedCik = String(cik ?? "").replace(/^0+/, "");
  if (!/^\d{1,10}$/.test(normalizedCik)) throw new SecEdgarError("A valid SEC CIK is required", "INVALID_CIK");
  if (!userAgent || !/\S+\s+\S+/.test(userAgent)) {
    throw new SecEdgarError("SEC-identifying User-Agent with contact information is required", "MISSING_USER_AGENT");
  }
  if (typeof fetchImpl !== "function") throw new SecEdgarError("Fetch implementation is unavailable", "FETCH_UNAVAILABLE");

  const paddedCik = normalizedCik.padStart(10, "0");
  const url = COMPANY_FACTS_URL + paddedCik + ".json";
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { "User-Agent": userAgent, "Accept": "application/json" }
  });
  if (!response.ok) {
    const code = response.status === 429 ? "RATE_LIMITED" : response.status === 403 ? "ACCESS_DENIED" : "HTTP_ERROR";
    throw new SecEdgarError(`SEC Company Facts request failed (HTTP ${response.status})`, code, response.status);
  }
  const payload = await response.json();
  if (!payload?.facts || typeof payload.facts !== "object") {
    throw new SecEdgarError("Unexpected SEC Company Facts response", "INVALID_RESPONSE");
  }

  const metrics = {};
  for (const [name, tags] of Object.entries(METRICS)) metrics[name] = latestAnnualFact(payload.facts, tags, { instant: INSTANT_METRICS.has(name) });
  return {
    provider: "sec-edgar-companyfacts",
    cik: paddedCik,
    entityName: payload.entityName ?? null,
    fetchedAt: new Date().toISOString(),
    sourceUrl: url,
    metrics,
    availableMetrics: Object.entries(metrics).filter(([, values]) => values.length).map(([name]) => name),
    limitations: [
      "SEC Company Facts contains reported facts, not a complete normalized financial statement.",
      "Metric tags and units can differ between issuers; missing values must remain null.",
      "Annual 10-K facts are historical and may be amended or restated in later filings."
    ]
  };
}
