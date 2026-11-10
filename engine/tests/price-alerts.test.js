import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePriceAlerts, normalizePriceAlert } from "../alerts/price-alerts.js";
test("validates alert definitions",()=>{assert.throws(()=>normalizePriceAlert({symbol:"",market:"JP",targetPrice:100,condition:"BELOW"}));assert.equal(normalizePriceAlert({symbol:"7203",market:"JP",targetPrice:100,condition:"BELOW"}).enabled,true);});
test("fires once on crossing and rearms after price moves away",()=>{
 const alert={id:"a",symbol:"7203",market:"JP",targetPrice:100,condition:"BELOW"};
 const first=evaluatePriceAlerts([alert],{"JP:7203":{data:[{date:"2026-11-10",close:95}]}});
 assert.equal(first.events.length,1);assert.equal(first.alerts[0].triggered,true);
 const repeated=evaluatePriceAlerts(first.alerts,{"JP:7203":{data:[{date:"2026-11-11",close:94}]}});
 assert.equal(repeated.events.length,0);
 const reset=evaluatePriceAlerts(repeated.alerts,{"JP:7203":{data:[{date:"2026-11-12",close:105}]}});
 assert.equal(reset.alerts[0].triggered,false);
 const again=evaluatePriceAlerts(reset.alerts,{"JP:7203":{data:[{date:"2026-11-13",close:99}]}});
 assert.equal(again.events.length,1);
});
test("does not trigger without published prices and supports above alerts",()=>{
 const missing=evaluatePriceAlerts([{symbol:"AAPL",market:"US",targetPrice:200,condition:"ABOVE"}],{});
 assert.equal(missing.events.length,0);
 const hit=evaluatePriceAlerts([{symbol:"AAPL",market:"US",targetPrice:200,condition:"ABOVE"}],{"US:AAPL":{data:[{date:"2026-11-10",close:201}] }});
 assert.equal(hit.events[0].price,201);
});
