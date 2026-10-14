"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const A=require("../docs/analysis-core.js");

function row(id,period,value){
  return {indicator_id:id,period,value,source_url:"https://data.stats.gov.cn/",official_release_date:null};
}
test("matched comparators only use identical reported months and YTD metric IDs",()=>{
  const data={history:[
    row("retail_ytd","2026-06",2.1),row("retail_ytd","2026-08",1.1),
    row("guangzhou_retail","2026-07",2.7),row("guangzhou_retail","2026-08",2.7),
    row("retail","2026-07",0.5)
  ]};
  const t=A.latestCommon(data,A.PAIRS[0]);
  assert.deepEqual(t.periods,["2026-08"]);
  assert.equal(t.aligned[0].gap,1.6);
  assert.equal(t.aligned[0].national,1.1);
});
test("does not synthesize trend from one shared month",()=>{
  const d={history:[row("catering","2026-08",2.4),row("guangzhou_catering","2026-08",4.9)]};
  const r=A.latestCommon(d,A.PAIRS[1]);
  assert.equal(r.aligned.length,1);
  assert.equal(+r.aligned[0].gap.toFixed(1),2.5);
});
test("keeps YTD first quarter comparisons empty; does not compare across year resets",()=>{
  assert.equal(A.previousThreeMonths("2026-01"),null);
  assert.equal(A.previousThreeMonths("2026-02"),null);
  assert.equal(A.previousThreeMonths("2026-03"),null);
  assert.equal(A.previousThreeMonths("2026-05"),"2026-02");
  assert.equal(A.previousThreeMonths("2026-08"),"2026-05");
});
test("weights missing data out, requires at least four scored indicators",()=>{
  const d={history:[
    row("retail_ytd","2026-05",2),row("retail_ytd","2026-08",3),
    row("private_investment","2026-05",-5),row("private_investment","2026-08",-2),
    row("real_estate_investment","2026-05",-10),row("real_estate_investment","2026-08",-12),
    row("industrial_profit","2026-08",12),
    row("unemployment","2026-05",5.4),row("unemployment","2026-08",5.0),
    row("income","2026-Q2",4.2)
  ]};
  const r=A.score(d);
  assert.equal(r.anchor,"2026-08");
  assert.equal(r.coverage,75);
  assert.equal(r.assessed,4);
  assert.equal(r.value,64);
  assert.equal(r.trend,"分化或持平");
  assert.equal(r.items.find(x=>x.id==="industrial_profit").points,null);
  assert.equal(r.items.find(x=>x.id==="income").points,null);
  assert.equal(r.items.find(x=>x.id==="unemployment").status,"改善");
});
test("does not return recovery score without enough comparable records",()=>{
  const r=A.score({history:[row("retail_ytd","2026-08",1.1)]});
  assert.equal(r.value,null);
  assert.equal(r.eligible,false);
  assert.equal(r.assessed,0);
});
test("FMCG suggestions do not require distributor private data and do not invent statistics",()=>{
  const r=A.advisory({history:[
    row("retail_ytd","2026-08",1.1),row("guangzhou_retail","2026-08",2.7),
    row("guangzhou_catering","2026-08",4.9),
    row("private_investment","2026-08",-10.1)
  ]});
  assert.equal(r.length,3);
  assert.match(r[0].evidence,/1.6个百分点/);
  assert.match(r[1].action,/复购/);
});
