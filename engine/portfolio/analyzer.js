const DAY_MS=86400000;
const finite=value=>Number.isFinite(value);
const round=(value,digits=2)=>finite(value)?Number(value.toFixed(digits)):null;

/**
 * Revalues imported holdings using the latest published daily close.
 * All calculations remain in the holding's original currency; no FX is inferred.
 */
export function analyzePortfolio(portfolio, datasets={}, options={}) {
  if(!portfolio||!Array.isArray(portfolio.holdings)) throw new TypeError("portfolio.holdings is required");
  const asOf=options.asOf?new Date(options.asOf):new Date();
  const maxQuoteAgeDays=Number.isInteger(options.maxQuoteAgeDays)?options.maxQuoteAgeDays:5;
  const warnings=[];
  const holdings=portfolio.holdings.map(holding=>{
    const normalizedSymbol=holding.market==="JP"?String(holding.symbol).replace(/\\.(T|JP)$/i,""):holding.symbol;
    const key=holding.market+":"+normalizedSymbol;
    const dataset=datasets[key];
    const rows=Array.isArray(dataset?.data)?dataset.data.filter(row=>row&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&finite(row.close)&&row.close>0).sort((a,b)=>a.date.localeCompare(b.date)):[];
    const latest=rows.at(-1)??null;
    const previous=rows.at(-2)??null;
    const quoteAgeDays=latest?Math.max(0,Math.floor((asOf.getTime()-Date.parse(latest.date+"T00:00:00Z"))/DAY_MS)):null;
    const quoteAvailable=Boolean(latest);
    const quoteStale=quoteAgeDays===null||quoteAgeDays>maxQuoteAgeDays;
    const currentPrice=quoteAvailable?latest.close:(finite(holding.currentPrice)?holding.currentPrice:null);
    const marketValue=currentPrice===null?holding.marketValue:currentPrice*holding.quantity;
    const unrealizedPnl=currentPrice!==null&&finite(holding.averageCost)?(currentPrice-holding.averageCost)*holding.quantity:holding.unrealizedPnl;
    const dailyChange=latest&&previous?latest.close-previous.close:null;
    const dailyChangePercent=latest&&previous&&previous.close>0?(latest.close/previous.close-1)*100:null;
    const marketValueChange=finite(dailyChange)?dailyChange*holding.quantity:null;
    const dataSource=dataset?.source??null;
    const adjustment=dataset?.priceAdjustment??null;
    return {
      ...holding,currentPrice,marketValue,unrealizedPnl,quoteDate:latest?.date??null,
      quoteAgeDays,quoteStale,quoteAvailable,previousClose:previous?.close??null,
      dailyChange:round(dailyChange),dailyChangePercent:round(dailyChangePercent),
      dailyChangeAmount:round(marketValueChange),dataSource,priceAdjustment:adjustment,
      quoteDelayPolicy:dataset?.delayPolicy??null,
      splitAdjustmentWarning:adjustment==="RAW_UNADJUSTED"
    };
  });
  const currencies=[...new Set(holdings.map(item=>item.currency))];
  const totalsByCurrency={};
  for(const currency of currencies){
    const items=holdings.filter(item=>item.currency===currency);
    const marketValue=items.reduce((sum,item)=>sum+(finite(item.marketValue)?item.marketValue:0),0);
    const costBasis=items.reduce((sum,item)=>sum+(finite(item.averageCost)?item.averageCost*item.quantity:0),0);
    const pnl=items.reduce((sum,item)=>sum+(finite(item.unrealizedPnl)?item.unrealizedPnl:0),0);
    const pricedCount=items.filter(item=>item.quoteAvailable).length;
    const ranked=[...items].filter(item=>finite(item.marketValue)&&item.marketValue>0).sort((a,b)=>b.marketValue-a.marketValue);
    totalsByCurrency[currency]={
      marketValue:round(marketValue),costBasis:round(costBasis),unrealizedPnl:round(pnl),
      returnPercent:costBasis>0?round(pnl/costBasis*100):null,
      pricedCount,holdingCount:items.length,
      largestHolding:ranked[0]?{symbol:ranked[0].symbol,weightPercent:marketValue>0?round(ranked[0].marketValue/marketValue*100):null}:null,
      concentrationTop3Percent:marketValue>0?round(ranked.slice(0,3).reduce((sum,item)=>sum+item.marketValue,0)/marketValue*100):null,
      allocation:ranked.map(item=>({symbol:item.symbol,name:item.name,marketValue:item.marketValue,weightPercent:marketValue>0?round(item.marketValue/marketValue*100):null}))
    };
  }
  const staleCount=holdings.filter(item=>item.quoteStale).length;
  const missingCount=holdings.filter(item=>!item.quoteAvailable).length;
  const unadjustedCount=holdings.filter(item=>item.splitAdjustmentWarning).length;
  if(staleCount)warnings.push("株価データが"+staleCount+"銘柄で古いか、更新日を確認できません。最新値として断定しないでください。");
  if(missingCount)warnings.push("公開株価データがない銘柄が"+missingCount+"件あります。CSV取込時の価格を参考表示しています。");
  if(unadjustedCount)warnings.push("未調整株価の銘柄が"+unadjustedCount+"件あります。株式分割等により数量・損益が不正確になる可能性があります。");
  const staleCurrencies=Object.entries(totalsByCurrency).map(([currency,total])=>({currency,pricedCoveragePercent:total.holdingCount?round(total.pricedCount/total.holdingCount*100):0}));
  return {
    schemaVersion:1,analyzedAt:asOf.toISOString(),holdings,totalsByCurrency,
    summary:{holdingsCount:holdings.length,staleCount,missingCount,unadjustedCount,
      currencies:staleCurrencies,quoteCoveragePercent:holdings.length?round((holdings.length-missingCount)/holdings.length*100):0},
    warnings
  };
}
