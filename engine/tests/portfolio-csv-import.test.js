import test from "node:test";
import assert from "node:assert/strict";
import { importPortfolioCsv, parseCsvRows } from "../portfolio/csv-import.js";

test("parses quoted commas, escaped quotes and CRLF", () => {
  const rows = parseCsvRows('銘柄コード,銘柄名,数量\r\n7203,"トヨタ,自動車",10\r\n');
  assert.deepEqual(rows[1], ["7203", "トヨタ,自動車", "10"]);
});

test("imports Japanese holdings and calculates market value and unrealized P/L", () => {
  const csv = [
    "楽天証券 保有商品一覧",
    "銘柄コード,銘柄名,保有数量,平均取得価額,現在値,通貨",
    '7203,"トヨタ自動車",10,2500,2800,JPY',
    "6758,ソニーグループ,5,3100,3200,JPY"
  ].join("\n");
  const result = importPortfolioCsv(csv);
  assert.equal(result.holdings.length, 2);
  assert.equal(result.holdings[0].market, "JP");
  assert.equal(result.holdings[0].marketValue, 28000);
  assert.equal(result.holdings[0].unrealizedPnl, 3000);
  assert.equal(result.summary.marketValue, 44000);
  assert.equal(result.summary.unrealizedPnl, 3500);
});

test("imports USD symbols and parenthesized negative P/L", () => {
  const csv = "Symbol,Name,Quantity,Average Cost,Current Price,Unrealized PnL,Currency\nAAPL,Apple,2,200,190,(20),USD";
  const result = importPortfolioCsv(csv);
  assert.equal(result.holdings[0].market, "US");
  assert.equal(result.holdings[0].unrealizedPnl, -20);
});

test("recognizes cash and total asset summary columns", () => {
  const csv = "銘柄コード,保有数量,平均取得単価,現在値,買付可能額,資産合計\n7203,1,2000,2500,50000,100000";
  const result = importPortfolioCsv(csv);
  assert.equal(result.summary.buyingPower, 50000);
  assert.equal(result.summary.totalAssets, 100000);
});

test("rejects CSV without recognizable headers", () => {
  assert.throws(() => importPortfolioCsv("hello,world\na,b"), /見出し/);
});

test("keeps JPY and USD values separate and does not invent total assets", () => {
  const csv = "銘柄コード,保有数量（株）,平均取得価額（円）,現在値,通貨\n7203,1,2000,2500,JPY\nAAPL,1,200,190,USD";
  const result = importPortfolioCsv(csv);
  assert.equal(result.holdings.length, 2);
  assert.equal(result.summary.totalsByCurrency.JPY.marketValue, 2500);
  assert.equal(result.summary.totalsByCurrency.USD.marketValue, 190);
  assert.equal(result.summary.totalAssets, null);
});
