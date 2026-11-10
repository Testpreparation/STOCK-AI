const pick = (row, keys) => {
  for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null && row[key] !== "") return row[key];
  return undefined;
};
const toNumber = value => {
  if (typeof value === "string") value = value.replaceAll(",", "").trim();
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const toIsoDate = value => {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(raw + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
};

export function normalizePriceRows(rows, metadata = {}) {
  if (!Array.isArray(rows)) throw new TypeError("rows must be an array");
  return {
    schemaVersion: 1,
    symbol: String(metadata.symbol ?? "").trim().toUpperCase(),
    market: ["JP", "US"].includes(metadata.market) ? metadata.market : "UNKNOWN",
    currency: metadata.currency ?? null,
    source: metadata.source ?? "unknown",
    fetchedAt: metadata.fetchedAt ?? null,
    data: rows.map((row, sourceIndex) => ({
      date: toIsoDate(pick(row, ["date", "Date", "timestamp", "time"])),
      open: toNumber(pick(row, ["adjusted_open", "AdjO", "open", "Open", "O", "o"])),
      high: toNumber(pick(row, ["adjusted_high", "AdjH", "high", "High", "H", "h"])),
      low: toNumber(pick(row, ["adjusted_low", "AdjL", "low", "Low", "L", "l"])),
      close: toNumber(pick(row, ["adjusted_close", "AdjC", "adjClose", "close", "Close", "C", "c"])),
      volume: toNumber(pick(row, ["adjusted_volume", "AdjVo", "volume", "Volume", "Vo", "v"])),
      sourceIndex
    }))
  };
}
