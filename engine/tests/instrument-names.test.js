import test from "node:test";
import assert from "node:assert/strict";
import { getInstrumentName } from "../data/instrument-names.js";
test("returns Japanese listed company and ETF names",()=>{
  assert.equal(getInstrumentName("7203","JP"),"トヨタ自動車");
  assert.equal(getInstrumentName("282A","JP"),"グローバルX 半導体・トップ10-日本株式 ETF");
});
test("returns US company names and empty for unknown symbols",()=>{
  assert.match(getInstrumentName("AAPL","US"),/Apple/);
  assert.equal(getInstrumentName("UNKNOWN","US"),"");
});
