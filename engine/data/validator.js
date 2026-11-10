const DAY_MS = 86400000;

export function validatePriceDataset(dataset, options = {}) {
  const errors = [], warnings = [], accepted = [], rejected = [];
  if (!dataset || dataset.schemaVersion !== 1) errors.push("unsupported_schema");
  if (!dataset || !Array.isArray(dataset.data)) errors.push("data_not_array");
  if (errors.length) return { valid: false, usableForAnalysis: false, safeForPurchaseDecision: false, errors, warnings, accepted, rejected };

  const seen = new Set();
  for (const row of dataset.data) {
    const rowErrors = [];
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(row.date ?? "") ? new Date((row.date ?? "") + "T00:00:00Z") : null;
    const dateValid = parsedDate !== null && Number.isFinite(parsedDate.getTime()) &&
      parsedDate.toISOString().slice(0, 10) === row.date;
    if (!dateValid) rowErrors.push("invalid_date");
    if (seen.has(row.date)) rowErrors.push("duplicate_date");
    if (row.date) seen.add(row.date);
    for (const key of ["open", "high", "low", "close", "volume"]) {
      if (!Number.isFinite(row[key])) rowErrors.push("invalid_" + key);
    }
    if (["open", "high", "low", "close"].every(k => Number.isFinite(row[k]))) {
      if ([row.open, row.high, row.low, row.close].some(v => v <= 0)) rowErrors.push("non_positive_price");
      if (row.high < Math.max(row.open, row.close, row.low)) rowErrors.push("high_below_price");
      if (row.low > Math.min(row.open, row.close, row.high)) rowErrors.push("low_above_price");
    }
    if (Number.isFinite(row.volume) && row.volume < 0) rowErrors.push("negative_volume");
    if (rowErrors.length) rejected.push({ row, errors: [...new Set(rowErrors)] });
    else accepted.push(row);
  }
  accepted.sort((a, b) => a.date.localeCompare(b.date));
  const gaps = [];
  for (let i = 1; i < accepted.length; i++) {
    const days = (Date.parse(accepted[i].date) - Date.parse(accepted[i - 1].date)) / DAY_MS;
    if (days > 7) gaps.push({ from: accepted[i - 1].date, to: accepted[i].date, calendarDays: days });
  }
  if (gaps.length) warnings.push({ code: "large_date_gaps", gaps });
  if (rejected.length) warnings.push({ code: "rows_rejected", count: rejected.length });

  const latestDate = accepted.at(-1)?.date ?? null;
  const asOf = options.asOf ? new Date(options.asOf) : new Date();
  const ageDays = latestDate && Number.isFinite(asOf.getTime())
    ? Math.max(0, Math.floor((asOf.getTime() - Date.parse(latestDate + "T00:00:00Z")) / DAY_MS)) : null;
  const maxAgeDays = Number.isInteger(options.maxAgeDays) ? options.maxAgeDays : 5;
  const freshness = ageDays === null ? "UNAVAILABLE" : ageDays <= maxAgeDays ? "FRESH" : "STALE";
  return {
    valid: accepted.length > 0 && rejected.length === 0,
    usableForAnalysis: accepted.length > 0,
    safeForPurchaseDecision: accepted.length > 0 && rejected.length === 0 && freshness === "FRESH",
    errors, warnings, accepted, rejected,
    quality: { totalRows: dataset.data.length, acceptedRows: accepted.length, rejectedRows: rejected.length, latestDate, ageDays, freshness }
  };
}
