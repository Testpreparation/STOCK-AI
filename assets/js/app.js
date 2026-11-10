import { getEngineCapabilities, analyzeInstrument } from "../../engine/pipeline.js";
import { applyForecastCalibration, createForecastSnapshots, reconcileForecastHistory, summarizeForecastHistory } from "../../engine/analysis/forecast-history.js";
import { importPortfolioCsv } from "../../engine/portfolio/csv-import.js";
import { analyzePortfolio } from "../../engine/portfolio/analyzer.js";
import { assessPortfolioHoldings } from "../../engine/portfolio/holding-advisor.js";
import { normalizeAnnualFinancials } from "../../engine/data/financial-normalizer.js";
import { calculateValuationIndicators } from "../../engine/analysis/valuation.js";
import { evaluatePriceAlerts } from "../../engine/alerts/price-alerts.js";

const tabs=[...document.querySelectorAll(".tab")];
const views=[...document.querySelectorAll(".view")];
function activate(viewName){tabs.forEach(tab=>{const selected=tab.dataset.view===viewName;tab.classList.toggle("active",selected);tab.setAttribute("aria-current",selected?"page":"false");});views.forEach(view=>{const selected=view.id===`view-${viewName}`;view.hidden=!selected;view.classList.toggle("active",selected);});}
tabs.forEach(tab=>tab.addEventListener("click",()=>activate(tab.dataset.view)));

const capabilities=getEngineCapabilities();
const status=document.querySelector("#system-status");
const labels={
  priceNormalization:["価格データ正規化","作成済み"],
  priceValidation:["株価データ品質検証","作成済み"],
  technicalIndicators:["テクニカル分析","作成済み"],
  annualFinancialAnalysis:["財務分析","作成済み"],
  weightedStockScoring:["100点評価","作成済み"],
  scenarioForecasting:["3シナリオ予測","作成済み"],
  forecastEvaluation:["予測精度評価","作成済み"],
  forecastHistoryTracking:["予測履歴の保存・答え合わせ","作成済み"],
  forecastErrorCalibration:["過去の誤差による予測補正","5件以上で有効"],
  providerAdapters:["株価データ取得アダプター","作成済み"],
  scheduledDataIngestion:["毎日の自動取得ワークフロー","実装済み"],
  liveProviderConnection:["実データの画面連携","接続確認待ち"],
  browserApiCredentials:["ブラウザーへのAPIキー露出","なし（安全設計）"],
  automaticTrading:["自動売買","非対応"]
};
const list=document.querySelector("#engine-capabilities");
if(list){
  list.replaceChildren();
  for(const [key,[label,value]] of Object.entries(labels)){
    const item=document.createElement("li"),name=document.createElement("span"),tag=document.createElement("b");
    name.textContent=label;tag.className="tag "+((key==="browserApiCredentials"||key==="automaticTrading")?"good":capabilities[key]?"good":"pending");
    tag.textContent=value;item.append(name,tag);list.append(item);
  }
}

const money=(value,currency)=>Number.isFinite(value)?new Intl.NumberFormat("ja-JP",{style:"currency",currency:currency==="JPY"?"JPY":"USD",maximumFractionDigits:currency==="JPY"?0:2}).format(value):"—";
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
const FORECAST_HISTORY_KEY="stock-ai-forecast-history-v1";
function readForecastHistory(){try{const value=JSON.parse(localStorage.getItem(FORECAST_HISTORY_KEY)??"[]");return Array.isArray(value)?value:[];}catch{return [];}}
function writeForecastHistory(history){try{localStorage.setItem(FORECAST_HISTORY_KEY,JSON.stringify(history.slice(-1000)));return true;}catch(error){console.warn("Forecast history could not be saved:",error);return false;}}
function updateForecastHistory(dataset,forecast){const history=readForecastHistory();const reconciled=reconcileForecastHistory(history,dataset);const calibratedForecast=applyForecastCalibration(forecast,reconciled);const known=new Set(reconciled.map(record=>record.id));const fresh=createForecastSnapshots(dataset,calibratedForecast).filter(record=>!known.has(record.id));const next=[...reconciled,...fresh].slice(-1000);const saved=writeForecastHistory(next);return {history:next,saved,forecast:calibratedForecast};}
function renderInstrument(item,dataset,rawFinancials=null){
  let analysis=null;
  try{const financialData=rawFinancials?normalizeAnnualFinancials(rawFinancials,{symbol:item.symbol,market:item.market,currency:dataset.currency}):null;analysis=analyzeInstrument({priceDataset:dataset,financialData,asOf:new Date().toISOString().slice(0,10)});}catch(error){console.warn("Analysis failed:",item.symbol,error);}
  const card=element("article","instrument-card");
  const head=element("div","instrument-head");
  head.append(element("strong","",item.symbol),element("span","market-chip",item.market==="JP"?"日本株":"米国株"));
  const price=analysis?.technical?.latest?.close;
  const detail=element("div","instrument-price",money(price,dataset.currency));
  const meta=element("p","instrument-meta",`最新データ：${item.latestDate??"不明"} ／ ${item.provider??"提供元不明"}`);
  const score=analysis?.score;
  const valuation=analysis?.financial?calculateValuationIndicators({price,financial:analysis.financial}):null;
  const historyResult=analysis?.forecast?.forecasts?.length?updateForecastHistory(dataset,analysis.forecast):{history:readForecastHistory(),saved:true};
  const ownHistory=historyResult.history.filter(record=>record.symbol===item.symbol&&record.market===item.market);
  const forecastResult=historyResult.forecast??analysis?.forecast;
  const scoreRow=element("div","instrument-score");
  scoreRow.append(element("span","","分析スコア"),element("strong","",score?.score===null||score?.score===undefined?"—":`${score.score.toFixed(1)} / 100`));
  const recommendation=element("p","instrument-recommendation",score?.recommendation?.label??"判定保留");
  const quality=element("p","instrument-meta",`データ充足率：${score?.coveragePercent??0}% ／ ${analysis?.dataQuality?.freshness??"品質未確認"}`);
  const warnings=[...(analysis?.score?.guardrails??[]),...(analysis?.forecast?.reason?[analysis.forecast.reason]:[])];
  if(item.priceAdjustment==="RAW_UNADJUSTED")warnings.push("未調整株価のため予測・買い判定を停止");
  card.append(head,detail,meta,scoreRow,recommendation,quality);
  if(analysis?.financial){
    const d=analysis.financial.derived??{};
    const financialSummary=[
      ["売上成長",analysis.financial.metrics?.revenue?.yearOverYearGrowth?.value,"%"],
      ["営業利益率",d.operatingMarginPercent,"%"],
      ["FCF",d.freeCashFlow,d.freeCashFlow===null?null:dataset.currency],
      ["流動比率",d.currentRatio,"倍"],
      ["自己資本比率",d.equityRatioPercent,"%"]
    ].filter(([,value])=>Number.isFinite(value));
    if(financialSummary.length)card.append(element("p","instrument-meta","財務（"+(analysis.financial.latestPeriod??"期間不明")+"）："+financialSummary.map(([label,value,unit])=>label+" "+(unit==="%"?value.toFixed(1)+"%":unit==="倍"?value.toFixed(2)+"倍":money(value,unit))).join(" ／ ")));
  }
  if(valuation){
    const valuationText=[
      ["PER",valuation.pe===null?null:valuation.pe.toFixed(1)+"倍"],
      ["PBR",valuation.pb===null?null:valuation.pb.toFixed(2)+"倍"],
      ["EPS",valuation.eps===null?null:money(valuation.eps,dataset.currency)],
      ["EPS成長",valuation.epsGrowthPercent===null?null:valuation.epsGrowthPercent.toFixed(1)+"%"]
    ].filter(([,value])=>value!==null);
    if(valuationText.length)card.append(element("p","instrument-meta","企業価値指標："+valuationText.map(([label,value])=>label+" "+value).join(" ／ ")));
    if(valuation.scenarios)card.append(element("p","instrument-meta","EPS×PER仮定価格：保守 "+money(valuation.scenarios.conservative,dataset.currency)+" ／ 基本 "+money(valuation.scenarios.base,dataset.currency)+" ／ 強気 "+money(valuation.scenarios.optimistic,dataset.currency)+"（PER 10/16/22倍の仮定）"));
  }
  if(warnings.length)card.append(element("p","instrument-warning",[...new Set(warnings)].join(" ")));
  if(forecastResult?.forecasts?.length){
    const forecast=element("div","forecast-mini");
    forecast.append(element("strong","","基本シナリオ予測"));
    for(const scenario of forecastResult.forecasts){
      for(const [key,label] of [["bull","強気"],["base","基本"],["bear","弱気"]]){
        const row=element("div","forecast-mini-row");
        row.append(element("span","",scenario.label+"・"+label+(scenario.calibration?.applied?"（過去"+scenario.calibration.sampleCount+"件で補正）":"")),element("b","",money(scenario[key],dataset.currency)));
        forecast.append(row);
      }
    }
    if(forecastResult.stale)forecast.append(element("small","instrument-meta","参考値：株価データが古いため売買判断には使用できません"));
    const accuracy=element("div","forecast-accuracy");
    accuracy.append(element("strong","","予測の答え合わせ"));
    for(const horizon of ["short","medium","long"]){
      const metric=summarizeForecastHistory(ownHistory,horizon);
      const label={short:"短期",medium:"中期",long:"長期"}[horizon];
      const line=element("div","forecast-accuracy-row");
      line.append(element("span","",label+"（検証 "+metric.sampleCount+"件）"));
      line.append(element("b","",metric.sampleCount?"誤差 "+metric.mapePercent+"% ／ 方向 "+(metric.directionalAccuracyPercent??"—")+"%":"検証待ち "+metric.pendingCount+"件"));
      accuracy.append(line);
    }
    if(!historyResult.saved)accuracy.append(element("small","instrument-warning","この端末に予測履歴を保存できませんでした"));
    card.append(forecast,accuracy);
  }
  return card;
}

const PRICE_ALERTS_KEY="stock-ai-price-alerts-v1";
function readPriceAlerts(){try{const value=JSON.parse(localStorage.getItem(PRICE_ALERTS_KEY)??"[]");return Array.isArray(value)?value:[];}catch{return [];}}
function savePriceAlerts(alerts){try{localStorage.setItem(PRICE_ALERTS_KEY,JSON.stringify(alerts));return true;}catch{return false;}}
function renderPriceAlerts(){
  const target=document.querySelector("#price-alert-list");if(!target)return;
  const alerts=readPriceAlerts();target.replaceChildren();
  if(!alerts.length){target.append(element("p","muted","価格アラートはまだ登録されていません。"));return;}
  for(const alert of alerts){
    const row=element("div","alert-row");
    const condition=alert.condition==="BELOW"?"以下":"以上";
    const info=element("span","",alert.symbol+"（"+(alert.market==="JP"?"日本株":"米国株")+"） "+alert.targetPrice+" "+condition+(alert.triggered?" · 到達済み":""));
    const remove=element("button","secondary-button","削除");remove.type="button";remove.addEventListener("click",()=>{savePriceAlerts(readPriceAlerts().filter(item=>item.id!==alert.id));renderPriceAlerts();});
    row.append(info,remove);target.append(row);
  }
}
function checkPriceAlerts(){
  const current=readPriceAlerts();if(!current.length)return;
  const result=evaluatePriceAlerts(current,publishedDatasets);
  if(savePriceAlerts(result.alerts))renderPriceAlerts();
  for(const event of result.events){
    const message=event.symbol+" の公開終値が "+event.price+" に到達しました（設定価格 "+event.targetPrice+"）";
    const statusNode=document.querySelector("#alert-status");
    if("Notification" in window&&Notification.permission==="granted"){
      try{new Notification("STOCK AI 価格アラート",{body:message,tag:"stock-ai-"+event.id});}catch(error){console.warn("Browser notification unavailable:",error);}
    }
    if(statusNode)statusNode.textContent=message+"。日足データの更新時に検知しました。";
  }
}
const alertSymbol=document.querySelector("#alert-symbol");
const addAlertButton=document.querySelector("#add-price-alert");
const notificationButton=document.querySelector("#notification-permission");
if(notificationButton)notificationButton.addEventListener("click",async()=>{
  const statusNode=document.querySelector("#alert-status");
  if(!("Notification" in window)){if(statusNode)statusNode.textContent="このブラウザーは通知に対応していません。";return;}
  try{const permission=await Notification.requestPermission();if(statusNode)statusNode.textContent=permission==="granted"?"ブラウザー通知を有効にしました。":"通知は許可されていません。アプリ内のアラート表示は利用できます。";}
  catch(error){if(statusNode)statusNode.textContent="通知設定を変更できませんでした。ブラウザー設定を確認してください。";}
});
if(addAlertButton)addAlertButton.addEventListener("click",()=>{
  const symbol=alertSymbol?.value??"",market=symbol.split(":")[0],ticker=symbol.split(":")[1];
  const condition=document.querySelector("#alert-condition")?.value;
  const targetPrice=Number(document.querySelector("#alert-price")?.value);
  const statusNode=document.querySelector("#alert-status");
  if(!ticker||!Number.isFinite(targetPrice)||targetPrice<=0){if(statusNode)statusNode.textContent="銘柄と0より大きい価格を入力してください。";return;}
  const alerts=readPriceAlerts();
  if(alerts.some(item=>item.market===market&&item.symbol===ticker&&item.condition===condition&&Number(item.targetPrice)===targetPrice)){if(statusNode)statusNode.textContent="同じ条件のアラートが登録済みです。";return;}
  alerts.push({id:market+":"+ticker+":"+condition+":"+targetPrice+":"+Date.now(),market,symbol:ticker,condition,targetPrice,enabled:true,triggered:false,createdAt:new Date().toISOString()});
  if(savePriceAlerts(alerts)){renderPriceAlerts();if(statusNode)statusNode.textContent="アラートを登録しました。公開データの更新時に価格を確認します。";}
});
renderPriceAlerts();
let screeningSourceItems=[];
let screeningFinancialSource={};
function renderScreeningList(){
  const target=document.querySelector("#screening-list");if(!target)return;
  const query=(document.querySelector("#screening-search")?.value??"").trim().toUpperCase();
  const sort=document.querySelector("#screening-sort")?.value??"score";
  const rows=screeningSourceItems.filter(({item})=>!query||item.symbol.toUpperCase().includes(query));
  const scored=rows.map(entry=>{
    const financial=screeningFinancialSource[entry.item.market+":"+entry.item.symbol];
    try{const normalized=financial?normalizeAnnualFinancials(financial,{symbol:entry.item.symbol,market:entry.item.market,currency:entry.dataset.currency}):null;const result=analyzeInstrument({priceDataset:entry.dataset,financialData:normalized,asOf:new Date().toISOString().slice(0,10)});return {...entry,score:result.score.score??-1};}catch{return {...entry,score:-1};}
  });
  scored.sort((a,b)=>sort==="symbol"?a.item.symbol.localeCompare(b.item.symbol):sort==="market"?a.item.market.localeCompare(b.item.market)||a.item.symbol.localeCompare(b.item.symbol):b.score-a.score);
  target.replaceChildren();
  for(const entry of scored)target.append(renderInstrument(entry.item,entry.dataset,screeningFinancialSource[entry.item.market+":"+entry.item.symbol]??null));
  if(!scored.length)target.append(element("p","muted","該当する銘柄はありません。"));
}
document.querySelector("#screening-search")?.addEventListener("input",renderScreeningList);
document.querySelector("#screening-sort")?.addEventListener("change",renderScreeningList);
let publishedDatasets={};
let publishedFinancials={};
let lastManifestGeneratedAt=null;
let isLoadingMarketData=false;
async function loadPublishedData(){
  if(isLoadingMarketData)return;
  isLoadingMarketData=true;
  const overview=document.querySelector("#instrument-list");
  const screening=document.querySelector("#screening-list");
  const summary=document.querySelector("#market-data-summary");
  if(!overview||!summary)return;
  try{
    const response=await fetch("./public-data/manifest.json",{cache:"no-store"});
    if(!response.ok)throw new Error(`manifest HTTP ${response.status}`);
    const manifest=await response.json();
    if(lastManifestGeneratedAt===manifest.generatedAt)return;
    lastManifestGeneratedAt=manifest.generatedAt??null;
    const records=(manifest.instruments??[]).filter(item=>item.file&&item.status==="updated");
    const fundamentals=(manifest.instruments??[]).filter(item=>item.fundamentalsFile&&item.status==="updated");
    const nextDatasets={};
    const nextFinancials={};
    const loadedItems=[];
    overview.replaceChildren();if(screening)screening.replaceChildren();
    let loaded=0;
    for(const item of records){
      try{
        const dataResponse=await fetch(`.${item.file}`,{cache:"no-store"});
        if(!dataResponse.ok)throw new Error(`data HTTP ${dataResponse.status}`);
        const dataset=await dataResponse.json();
        nextDatasets[item.market+":"+item.symbol]=dataset;
        loadedItems.push({item,dataset});
        loaded++;
      }catch(error){console.warn("Data load failed:",item.symbol,error);}
    }
    for(const item of fundamentals){
      try{
        const response=await fetch("."+item.fundamentalsFile,{cache:"no-store"});
        if(!response.ok)throw new Error("fundamentals HTTP "+response.status);
        nextFinancials[item.market+":"+item.symbol]=await response.json();
      }catch(error){console.warn("Fundamentals load failed:",item.symbol,error);}
    }
    publishedDatasets=nextDatasets;
    publishedFinancials=nextFinancials;
    if(alertSymbol){
      const previous=alertSymbol.value;
      alertSymbol.replaceChildren(new Option("銘柄を選択",""));
      for(const {item,dataset} of loadedItems)alertSymbol.add(new Option(item.symbol+"（"+(item.market==="JP"?"日本株":"米国株")+"） "+dataset.currency,item.market+":"+item.symbol));
      if([...alertSymbol.options].some(option=>option.value===previous))alertSymbol.value=previous;
    }
    checkPriceAlerts();
    for(const {item,dataset} of loadedItems){
      const card=renderInstrument(item,dataset,nextFinancials[item.market+":"+item.symbol]??null);
      overview.append(card);
    }
    screeningSourceItems=loadedItems;
    screeningFinancialSource=nextFinancials;
    renderScreeningList();
    renderPortfolio(readPortfolio());
    const forecastTarget=document.querySelector("#forecast-list");
    if(forecastTarget){forecastTarget.replaceChildren();for(const card of overview.children){forecastTarget.append(card.cloneNode(true));}if(!forecastTarget.children.length)forecastTarget.append(element("p","muted","予測対象データがありません。"));}
    const warningCount=(manifest.warnings??[]).length;
    const state=document.querySelector("#dashboard-state");
    if(state)state.textContent=loaded?"公開データ接続済み":"データ取得待ち";
    const instrumentsMetric=document.querySelector("#metric-instruments");
    if(instrumentsMetric)instrumentsMetric.textContent=String(loaded)+"銘柄";
    const candidates=loadedItems.filter(({item,dataset})=>{
      try{const financial=nextFinancials[item.market+":"+item.symbol];const normalized=financial?normalizeAnnualFinancials(financial,{symbol:item.symbol,market:item.market,currency:dataset.currency}):null;const result=analyzeInstrument({priceDataset:dataset,financialData:normalized,asOf:new Date().toISOString().slice(0,10)});return result.dataQuality.safeForPurchaseDecision&&result.score.coveragePercent>=80&&["CONSIDER_BUY","VERY_PROMISING"].includes(result.score.recommendation.code)&&item.priceAdjustment==="SPLIT_ADJUSTED";}catch{return false;}
    }).length;
    const candidateMetric=document.querySelector("#metric-candidates");if(candidateMetric)candidateMetric.textContent=String(candidates)+"銘柄";
    const accuracyMetric=document.querySelector("#metric-accuracy");
    if(accuracyMetric){const metrics=summarizeForecastHistory(readForecastHistory());accuracyMetric.textContent=metrics.sampleCount?metrics.mapePercent+"%誤差":"検証待ち";}
    const portfolioMetric=document.querySelector("#metric-portfolio");if(portfolioMetric){const p=readPortfolio();portfolioMetric.textContent=p?.holdings?.length?String(p.holdings.length)+"銘柄":"未取込";}
    const accuracySummary=document.querySelector("#forecast-accuracy-summary");
    if(accuracySummary){
      const metrics=summarizeForecastHistory(readForecastHistory());
      accuracySummary.textContent=metrics.sampleCount?"検証済み "+metrics.sampleCount+"件 ／ 平均絶対誤差率 "+metrics.mapePercent+"% ／ 予測方向の一致率 "+(metrics.directionalAccuracyPercent??"—")+"% ／ 検証待ち "+metrics.pendingCount+"件（この端末に保存）":"検証済みデータはまだありません。予測を記録し、将来の株価データが取得できた時点で自動採点します。検証待ち "+metrics.pendingCount+"件（この端末に保存）";
    }
    summary.textContent=`最終更新：${manifest.generatedAt?new Date(manifest.generatedAt).toLocaleString("ja-JP"):"不明"} ／ データ取得：${loaded}/${records.length}銘柄 ／ 警告：${warningCount}件`;
    if(status)status.textContent=loaded?`実データ読み込み済み：${loaded}銘柄（品質確認中）`:"取得データなし・自動更新設定を確認";
    if(!loaded){overview.append(element("p","muted","表示できる株価データがありません。GitHub Actionsの実行結果とmanifest.jsonを確認してください。"));}
    const warningBox=document.querySelector("#provider-warnings");
    if(warningBox){warningBox.replaceChildren();for(const warning of (manifest.warnings??[])){warningBox.append(element("li","",`${warning.provider??warning.market??"provider"}：${warning.code??"WARNING"} — ${warning.message??""}`));}}
  }catch(error){
    console.warn("Published market data unavailable:",error);
    summary.textContent="公開データ未取得。初回の自動更新が完了するとここに表示されます。";
    if(status)status.textContent="実データ未接続";
    overview.replaceChildren(element("p","muted","まだ公開データがありません。自動更新の実行後に再読み込みしてください。"));
  }finally{
    isLoadingMarketData=false;
  }
}

const PORTFOLIO_STORAGE_KEY="stock-ai-portfolio-v1";
const portfolioFile=document.querySelector("#portfolio-csv-file");
const portfolioImportButton=document.querySelector("#portfolio-import-button");
const portfolioClearButton=document.querySelector("#portfolio-clear-button");
const portfolioFileName=document.querySelector("#portfolio-file-name");
const portfolioStatus=document.querySelector("#portfolio-import-status");
function readPortfolio(){try{return JSON.parse(localStorage.getItem(PORTFOLIO_STORAGE_KEY)??"null");}catch{return null;}}
function renderPortfolio(portfolio){
  const portfolioAnalysis=portfolio?analyzePortfolio(portfolio,publishedDatasets,{asOf:new Date().toISOString()}):null;
  const displayPortfolio=portfolioAnalysis??portfolio;
  const summary=document.querySelector("#portfolio-summary");
  const tbody=document.querySelector("#portfolio-holdings");
  const updated=document.querySelector("#portfolio-updated-at");
  const warnings=document.querySelector("#portfolio-warnings");
  if(!summary||!tbody)return;
  summary.replaceChildren();
  const currencyTotals=(key)=>{
    const totals=displayPortfolio?.totalsByCurrency??portfolio?.summary?.totalsByCurrency??{};
    const parts=Object.entries(totals).filter(([,values])=>Number.isFinite(values[key])).map(([currency,values])=>money(values[key],currency));
    return parts.length?parts.join(" ／ "):"—";
  };
  const cashValue=portfolio?.summary?.buyingPower??portfolio?.summary?.cash??null;
  const metrics=[
    ["保有銘柄数",String(displayPortfolio?.summary?.holdingsCount??portfolio?.summary?.holdingsCount??0)+"銘柄","CSV取込データ"],
    ["保有株評価額",currencyTotals("marketValue"),"通貨ごとに分けて表示"],
    ["評価損益",currencyTotals("unrealizedPnl"),"通貨ごとに分けて表示"],
    ["資産合計",portfolio?.summary?.totalAssets===null||portfolio?.summary?.totalAssets===undefined?"—":Number(portfolio.summary.totalAssets).toLocaleString("ja-JP"),"CSVに資産合計の記載がある場合"],
    ["買付余力",cashValue===null?"—":Number(cashValue).toLocaleString("ja-JP"),"CSV記載値（通貨単位は元データ準拠）"]
  ];
  for(const [label,value,note] of metrics){const card=element("article","metric");card.append(element("span","",label),element("strong","",value),element("small","",note));summary.append(card);}
  tbody.replaceChildren();
  if(!portfolio?.holdings?.length){const row=element("tr");const cell=element("td","muted","CSVを読み込むと表示されます。");cell.colSpan=7;row.append(cell);tbody.append(row);}
  else for(const holding of (displayPortfolio?.holdings??portfolio.holdings)){
    const row=element("tr");
    const identity=element("td");identity.append(element("strong","",holding.symbol),element("small","portfolio-name",holding.name|| (holding.market==="JP"?"日本株":"米国株")));
    const quoteLabel=holding.quoteDate?(holding.quoteStale?"古いデータ：":"株価日：")+holding.quoteDate:(holding.quoteAvailable===false?"公開株価なし":"CSV取込値");
    identity.append(element("small","portfolio-name",quoteLabel));
    const dailyText=Number.isFinite(holding.dailyChangePercent)?(holding.dailyChangePercent>=0?"+":"")+holding.dailyChangePercent+"%":"—";
    const values=[identity,element("td","",holding.quantity.toLocaleString("ja-JP")),element("td","",money(holding.averageCost,holding.currency)),element("td",holding.quoteStale?"instrument-warning":"",money(holding.currentPrice,holding.currency)),element("td","",money(holding.marketValue,holding.currency)),element("td",holding.unrealizedPnl===null?"":holding.unrealizedPnl>=0?"pnl-positive":"pnl-negative",money(holding.unrealizedPnl,holding.currency)),element("td",holding.dailyChangePercent===null?"":holding.dailyChangePercent>=0?"pnl-positive":"pnl-negative",dailyText)];
    row.append(...values);tbody.append(row);
  }
  if(updated)updated.textContent=portfolio?.importedAt?"取込："+new Date(portfolio.importedAt).toLocaleString("ja-JP"):"未読み込み";
  if(warnings){warnings.replaceChildren();for(const warning of [...(portfolio?.warnings??[]),...(portfolioAnalysis?.warnings??[])])warnings.append(element("li","",warning));}
  const advice=document.querySelector("#portfolio-advice");
  if(advice){
    advice.replaceChildren();
    if(!portfolio) advice.append(element("p","muted","CSVを読み込むと保有銘柄ごとの投資判断材料を表示します。"));
    else {
      const reviews=assessPortfolioHoldings(portfolio,publishedDatasets,{asOf:new Date().toISOString().slice(0,10),financials:publishedFinancials});
      for(const review of reviews){
        const card=element("article","holding-advice-card");
        const head=element("div","holding-advice-head");
        head.append(element("strong","",review.symbol),element("span","advice-status advice-"+review.status.toLowerCase(),review.label));
        card.append(head);
        card.append(element("p","muted","分析スコア："+(review.score===null?"—":review.score+"/100")+" ／ データ充足率："+review.coveragePercent+"% ／ 株価日："+(review.latestDate??"—")));
        if(review.latestPrice!==null) card.append(element("p","", "分析基準価格 "+money(review.latestPrice,review.currency)+" ／ 価格調整 "+review.priceAdjustment));
        if(review.financial){
          if(review.valuation){const v=review.valuation;const parts=[["PER",v.pe===null?null:v.pe.toFixed(1)+"倍"],["PBR",v.pb===null?null:v.pb.toFixed(2)+"倍"],["EPS成長",v.epsGrowthPercent===null?null:v.epsGrowthPercent.toFixed(1)+"%"]].filter(([,value])=>value!==null);if(parts.length)card.append(element("p","", "企業価値指標："+parts.map(([label,value])=>label+" "+value).join(" ／ ")));if(v.scenarios)card.append(element("p","", "EPS×PER仮定価格：保守 "+money(v.scenarios.conservative,review.currency)+" ／ 基本 "+money(v.scenarios.base,review.currency)+" ／ 強気 "+money(v.scenarios.optimistic,review.currency)+"（PER 10/16/22倍）"));}
          const d=review.financial.derived??{};
          card.append(element("p","", "財務基準日 "+(review.financial.latestPeriod??"—")+" ／ 財務品質 "+review.financial.quality+" ／ 提供元 "+review.financial.provider+(review.financial.delayPolicy==="FREE_PLAN_12_WEEK_DELAY"?"（約12週間遅延）":"")));
          const ratios=[
            ["売上高成長率",review.financial.metrics?.revenue?.yearOverYearGrowth?.value,"%"],
            ["営業利益率",d.operatingMarginPercent,"%"],
            ["フリーキャッシュフロー",d.freeCashFlow,review.currency],
            ["流動比率",d.currentRatio,"倍"],
            ["自己資本比率",d.equityRatioPercent,"%"],
            ["負債/自己資本",d.debtToEquity,"倍"]
          ].filter(([,value])=>Number.isFinite(value));
          if(ratios.length)card.append(element("p","",ratios.map(([label,value,unit])=>label+" "+(unit==="%"?value.toFixed(1)+"%":unit==="倍"?value.toFixed(2)+"倍":money(value,unit))).join(" ／ ")));
        }
        if(review.referenceLevels.length){
          const levels=review.referenceLevels.map(level=>level.label+" "+money(level.price,review.currency)+(level.distancePercent===null?"":" ("+(level.distancePercent>=0?"+":"")+level.distancePercent+"%)")).join(" ／ ");
          card.append(element("p","", "押し目監視の参考水準："+levels));
        }
        if(review.forecast) card.append(element("p","", "短期シナリオ（統計参考）：弱気 "+money(review.forecast.bear,review.currency)+" ／ 基本 "+money(review.forecast.base,review.currency)+" ／ 強気 "+money(review.forecast.bull,review.currency)));
        const reasons=element("ul","warning-list");
        for(const reason of review.reasons) reasons.append(element("li","",reason));
        card.append(reasons);
        advice.append(card);
      }
      if(!reviews.length) advice.append(element("p","muted","保有銘柄がありません。"));
    }
  }
  const risk=document.querySelector("#portfolio-risk");
  if(risk){
    risk.replaceChildren();
    if(!portfolioAnalysis)risk.append(element("p","muted","CSVを読み込むと資産配分とリスクを表示します。"));
    else{
      risk.append(element("p","muted","株価データ充足率："+portfolioAnalysis.summary.quoteCoveragePercent+"% ／ 古いデータ："+portfolioAnalysis.summary.staleCount+"銘柄"));
      for(const [currency,total] of Object.entries(portfolioAnalysis.totalsByCurrency)){
        const block=element("div","portfolio-risk-block");
        block.append(element("h4","",currency+" 建て資産"));
        block.append(element("p","", "評価額 "+money(total.marketValue,currency)+" ／ 評価損益 "+money(total.unrealizedPnl,currency)+" ／ 損益率 "+(total.returnPercent===null?"—":total.returnPercent+"%")));
        block.append(element("p","", "上位3銘柄の集中度 "+(total.concentrationTop3Percent??"—")+"% ／ 最大保有 "+(total.largestHolding?.symbol??"—")+" ("+(total.largestHolding?.weightPercent??"—")+"%)"));
        for(const item of total.allocation){
          const line=element("div","allocation-row");
          line.append(element("span","",item.symbol+" "+(item.name||"")),element("b","",money(item.marketValue,currency)+" · "+item.weightPercent+"%"));
          block.append(line);
        }
        risk.append(block);
      }
    }
  }
}
if(portfolioFile&&portfolioImportButton){
  portfolioFile.addEventListener("change",()=>{
    const file=portfolioFile.files?.[0]??null;
    portfolioImportButton.disabled=!file;
    if(portfolioFileName)portfolioFileName.textContent=file?file.name:"ファイル未選択";
    if(portfolioStatus)portfolioStatus.textContent=file?"選択済み。読み込みボタンを押すと、この端末内で解析します。":"CSVを選択してください。";
  });
  portfolioImportButton.addEventListener("click",async()=>{
    const file=portfolioFile.files?.[0];
    if(!file)return;
    portfolioImportButton.disabled=true;
    if(portfolioStatus)portfolioStatus.textContent="CSVを解析しています…";
    try{
      const buffer=await file.arrayBuffer();
      let text;
      try{text=new TextDecoder("utf-8",{fatal:true}).decode(buffer);}
      catch{text=new TextDecoder("shift_jis").decode(buffer);}
      const imported=importPortfolioCsv(text,{source:file.name});
      if(!imported.holdings.length)throw new Error("保有銘柄を認識できませんでした。見出し行を確認してください。");
      localStorage.setItem(PORTFOLIO_STORAGE_KEY,JSON.stringify(imported));
      renderPortfolio(imported);
      if(portfolioStatus)portfolioStatus.textContent=imported.holdings.length+"銘柄を端末内に保存しました。"+(imported.warnings.length?" 注意事項があります。":"");
    }catch(error){
      console.error("Portfolio CSV import failed:",error);
      if(portfolioStatus)portfolioStatus.textContent="読み込み失敗："+error.message;
    }finally{portfolioImportButton.disabled=false;}
  });
}
if(portfolioClearButton){
  portfolioClearButton.addEventListener("click",()=>{
    localStorage.removeItem(PORTFOLIO_STORAGE_KEY);
    renderPortfolio(null);
    if(portfolioStatus)portfolioStatus.textContent="この端末に保存していた保有資産データを削除しました。";
    if(portfolioFile)portfolioFile.value="";
    if(portfolioFileName)portfolioFileName.textContent="ファイル未選択";
    if(portfolioImportButton)portfolioImportButton.disabled=true;
  });
}
renderPortfolio(readPortfolio());

activate("overview");
loadPublishedData();
const MARKET_DATA_CHECK_INTERVAL_MS=60*1000;
window.setInterval(()=>{
  if(document.visibilityState==="visible")loadPublishedData();
},MARKET_DATA_CHECK_INTERVAL_MS);
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible")loadPublishedData();
});
