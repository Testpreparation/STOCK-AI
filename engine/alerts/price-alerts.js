const finite=value=>Number.isFinite(value);
export function normalizePriceAlert(alert){
  if(!alert||typeof alert!=="object")throw new TypeError("alert is required");
  const symbol=String(alert.symbol??"").trim().toUpperCase();
  const market=String(alert.market??"").trim().toUpperCase();
  const target=Number(alert.targetPrice);
  const condition=alert.condition;
  if(!symbol||!["JP","US"].includes(market)||!finite(target)||target<=0||!["ABOVE","BELOW"].includes(condition))throw new TypeError("invalid price alert");
  return {id:String(alert.id??[market,symbol,condition,target].join(":")),symbol,market,targetPrice:target,condition,enabled:alert.enabled!==false,triggered:alert.triggered===true,createdAt:alert.createdAt??new Date().toISOString(),lastCheckedPrice:null,lastCheckedAt:null};
}
export function evaluatePriceAlerts(alerts,datasets,checkedAt=new Date().toISOString()){
  if(!Array.isArray(alerts))throw new TypeError("alerts must be an array");
  const next=alerts.map(normalizePriceAlert),events=[];
  for(const alert of next){
    if(!alert.enabled)continue;
    const key=alert.market+":"+alert.symbol.replace(/\.(T|JP)$/i,"");
    const rows=datasets?.[key]?.data;
    if(!Array.isArray(rows)||!rows.length)continue;
    const latest=rows[rows.length-1],price=Number(latest.close);
    if(!finite(price)||price<=0)continue;
    const crossed=alert.condition==="ABOVE"?price>=alert.targetPrice:price<=alert.targetPrice;
    if(crossed&&!alert.triggered){
      events.push({id:alert.id,symbol:alert.symbol,market:alert.market,targetPrice:alert.targetPrice,condition:alert.condition,price,date:latest.date});
      alert.triggered=true;
    }else if(!crossed)alert.triggered=false;
    alert.lastCheckedPrice=price;
    alert.lastCheckedAt=checkedAt;
  }
  return {alerts:next,events};
}
