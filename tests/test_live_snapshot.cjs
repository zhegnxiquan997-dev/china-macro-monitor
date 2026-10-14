"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const A=require("../docs/analysis-core.js");
const data=JSON.parse(fs.readFileSync("docs/data.json","utf8"));
test("score and nationwide-Guangzhou comparisons work against current archived official data",()=>{
  const model=A.score(data);
  const comp=A.latestCommon(data,A.PAIRS[0]);
  assert.ok(data.history.length>1000,"historical observations are present");
  assert.ok(model.coverage>=0 && model.coverage<=100);
  assert.ok(model.value===null||(model.value>=0&&model.value<=100));
  assert.ok(comp.aligned.every((r,i)=>i===0||comp.aligned[i-1].period<r.period));
  assert.ok(comp.aligned.every(r=>Math.abs((r.guangzhou-r.national)-r.gap)<1e-8));
  console.log(JSON.stringify({
    official_observations:data.data_count,
    latest_month:model.anchor,
    signal_score:model.value,
    assessed_weight:model.coverage,
    assessed_components:model.assessed,
    signal:model.trend,
    comparable_retail_months:comp.aligned.length,
    retail_latest_comparison:comp.aligned.at(-1)&&{
      period:comp.aligned.at(-1).period,
      national:comp.aligned.at(-1).national,
      guangzhou:comp.aligned.at(-1).guangzhou,
      gap:comp.aligned.at(-1).gap
    }
  }));
});
