import { getEngineCapabilities } from "../../engine/pipeline.js";

const tabs=[...document.querySelectorAll(".tab")];
const views=[...document.querySelectorAll(".view")];
function activate(viewName){tabs.forEach(tab=>{const selected=tab.dataset.view===viewName;tab.classList.toggle("active",selected);tab.setAttribute("aria-current",selected?"page":"false");});views.forEach(view=>{const selected=view.id===`view-${viewName}`;view.hidden=!selected;view.classList.toggle("active",selected);});}
tabs.forEach(tab=>tab.addEventListener("click",()=>activate(tab.dataset.view)));

const capabilities=getEngineCapabilities();
const status=document.querySelector("#system-status");
if(status)status.textContent="分析基盤統合済み・実データ接続待ち";

const labels={
  priceNormalization:["価格データ正規化","作成済み"],
  priceValidation:["株価データ品質検証","作成済み"],
  technicalIndicators:["テクニカル分析","作成済み"],
  annualFinancialAnalysis:["財務分析","作成済み"],
  weightedStockScoring:["100点評価","作成済み"],
  scenarioForecasting:["3シナリオ予測","作成済み"],
  forecastEvaluation:["予測精度評価","作成済み"],
  liveProviderConnection:["実データ自動取得","未接続"],
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
    tag.className="tag "+(capabilities[key]?"good":"pending");
    tag.textContent=value;
    item.append(name,tag);
    list.append(item);
  }
}
activate("overview");
