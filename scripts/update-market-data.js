import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePriceRows } from "../engine/data/normalizer.js";
import { validatePriceDataset } from "../engine/data/validator.js";
import { fetchJQuantsDaily } from "../engine/data/providers/jquants.js";
import { fetchAlphaVantageDaily } from "../engine/data/providers/alpha-vantage.js";
import { fetchSecCompanyFacts } from "../engine/data/providers/sec-edgar.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "config/market-universe.json");
const outputRoot = path.join(root, "public-data");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const iso = date => date.toISOString().slice(0,10);
const today = new Date();
const delayedTo = new Date(today); delayedTo.setUTCDate(delayedTo.getUTCDate() - 84);
const fromDate = new Date(today); fromDate.setUTCDate(fromDate.getUTCDate() - (365 * 2 + 84));
const range = { from: iso(fromDate), to: iso(delayedTo) };
const summary = { generatedAt: new Date().toISOString(), providers: {}, instruments: [], warnings: [] };

const config = JSON.parse(await readFile(configPath, "utf8"));
await mkdir(path.join(outputRoot, "market"), { recursive: true });
await mkdir(path.join(outputRoot, "fundamentals"), { recursive: true });

async function saveJson(relativePath, value) {
  const fullPath = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, JSON.stringify(value, null, 2) + "\n", "utf8");
}
function safeName(value) { return String(value).replace(/[^A-Z0-9._-]/gi, "_"); }

async function storePrice({ market, symbol, raw, source, adjustment, delayPolicy }) {
  const dataset = normalizePriceRows(raw.rows, {
    symbol, market, currency: market === "JP" ? "JPY" : "USD",
    source, fetchedAt: raw.fetchedAt
  });
  const validation = validatePriceDataset(dataset, { asOf: raw.fetchedAt, maxAgeDays: 9999 });
  const file = `market/${market.toLowerCase()}/${safeName(symbol)}.json`;
  const record = {
    ...dataset,
    fetchedAt: raw.fetchedAt,
    priceAdjustment: adjustment,
    delayPolicy: delayPolicy ?? null,
    validation: {
      valid: validation.valid,
      acceptedRows: validation.quality.acceptedRows,
      rejectedRows: validation.quality.rejectedRows,
      warnings: validation.warnings
    }
  };
  if (!validation.usableForAnalysis || !validation.valid) throw new Error(`Dataset validation failed for ${market} ${symbol}`);
  await saveJson(file, record);
  summary.instruments.push({
    market, symbol, file: `/public-data/${file}`, provider: source,
    rows: dataset.data.length, latestDate: validation.quality.latestDate,
    fetchedAt: raw.fetchedAt, priceAdjustment: adjustment,
    delayPolicy: delayPolicy ?? null, status: "updated"
  });
}

if (process.env.JQUANTS_API_KEY) {
  for (const code of config.jp ?? []) {
    try {
      const raw = await fetchJQuantsDaily({ apiKey: process.env.JQUANTS_API_KEY, code, ...range });
      await storePrice({ market:"JP", symbol:code, raw, source:"jquants", adjustment:"SPLIT_ADJUSTED", delayPolicy:raw.delayPolicy });
    } catch (error) {
      summary.warnings.push({ market:"JP", symbol:code, code:error.code ?? "FETCH_FAILED", message:error.message });
    }
    await wait(12000);
  }
  summary.providers.jquants = "configured";
} else {
  summary.providers.jquants = "missing_secret";
  summary.warnings.push({ provider:"jquants", code:"MISSING_SECRET", message:"Set repository secret JQUANTS_API_KEY to enable Japan data." });
}

if (process.env.ALPHA_VANTAGE_API_KEY) {
  for (const symbol of config.us ?? []) {
    try {
      const raw = await fetchAlphaVantageDaily({ apiKey:process.env.ALPHA_VANTAGE_API_KEY, symbol });
      await storePrice({ market:"US", symbol, raw, source:"alpha-vantage", adjustment:raw.priceAdjustment });
    } catch (error) {
      summary.warnings.push({ market:"US", symbol, code:error.code ?? "FETCH_FAILED", message:error.message });
    }
    await wait(15000);
  }
  summary.providers.alphaVantage = "configured";
} else {
  summary.providers.alphaVantage = "missing_secret";
  summary.warnings.push({ provider:"alpha-vantage", code:"MISSING_SECRET", message:"Set repository secret ALPHA_VANTAGE_API_KEY to enable US prices." });
}

if (process.env.SEC_USER_AGENT) {
  for (const [symbol,cik] of Object.entries(config.secCikBySymbol ?? {})) {
    try {
      const facts = await fetchSecCompanyFacts({ cik, userAgent:process.env.SEC_USER_AGENT });
      await saveJson(`fundamentals/us/${safeName(symbol)}.json`, facts);
      summary.instruments.push({ market:"US", symbol, provider:"sec-edgar-companyfacts", fundamentalsFile:`/public-data/fundamentals/us/${safeName(symbol)}.json`, status:"updated" });
    } catch (error) {
      summary.warnings.push({ market:"US", symbol, provider:"sec-edgar", code:error.code ?? "FETCH_FAILED", message:error.message });
    }
    await wait(1200);
  }
  summary.providers.secEdgar = "configured";
} else {
  summary.providers.secEdgar = "missing_secret";
  summary.warnings.push({ provider:"sec-edgar", code:"MISSING_SECRET", message:"Set repository secret SEC_USER_AGENT to enable SEC fundamentals." });
}

await saveJson("manifest.json", summary);
console.log(JSON.stringify(summary, null, 2));
if (!summary.instruments.length) console.log("No provider data was updated. Configure repository secrets and review config/market-universe.json.");
