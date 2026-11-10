import { getEngineCapabilities, analyzeInstrument } from "../../engine/pipeline.js";
import { applyForecastCalibration, createForecastSnapshots, reconcileForecastHistory, summarizeForecastHistory } from "../../engine/analysis/forecast-history.js";

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
function renderInstrument(item,dataset){
  let analysis=null;
  try{analysis=analyzeInstrument({priceDataset:dataset,asOf:new Date().toISOString().slice(0,10)});}catch(error){console.warn("Analysis failed:",item.symbol,error);}
  const card=element("article","instrument-card");
  const head=element("div","instrument-head");
  head.append(element("strong","",item.symbol),element("span","market-chip",item.market==="JP"?"日本株":"米国株"));
  const price=analysis?.technical?.latest?.close;
  const detail=element("div","instrument-price",money(price,dataset.currency));
  const meta=element("p","instrument-meta",`最新データ：${item.latestDate??"不明"} ／ ${item.provider??"提供元不明"}`);
  const score=analysis?.score;
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
    overview.replaceChildren();if(screening)screening.replaceChildren();
    let loaded=0;
    for(const item of records){
      try{
        const dataResponse=await fetch(`.${item.file}`,{cache:"no-store"});
        if(!dataResponse.ok)throw new Error(`data HTTP ${dataResponse.status}`);
        const dataset=await dataResponse.json();
        const card=renderInstrument(item,dataset);overview.append(card);
        if(screening)screening.append(card.cloneNode(true));
        loaded++;
      }catch(error){console.warn("Data load failed:",item.symbol,error);}
    }
    const forecastTarget=document.querySelector("#forecast-list");
    if(forecastTarget){forecastTarget.replaceChildren();for(const card of overview.children){forecastTarget.append(card.cloneNode(true));}if(!forecastTarget.children.length)forecastTarget.append(element("p","muted","予測対象データがありません。"));}
    const warningCount=(manifest.warnings??[]).length;
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
activate("overview");
loadPublishedData();
const MARKET_DATA_CHECK_INTERVAL_MS=60*1000;
window.setInterval(()=>{
  if(document.visibilityState==="visible")loadPublishedData();
},MARKET_DATA_CHECK_INTERVAL_MS);
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible")loadPublishedData();
});
