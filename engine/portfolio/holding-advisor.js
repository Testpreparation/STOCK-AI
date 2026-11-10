import { analyzeInstrument } from "../pipeline.js";

const finite=value=>Number.isFinite(value);
const round=(value,digits=2)=>finite(value)?Number(value.toFixed(digits)):null;

/**
 * Converts an owned position into a conservative, explainable review.
 * It never issues an order or treats a delayed/unadjusted quote as actionable.
 */
export function assessHolding(holding,dataset,options={}) {
  if(!holding||!holding.symbol) throw new TypeError("holding.symbol is required");
  if(!dataset||!Array.isArray(dataset.data)||!dataset.data.length){
    return {symbol:holding.symbol,market:holding.market,status:"DATA_UNAVAILABLE",label:"公開データ待ち",actionable:false,score:null,coveragePercent:0,latestPrice:null,latestDate:null,referenceLevels:[],forecast:null,reasons:["公開株価データがありません。CSVの価格は参考値としてのみ扱います。"]};
  }
  const asOf=options.asOf??new Date().toISOString().slice(0,10);
  const analysis=analyzeInstrument({priceDataset:dataset,asOf,maxPriceAgeDays:options.maxPriceAgeDays??5,maxForecastAgeDays:options.maxForecastAgeDays??10});
  const latest=analysis.technical.latest;
  const recommendation=analysis.score.recommendation;
  const guards=[...analysis.score.guardrails];
  const reasons=[];
  if(!analysis.dataQuality.safeForPurchaseDecision) reasons.push("株価データが古い、または品質条件を満たしていません。");
  if(dataset.priceAdjustment==="RAW_UNADJUSTED") reasons.push("未調整株価のため、分割・配当を考慮した買い増し判断は停止しています。");
  if(analysis.score.coveragePercent<80) reasons.push("評価データ充足率が80%未満です。財務・バリュエーション等が不足しています。");
  if(guards.length) reasons.push(...guards);
  const referenceLevels=[];
  if(finite(latest.sma20)) referenceLevels.push({key:"sma20",label:"20日移動平均",price:round(latest.sma20),distancePercent:finite(latest.close)&&latest.close>0?round((latest.sma20/latest.close-1)*100):null});
  if(finite(latest.sma50)) referenceLevels.push({key:"sma50",label:"50日移動平均",price:round(latest.sma50),distancePercent:finite(latest.close)&&latest.close>0?round((latest.sma50/latest.close-1)*100):null});
  const shortForecast=analysis.forecast.forecasts?.find(item=>item.key==="short")??null;
  const allowed=analysis.dataQuality.safeForPurchaseDecision&&analysis.score.coveragePercent>=80&&!guards.length;
  let status="WAIT";
  let label="様子見";
  if(!analysis.dataQuality.safeForPurchaseDecision||dataset.priceAdjustment==="RAW_UNADJUSTED") {status="WAIT_DATA";label="データ更新待ち";}
  else if(analysis.score.coveragePercent<80){status="INSUFFICIENT_DATA";label="判定保留";}
  else if(allowed&&["CONSIDER_BUY","VERY_PROMISING"].includes(recommendation.code)){status="ADD_WATCH";label="買い増し監視";}
  else if(allowed&&recommendation.code==="WATCH_FOR_DIP"){status="WAIT_DIP";label="押し目待ち";}
  else if(guards.length){status="RISK_BLOCKED";label="リスク確認待ち";}
  else {status="WAIT";label="追加購入は見送り";}
  if(!reasons.length) reasons.push("現時点の分析条件を満たしています。価格水準と保有比率をあわせて確認してください。");
  return {
    symbol:holding.symbol,market:holding.market,currency:dataset.currency??holding.currency??null,
    status,label,actionable:allowed&&["ADD_WATCH","WAIT_DIP"].includes(status),
    score:analysis.score.score,coveragePercent:analysis.score.coveragePercent,
    recommendation:recommendation.label,latestPrice:latest.close,latestDate:latest.date,
    priceAgeDays:analysis.dataQuality.ageDays,priceAdjustment:dataset.priceAdjustment??"UNKNOWN",
    referenceLevels,forecast:shortForecast?{base:shortForecast.base,bear:shortForecast.bear,bull:shortForecast.bull,range:shortForecast.range,expectedChangePercent:shortForecast.expectedChangePercent,confidence:analysis.forecast.confidence,status:analysis.forecast.status}:null,
    reasons:[...new Set(reasons)],guardrails:guards
  };
}

export function assessPortfolioHoldings(portfolio,datasets={},options={}) {
  if(!portfolio||!Array.isArray(portfolio.holdings)) throw new TypeError("portfolio.holdings is required");
  return portfolio.holdings.map(holding=>{
    const symbol=holding.market==="JP"?String(holding.symbol).replace(/\.(T|JP)$/i,""):holding.symbol;
    return assessHolding(holding,datasets[holding.market+":"+symbol],options);
  });
}
