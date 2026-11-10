import test from "node:test";
import assert from "node:assert/strict";
import { analyzePortfolio } from "../portfolio/analyzer.js";

const portfolio={holdings:[
 {symbol:"7203",market:"JP",currency:"JPY",quantity:10,averageCost:2500,currentPrice:2600,marketValue:26000,unrealizedPnl:1000,name:"トヨタ"},
 {symbol:"AAPL",market:"US",currency:"USD",quantity:2,averageCost:200,currentPrice:190,marketValue:380,unrealizedPnl:-20,name:"Apple"}
]};
const datasets={
 "JP:7203":{source:"jquants",priceAdjustment:"SPLIT_ADJUSTED",delayPolicy:"FREE_PLAN_12_WEEK_DELAY",data:[
  {date:"2026-11-05",close:2700},{date:"2026-11-06",close:2750}
 ]},
 "US:AAPL":{source:"alpha-vantage",priceAdjustment:"RAW_UNADJUSTED",data:[
  {date:"2026-11-05",close:195},{date:"2026-11-06",close:200}
 ]}
};

test("revalues holdings from latest close and computes daily and unrealized P/L",()=>{
 const result=analyzePortfolio(portfolio,datasets,{asOf:"2026-11-07T00:00:00Z"});
 const toyota=result.holdings.find(item=>item.symbol==="7203");
 assert.equal(toyota.currentPrice,2750);
 assert.equal(toyota.marketValue,27500);
 assert.equal(toyota.unrealizedPnl,2500);
 assert.equal(toyota.dailyChange,50);
 assert.equal(result.totalsByCurrency.JPY.marketValue,27500);
 assert.equal(result.totalsByCurrency.JPY.returnPercent,10);
});

test("keeps JPY and USD totals separate and warns for raw unadjusted data",()=>{
 const result=analyzePortfolio(portfolio,datasets,{asOf:"2026-11-07T00:00:00Z"});
 assert.equal(result.totalsByCurrency.USD.marketValue,400);
 assert.equal(result.totalsByCurrency.JPY.marketValue,27500);
 assert.equal(result.summary.unadjustedCount,1);
 assert.ok(result.warnings.some(message=>message.includes("未調整株価")));
});

test("does not present old quotes as fresh and falls back to imported CSV price",()=>{
 const result=analyzePortfolio(portfolio,{"JP:7203":{data:[{date:"2026-08-01",close:2800}]}},{asOf:"2026-11-07T00:00:00Z"});
 const toyota=result.holdings.find(item=>item.symbol==="7203");
 assert.equal(toyota.currentPrice,2800);
 assert.equal(toyota.quoteStale,true);
 assert.equal(result.summary.staleCount,2);
});

test("uses CSV price when no public dataset is available",()=>{
 const result=analyzePortfolio(portfolio,{}, {asOf:"2026-11-07T00:00:00Z"});
 assert.equal(result.holdings[0].currentPrice,2600);
 assert.equal(result.summary.missingCount,2);
 assert.equal(result.totalsByCurrency.USD.marketValue,380);
});
