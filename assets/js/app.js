import { getEngineCapabilities } from "../../engine/pipeline.js";

const tabs=[...document.querySelectorAll(".tab")];
const views=[...document.querySelectorAll(".view")];
function activate(viewName){tabs.forEach(tab=>{const selected=tab.dataset.view===viewName;tab.classList.toggle("active",selected);tab.setAttribute("aria-current",selected?"page":"false");});views.forEach(view=>{const selected=view.id===`view-${viewName}`;view.hidden=!selected;view.classList.toggle("active",selected);});}
tabs.forEach(tab=>tab.addEventListener("click",()=>activate(tab.dataset.view)));

const capabilities=getEngineCapabilities();
const status=document.querySelector("#system-status");
if(status)status.textContent="定期取得の仕組み実装済み・API認証設定待ち";

const labels={
  priceNormalization:["価格データ正規化","作成済み"],
  priceValidation:["株価データ品質検証","作成済み"],
  technicalIndicators:["テクニカル分析","作成済み"],
  annualFinancialAnalysis:["財務分析","作成済み"],
  weightedStockScoring:["100点評価","作成済み"],
  scenarioForecasting:["3シナリオ予測","作成済み"],
  forecastEvaluation:["予測精度評価","作成済み"],
  providerAdapters:["株価データ取得アダプター","作成済み"],
  scheduledDataIngestion:["毎日の自動取得ワークフロー","実装済み"],
  liveProviderConnection:["実データの画面連携","未接続"],
  browserApiCredentials:["ブラウザーへのAPIキー露出","なし（安全設計）"],
  automaticTrading:["自動売買","非対応"]
};
const list=document.querySelector("#engine-capabilities");
if(list){
  list.replaceChildren();
  for(const [key,[label,value]] of Object.entries(labels)){
    const item=document.createElement("li");
    const name=document.createElement("span");
    const tag=document.createElement("b");
    name.textContent=label;
    tag.className="tag "+((key==="browserApiCredentials"||key==="automaticTrading")?"good":capabilities[key]?"good":"pending");
    tag.textContent=value;
    item.append(name,tag);
    list.append(item);
  }
}
activate("overview");
