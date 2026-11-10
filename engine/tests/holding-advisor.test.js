import test from "node:test";
import assert from "node:assert/strict";
import { assessHolding, assessPortfolioHoldings } from "../portfolio/holding-advisor.js";

function makeDataset({symbol="7203",market="JP",adjustment="SPLIT_ADJUSTED",latestDate="2026-11-09"}={}){
 const end=Date.parse(latestDate+"T00:00:00Z");
 const data=Array.from({length:100},(_,i)=>{
  const close=100+i*0.2+Math.sin(i/4)*2;
  const date=new Date(end-(99-i)*86400000).toISOString().slice(0,10);
  return {date,open:close-0.5,high:close+1,low:close-1,close,volume:100000+i};
 });
 return {schemaVersion:1,symbol,market,currency:market==="JP"?"JPY":"USD",source:"test",priceAdjustment:adjustment,data};
}
const holding={symbol:"7203",market:"JP",currency:"JPY",quantity:10,averageCost:100};

test("returns a non-actionable review when market data is unavailable",()=>{
 const result=assessHolding(holding,null,{asOf:"2026-11-10"});
 assert.equal(result.status,"DATA_UNAVAILABLE");
 assert.equal(result.actionable,false);
});

test("blocks stale price data and reports the data date",()=>{
 const dataset=makeDataset({latestDate:"2026-08-18"});
 const result=assessHolding(holding,dataset,{asOf:"2026-11-10"});
 assert.equal(result.status,"WAIT_DATA");
 assert.equal(result.actionable,false);
 assert.equal(result.latestDate,"2026-08-18");
});

test("blocks raw unadjusted prices even when recent",()=>{
 const dataset=makeDataset({adjustment:"RAW_UNADJUSTED"});
 const result=assessHolding({...holding,symbol:"AAPL",market:"US",currency:"USD"},dataset,{asOf:"2026-11-10"});
 assert.equal(result.status,"WAIT_DATA");
 assert.equal(result.priceAdjustment,"RAW_UNADJUSTED");
 assert.equal(result.actionable,false);
});

test("shows score coverage, technical reference levels and forecast without inventing buy signals",()=>{
 const dataset=makeDataset();
 const result=assessHolding(holding,dataset,{asOf:"2026-11-10"});
 assert.equal(result.status,"INSUFFICIENT_DATA");
 assert.equal(result.coveragePercent,15);
 assert.equal(result.actionable,false);
 assert.ok(result.referenceLevels.some(item=>item.key==="sma20"));
 assert.ok(result.referenceLevels.some(item=>item.key==="sma50"));
 assert.ok(result.forecast);
});

test("normalizes .T symbols when matching imported Japanese holdings",()=>{
 const portfolio={holdings:[{...holding,symbol:"7203.T"}]};
 const results=assessPortfolioHoldings(portfolio,{"JP:7203":makeDataset()},{asOf:"2026-11-10"});
 assert.equal(results[0].symbol,"7203.T");
 assert.equal(results[0].latestDate,"2026-11-09");
});

test("blocks purchase-oriented labels when adjustment metadata is unknown",()=>{
 const dataset=makeDataset({adjustment:undefined});
 delete dataset.priceAdjustment;
 const result=assessHolding(holding,dataset,{asOf:"2026-11-10"});
 assert.equal(result.status,"WAIT_DATA");
 assert.equal(result.actionable,false);
 assert.ok(result.reasons.some(reason=>reason.includes("価格調整方式")));
});

test("uses supplied annual fundamentals in the holding review",()=>{
 const dataset=makeDataset();
 const financials={provider:"jquants-fins-summary",metrics:{
  revenue:[{fiscalYearEnd:"2025-03-31",filedAt:"2025-05-10",value:1000,unit:"JPY"},{fiscalYearEnd:"2026-03-31",filedAt:"2026-05-10",value:1200,unit:"JPY"}],
  operatingIncome:[{fiscalYearEnd:"2025-03-31",filedAt:"2025-05-10",value:100,unit:"JPY"},{fiscalYearEnd:"2026-03-31",filedAt:"2026-05-10",value:150,unit:"JPY"}],
  netIncome:[{fiscalYearEnd:"2025-03-31",filedAt:"2025-05-10",value:60,unit:"JPY"},{fiscalYearEnd:"2026-03-31",filedAt:"2026-05-10",value:90,unit:"JPY"}],
  dilutedEps:[{fiscalYearEnd:"2025-03-31",filedAt:"2025-05-10",value:60,unit:"JPY/share"},{fiscalYearEnd:"2026-03-31",filedAt:"2026-05-10",value:90,unit:"JPY/share"}],
  totalAssets:[{fiscalYearEnd:"2026-03-31",filedAt:"2026-05-10",value:2400,unit:"JPY"}],
  stockholdersEquity:[{fiscalYearEnd:"2026-03-31",filedAt:"2026-05-10",value:1000,unit:"JPY"}],
  totalLiabilities:[{fiscalYearEnd:"2026-03-31",filedAt:"2026-05-10",value:1400,unit:"JPY"}],
  operatingCashFlow:[{fiscalYearEnd:"2026-03-31",filedAt:"2026-05-10",value:130,unit:"JPY"}]
 }};
 const result=assessHolding(holding,dataset,{asOf:"2026-11-10",financials:{"JP:7203":financials}});
 assert.equal(result.financial.latestPeriod,"2026-03-31");
 assert.ok(Math.abs(result.financial.metrics.revenue.yearOverYearGrowth.value-20)<1e-9);
 assert.ok(Math.abs(result.financial.derived.liabilitiesToAssetsPercent-58.333333333333336)<1e-9);
});
