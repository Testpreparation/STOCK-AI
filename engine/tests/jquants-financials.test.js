import test from "node:test";
import assert from "node:assert/strict";
import { fetchJQuantsAnnualFinancials, JQuantsFinancialError } from "../data/providers/jquants-financials.js";

test("maps annual Japanese financial summaries and excludes cumulative quarter rows",async()=>{
 let requestUrl="";
 const rows=[
  {Code:"72030",CurPerType:"FY",CurFYEn:"2025-03-31",DiscDate:"2025-05-10",DiscTime:"15:00",Sales:"1000",OP:"100",NP:"60",EPS:"60",DEPS:"58",TA:"2000",Eq:"800",CFO:"90",CashEq:"300"},
  {Code:"72030",CurPerType:"3Q",CurFYEn:"2026-03-31",DiscDate:"2026-02-10",Sales:"900",OP:"90",NP:"50"},
  {Code:"72030",CurPerType:"FY",CurFYEn:"2026-03-31",DiscDate:"2026-05-10",DiscTime:"15:00",Sales:"1200",OP:"150",NP:"90",EPS:"90",TA:"2400",Eq:"1000",CFO:"130",CashEq:"400"}
 ];
 const result=await fetchJQuantsAnnualFinancials({
  apiKey:"test-key",code:"7203",
  fetchImpl:async(url,options)=>{requestUrl=String(url);assert.equal(options.headers["x-api-key"],"test-key");return {ok:true,json:async()=>({data:rows})};}
 });
 assert.match(requestUrl,/\/v2\/fins\/summary\?code=7203/);
 assert.equal(result.metrics.revenue.length,2);
 assert.equal(result.metrics.revenue.at(-1).value,1200);
 assert.equal(result.metrics.dilutedEps.at(-1).value,90);
 assert.equal(result.metrics.totalLiabilities.at(-1).value,1400);
 assert.equal(result.metrics.operatingCashFlow.at(-1).value,130);
 assert.equal(result.delayPolicy,"FREE_PLAN_12_WEEK_DELAY");
});

test("uses latest disclosure for a fiscal year and follows pagination",async()=>{
 let calls=0;
 const result=await fetchJQuantsAnnualFinancials({
  apiKey:"key",code:"6758",
  fetchImpl:async(url)=>{
   calls++;
   if(calls===1)return {ok:true,json:async()=>({data:[{CurPerType:"FY",CurFYEn:"2025-03-31",DiscDate:"2025-05-01",Sales:"100"}],pagination_key:"next"})};
   return {ok:true,json:async()=>({data:[{CurPerType:"FY",CurFYEn:"2025-03-31",DiscDate:"2025-05-03",Sales:"110"}]})};
  }
 });
 assert.equal(calls,2);
 assert.equal(result.metrics.revenue.length,1);
 assert.equal(result.metrics.revenue[0].value,110);
});

test("validates API key and code",async()=>{
 await assert.rejects(()=>fetchJQuantsAnnualFinancials({code:"7203"}),error=>error instanceof JQuantsFinancialError&&error.code==="MISSING_API_KEY");
 await assert.rejects(()=>fetchJQuantsAnnualFinancials({apiKey:"key",code:"ABC"}),error=>error.code==="INVALID_CODE");
 const letterCode=await fetchJQuantsAnnualFinancials({apiKey:"key",code:"282A",fetchImpl:async()=>({ok:true,json:async()=>({data:[]})})});
 assert.equal(letterCode.symbol,"282A");
});
