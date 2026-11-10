const HEADER_ALIASES = {
  symbol: ["銘柄コード","コード","銘柄コード（ティッカー）","ティッカー","symbol","ticker","code","銘柄"],
  name: ["銘柄名","銘柄名称","名称","商品名","name","security name"],
  quantity: ["保有数量","保有株数","数量","残高数量","株数","保有口数","quantity","shares"],
  averageCost: ["平均取得価額","平均取得単価","取得単価","平均単価","取得価格","average cost","avg cost"],
  currentPrice: ["現在値","時価","株価","現在価格","current price","price"],
  marketValue: ["時価評価額","評価額","時価金額","評価金額","時価評価","market value"],
  unrealizedPnl: ["評価損益","評価損益額","含み損益","損益","評価損益（円）","unrealized pnl"],
  currency: ["通貨","通貨コード","currency"],
  market: ["市場","取引市場","market"],
  cash: ["預り金","買付可能額","買付余力","現金残高","預り金合計","cash","buying power"],
  totalAssets: ["資産合計","総資産","資産評価額","資産総額","total assets"],
  buyingPower: ["買付可能額","買付余力","買付余力額","購入可能額","buying power"]
};

const normalizeHeader = value => String(value ?? "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s　＿_()（）［］\[\]・]/g, "").replace(/(円|株|口)+$/g, "");
const aliasLookup = new Map();
for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
  for (const alias of aliases) aliasLookup.set(normalizeHeader(alias), field);
}

function parseNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "" || String(value).trim() === "—" || String(value).trim() === "-") return null;
  let text = String(value).trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[，,\s　]/g, "").replace(/[￥¥円$]/g, "").replace(/％/g, "%");
  const negative = /^\(.*\)$/.test(text);
  text = text.replace(/^\(|\)$/g, "").replace(/%$/, "");
  const number = Number(text);
  return Number.isFinite(number) ? (negative ? -Math.abs(number) : number) : null;
}

export function parseCsvRows(text) {
  if (typeof text !== "string") throw new TypeError("CSV text must be a string");
  const source = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
  if (quoted) throw new Error("CSVの引用符が閉じられていません");
  return rows;
}

function findHeader(rows) {
  let best = null;
  for (let index = 0; index < Math.min(rows.length, 20); index++) {
    const fields = rows[index].map(value => aliasLookup.get(normalizeHeader(value))).filter(Boolean);
    const unique = new Set(fields);
    const score = unique.size;
    if (score >= 2 && (!best || score > best.score)) best = { index, fields: rows[index].map(value => aliasLookup.get(normalizeHeader(value)) ?? null), score };
  }
  return best;
}

function inferSymbolAndMarket(rawSymbol, rawMarket, currency) {
  const symbol = String(rawSymbol ?? "").trim().replace(/^'/, "");
  const marketText = String(rawMarket ?? "").toUpperCase();
  const jp = /東証|日本|ＪＰ|JPX|JAPAN/.test(marketText) || /^\d{4,5}(?:\.T|\.JP)?$/i.test(symbol);
  const market = jp ? "JP" : (marketText ? "US" : (currency === "JPY" ? "JP" : "US"));
  return { symbol, market };
}

function firstNumber(row, fields, field) {
  const index = fields.indexOf(field);
  return index >= 0 ? parseNumber(row[index]) : null;
}

export function importPortfolioCsv(text, options = {}) {
  const rows = parseCsvRows(text);
  if (!rows.length) throw new Error("CSVにデータがありません");
  const header = findHeader(rows);
  if (!header) throw new Error("銘柄コード・数量・取得単価などの見出しを認識できませんでした");
  const dataRows = rows.slice(header.index + 1);
  const holdings = [];
  const summary = { cash: null, buyingPower: null, totalAssets: null };
  const warnings = [];
  for (const row of dataRows) {
    const padded = header.fields.map((_, index) => row[index] ?? "");
    for (const field of ["cash", "buyingPower", "totalAssets"]) {
      const value = firstNumber(padded, header.fields, field);
      if (value !== null) summary[field] = value;
    }
    const symbolIndex = header.fields.findIndex(field => field === "symbol");
    const quantity = firstNumber(padded, header.fields, "quantity");
    const averageCost = firstNumber(padded, header.fields, "averageCost");
    const rawSymbol = symbolIndex >= 0 ? padded[symbolIndex] : "";
    const symbol = String(rawSymbol).trim();
    if (!symbol || quantity === null || quantity <= 0) continue;
    const currencyIndex = header.fields.indexOf("currency");
    const marketIndex = header.fields.indexOf("market");
    const currencyRaw = currencyIndex >= 0 ? String(padded[currencyIndex]).trim().toUpperCase() : "";
    const currency = /USD|米ドル|ドル/.test(currencyRaw) ? "USD" : (/JPY|円|日本円/.test(currencyRaw) ? "JPY" : (/^\d{4,5}(?:\.T|\.JP)?$/i.test(symbol) ? "JPY" : "USD"));
    const { market } = inferSymbolAndMarket(symbol, marketIndex >= 0 ? padded[marketIndex] : "", currency);
    const nameIndex = header.fields.indexOf("name");
    const currentPrice = firstNumber(padded, header.fields, "currentPrice");
    const suppliedValue = firstNumber(padded, header.fields, "marketValue");
    const marketValue = suppliedValue ?? (currentPrice !== null ? currentPrice * quantity : null);
    const suppliedPnl = firstNumber(padded, header.fields, "unrealizedPnl");
    const unrealizedPnl = suppliedPnl ?? (currentPrice !== null && averageCost !== null ? (currentPrice - averageCost) * quantity : null);
    holdings.push({
      id: market + ":" + symbol,
      symbol, market, currency,
      name: nameIndex >= 0 ? String(padded[nameIndex]).trim() : "",
      quantity, averageCost, currentPrice, marketValue, unrealizedPnl
    });
  }
  if (!holdings.length) warnings.push("保有銘柄行を検出できませんでした。楽天証券のCSV形式や見出しを確認してください。");
  const unique = new Map();
  for (const holding of holdings) {
    const prior = unique.get(holding.id);
    if (prior) warnings.push(holding.symbol + " が複数行にあります。行を分けて保持しています。");
    unique.set(holding.id + ":" + unique.size, holding);
  }
  const normalizedHoldings = [...unique.values()];
  const totalsByCurrency = normalizedHoldings.reduce((totals, item) => {
    const bucket = totals[item.currency] ??= { marketValue: 0, unrealizedPnl: 0 };
    bucket.marketValue += item.marketValue ?? 0;
    bucket.unrealizedPnl += item.unrealizedPnl ?? 0;
    return totals;
  }, {});
  const calculatedMarketValue = totalsByCurrency.JPY?.marketValue ?? 0;
  const calculatedPnl = totalsByCurrency.JPY?.unrealizedPnl ?? 0;
  return {
    schemaVersion: 1,
    importedAt: options.importedAt ?? new Date().toISOString(),
    source: options.source ?? "楽天証券CSV（自動見出し判定）",
    holdings: normalizedHoldings,
    summary: {
      ...summary,
      holdingsCount: normalizedHoldings.length,
      marketValue: calculatedMarketValue,
      unrealizedPnl: calculatedPnl,
      totalsByCurrency,
      totalAssets: summary.totalAssets
    },
    warnings,
    detectedHeaderRow: header.index + 1
  };
}
