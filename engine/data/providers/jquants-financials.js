const BASE_URL="https://api.jquants.com/v2/fins/summary";

export class JQuantsFinancialError extends Error {
  constructor(message,code="JQUANTS_FINANCIAL_ERROR",status=null){super(message);this.name="JQuantsFinancialError";this.code=code;this.status=status;}
}
const numeric=value=>{
  if(value===null||value===undefined||String(value).trim()==="")return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
};
const date=value=>{
  const text=String(value??"").replaceAll("-","");
  return /^\d{8}$/.test(text)?text.slice(0,4)+"-"+text.slice(4,6)+"-"+text.slice(6,8):null;
};

/**
 * J-Quants V2 annual-summary adapter. Uses only FY records to avoid mixing
 * cumulative quarterly values with annual values. The Free plan's 12-week
 * publication delay is preserved as metadata.
 */
export async function fetchJQuantsAnnualFinancials({apiKey,code,fetchImpl=globalThis.fetch,baseUrl=BASE_URL}={}){
  if(!apiKey||!String(apiKey).trim())throw new JQuantsFinancialError("J-Quants API key is required","MISSING_API_KEY");
  if(!code||!/^\d{4,5}$/.test(String(code)))throw new JQuantsFinancialError("A 4- or 5-digit Japanese stock code is required","INVALID_CODE");
  if(typeof fetchImpl!=="function")throw new JQuantsFinancialError("Fetch implementation is unavailable","FETCH_UNAVAILABLE");
  const params=new URLSearchParams({code:String(code)});
  const rows=[];
  let next=null;
  do{
    if(next)params.set("pagination_key",next);
    const url=new URL(baseUrl);url.search=params.toString();
    const response=await fetchImpl(url,{method:"GET",headers:{"x-api-key":String(apiKey).trim(),"accept":"application/json"}});
    if(!response.ok){
      const status=response.status;
      const errorCode=status===429?"RATE_LIMITED":status===403?"AUTH_OR_PLAN_ERROR":"HTTP_ERROR";
      throw new JQuantsFinancialError("J-Quants financial request failed (HTTP "+status+")",errorCode,status);
    }
    const payload=await response.json();
    if(!payload||!Array.isArray(payload.data))throw new JQuantsFinancialError("Unexpected J-Quants financial response","INVALID_RESPONSE");
    rows.push(...payload.data);
    next=payload.pagination_key||null;
  }while(next);
  const annual=rows.filter(row=>row.CurPerType==="FY"&&date(row.CurFYEn||row.CurPerEn));
  const latestByPeriod=new Map();
  for(const row of annual){
    const end=date(row.CurFYEn||row.CurPerEn);
    const previous=latestByPeriod.get(end);
    const order=String(row.DiscDate??"")+String(row.DiscTime??"")+String(row.DiscNo??"");
    const previousOrder=previous?String(previous.DiscDate??"")+String(previous.DiscTime??"")+String(previous.DiscNo??""):"";
    if(!previous||order>previousOrder)latestByPeriod.set(end,row);
  }
  const periods=[...latestByPeriod.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const mapMetric=(field,unit)=>periods.map(([end,row])=>({fiscalYearEnd:end,filedAt:date(row.DiscDate),value:numeric(row[field]),unit,sourceTag:field})).filter(item=>item.value!==null);
  const metrics={
    revenue:mapMetric("Sales","JPY"),
    operatingIncome:mapMetric("OP","JPY"),
    netIncome:mapMetric("NP","JPY"),
    dilutedEps:mapMetric("DEPS","JPY/share").length?mapMetric("DEPS","JPY/share"):mapMetric("EPS","JPY/share"),
    totalAssets:mapMetric("TA","JPY"),
    stockholdersEquity:mapMetric("Eq","JPY"),
    operatingCashFlow:mapMetric("CFO","JPY"),
    cashAndEquivalents:mapMetric("CashEq","JPY")
  };
  metrics.totalLiabilities=periods.map(([end,row])=>{
    const assets=numeric(row.TA),equity=numeric(row.Eq);
    return assets!==null&&equity!==null?{fiscalYearEnd:end,filedAt:date(row.DiscDate),value:assets-equity,unit:"JPY",sourceTag:"TA-Eq"}:null;
  }).filter(Boolean);
  return {
    provider:"jquants-fins-summary",market:"JP",symbol:String(code),currency:"JPY",
    fetchedAt:new Date().toISOString(),delayPolicy:"FREE_PLAN_12_WEEK_DELAY",
    periods:periods.length,metrics,
    limitations:[
      "J-Quants Free plan financial information is subject to the plan's 12-week delay.",
      "Only CurPerType=FY records are used; cumulative quarterly records are excluded.",
      "Total liabilities are derived as total assets minus net assets (TA-Eq); this is not a separately reported liability line.",
      "The summary endpoint does not provide all balance-sheet and cash-flow details; missing values remain unavailable."
    ]
  };
}
