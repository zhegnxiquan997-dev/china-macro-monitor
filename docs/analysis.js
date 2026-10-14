/* 比较和复苏信号：仅使用已归档官方统计记录。 */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const A=window.MacroAnalysis;
let dataset=null,pairId="retail",fromYear=2000,toYear=new Date().getFullYear(),comparison=[];
const esc=value=>String(value===null||value===undefined?"":value).replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const fmt=value=>Number.isFinite(+value)?(+value).toLocaleString("zh-CN",{maximumFractionDigits:2}):"—";
const signed=x=>(+x>=0?"+":"")+(+x).toFixed(1);
function officialLink(row){
  const url=row&&row.source_url||"";
  try{const u=new URL(url);if(u.protocol==="https:"&&(u.hostname==="gov.cn"||u.hostname.endsWith(".gov.cn")))
    return '<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">官方原文 ↗</a>';}
  catch(e){}
  return "—";
}
function yearOptions(select,years,value){
  select.innerHTML=years.map(y=>'<option value="'+y+'">'+y+'</option>').join("");
  select.value=String(value);
}
function load(){
  fetch("./data.json?ver="+Date.now(),{cache:"no-store"})
    .then(r=>{if(!r.ok)throw Error("数据文件 HTTP "+r.status);return r.json()})
    .then(d=>{if(d.schema_version<2||!Array.isArray(d.history))throw Error("历史数据库结构不支持");dataset=d;init()})
    .catch(e=>{$("analysisLoading").textContent="历史数据尚未就绪："+e.message+"。可先访问GitHub Actions确认自动采集是否运行。"});
}
function init(){
  $("analysisLoading").hidden=true;$("analysisMain").hidden=false;
  $("analysisUpdated").textContent="最近生成："+(dataset.generated_at||"未知")+"；已入库统计期："+fmt(dataset.data_count||0)+"，版本存档："+fmt(dataset.archive_versions||0)+"。";
  $("compareIndicator").innerHTML=A.PAIRS.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.label)+'</option>').join("");
  const maxYear=+((A.latest(dataset,"retail_ytd")||{}).period||"2026").slice(0,4);
  const years=Array.from({length:Math.max(1,maxYear-1999)},(_,i)=>2000+i);
  fromYear=Math.max(2000,maxYear-1);toYear=maxYear;
  yearOptions($("compareStartYear"),years,fromYear);
  yearOptions($("compareEndYear"),years,toYear);
  $("compareIndicator").addEventListener("change",e=>{pairId=e.target.value;drawCompare()});
  $("compareStartYear").addEventListener("change",e=>{fromYear=+e.target.value;
    if(fromYear>toYear){toYear=fromYear;$("compareEndYear").value=String(toYear)}drawCompare()});
  $("compareEndYear").addEventListener("change",e=>{toYear=+e.target.value;
    if(toYear<fromYear){fromYear=toYear;$("compareStartYear").value=String(fromYear)}drawCompare()});
  $("compareExport").addEventListener("click",exportCsv);
  drawScore();drawCompare();drawAdvice();
}
function drawScore(){
  const r=A.score(dataset);
  $("scoreValue").textContent=r.value===null?"—":r.value;
  $("scoreSignal").textContent=r.trend;
  $("scoreAnchor").textContent=r.anchor?"锚点："+r.anchor+"（与同年3个月前比较）":"缺少全国社零月度数据";
  $("scoreTrack").style.width=(r.value===null?0:r.value)+"%";
  $("scoreExplain").textContent=r.eligible?
    "有足够的可比样本，得分只表示所选指标最近3个月的边际方向。":
    "可用的时间序列或比较基准不足，当前不计算复苏评分。";
  $("scoreCoverage").textContent="参与计分："+r.assessed+"/"+r.items.length+"项；有效权重："+r.coverage+"/100（权重缺失时不按0分处理）";
  const rows=r.items.map(x=>{
    const changed=x.delta===null?"—":signed(x.delta);
    const now=x.nowValue===null?"—":fmt(x.nowValue)+"%";
    const before=x.beforeValue===null?"—":fmt(x.beforeValue)+"%";
    const klass=x.status==="改善"?"good":x.status==="走弱"?"weak":"neutral";
    return '<tr><td>'+esc(x.label)+' <span class="muted">('+x.weight+'%)</span></td>'+
      '<td>'+esc(x.beforePeriod||"—")+' / '+before+'</td>'+
      '<td>'+esc(x.nowPeriod||"—")+' / '+now+'</td>'+
      '<td>'+changed+'</td>'+
      '<td><span class="status '+klass+'" title="'+esc(x.reason||"")+'">'+esc(x.status)+'</span></td>'+
      '<td>'+((x.points===null)?"不参与":x.points+"/100")+'</td></tr>';
  });
  $("scoreBody").innerHTML=rows.join("");
  $("methodDetail").innerHTML=
    '<p><strong>可重复的评分规则：</strong>'+esc(r.method)+'</p>'+
    '<p>权重：社零20%、民间投资20%、房地产开发投资20%、工业利润15%、调查失业率15%、居民实际收入10%。' +
    '判断阈值分别为0.3、0.5、0.5、1.0、0.2、0.3个百分点；就业方向相反。' +
    '得分＝参与指标（权重×80/50/20）之和 ÷ 参与指标权重。数据覆盖低于70%或可比项少于4项时不展示总分。</p>'+
    '<p><strong>重要限制：</strong>累计同比的3个月变化包含基数效应，不等于环比增长；各统计期及发布日期不一定同步。'+
    '该方法不能证明宏观经济已经全面复苏，也不能单独用于交易或投资决策。</p>';
  const ref=A.latest(dataset,"retail_ytd");
  const cn=A.latestCommon(dataset,A.PAIRS[0]).aligned.at(-1);
  $("gzRetailVal").textContent=cn?fmt(cn.guangzhou)+"%":"—";
  $("cnRetailVal").textContent=cn?fmt(cn.national)+"%":"—";
  $("retailGap").textContent=cn?"广州 - 全国："+signed(cn.gap)+" 个百分点":"缺少可比的同统计期记录";
  $("retailGap").className="gap-output "+(!cn?"gap-flat":cn.gap>0?"gap-positive":cn.gap<0?"gap-negative":"gap-flat");
  $("retailCompareDate").textContent=cn?"对照统计期："+cn.period:"等待全国和广州相同月份的累计同比数据";
}
function selectedPair(){return A.PAIRS.find(p=>p.id===pairId)||A.PAIRS[0]}
function chartSVG(rows) {
  if(rows.length===0)return '<div class="chart-empty">这个指标暂时没有全国与广州同时公布的数据。不会补零、插值或制造趋势线。</div>';
  const W=1000,H=345,p={top:22,bottom:45,left:65,right:25};
  const v=rows.flatMap(r=>[r.national,r.guangzhou]);
  let lo=Math.min(...v),hi=Math.max(...v),range=Math.max(hi-lo,1);
  lo-=range*.12;hi+=range*.12;
  function dateNumber(d){return +d.slice(0,4)+(+d.slice(5,7)-.5)/12}
  let x0=dateNumber(rows[0].period),x1=dateNumber(rows[rows.length-1].period);
  function x(r){return p.left+(dateNumber(r.period)-x0)/Math.max(.00001,x1-x0)*(W-p.left-p.right)}
  function y(value){return H-p.bottom-(value-lo)/(hi-lo)*(H-p.top-p.bottom)}
  const grid=Array.from({length:5},(_,i)=>{
    const py=p.top+(H-p.top-p.bottom)*i/4,pyValue=hi-(hi-lo)*i/4;
    return '<line x1="'+p.left+'" x2="'+(W-p.right)+'" y1="'+py+'" y2="'+py+'" stroke="#e6edf4"/>'+
      '<text x="'+(p.left-10)+'" y="'+(py+4)+'" text-anchor="end" fill="#77889c" font-size="12">'+fmt(pyValue)+'</text>';
  }).join("");
  const markers=rows.filter((r,i)=>i===0||i===rows.length-1||i%Math.max(1,Math.ceil(rows.length/8))===0);
  const ticks=markers.map(r=>'<text x="'+x(r)+'" y="'+(H-15)+'" text-anchor="middle" fill="#75889b" font-size="12">'+esc(r.period)+'</text>').join("");
  function pathFor(key) {
    let ds="";
    rows.forEach((r,i)=>{
      const prev=rows[i-1],gap=prev?12*(dateNumber(r.period)-dateNumber(prev.period)):0;
      ds+=(i===0||gap>2?"M":"L")+x(r).toFixed(1)+","+y(r[key]).toFixed(1)+" ";
    });
    return ds;
  }
  function circleFor(key,color) {
    return rows.filter((r,i)=>rows.length<13||i%Math.max(1,Math.ceil(rows.length/15))===0||i===rows.length-1)
      .map(r=>'<circle cx="'+x(r)+'" cy="'+y(r[key])+'" r="3.5" fill="'+color+'"><title>'+
      esc(r.period+"："+(key==="national"?"全国":"广州")+" "+fmt(r[key])+"%")+'</title></circle>').join("");
  }
  if(rows.length===1){
    return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="仅一个共同月份">'+grid+
      '<circle cx="'+(W/2-32)+'" cy="'+y(rows[0].national)+'" r="6" fill="#277bb2"><title>全国 '+fmt(rows[0].national)+'%</title></circle>'+
      '<circle cx="'+(W/2+32)+'" cy="'+y(rows[0].guangzhou)+'" r="6" fill="#c38b53"><title>广州 '+fmt(rows[0].guangzhou)+'%</title></circle>'+
      '<text x="'+W/2+'" y="'+(H-15)+'" text-anchor="middle" fill="#75889b" font-size="12">'+esc(rows[0].period)+'</text></svg>';
  }
  return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="全国与广州同月增速比较">'+grid+
    '<path d="'+pathFor("national")+'" fill="none" stroke="#277bb2" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>'+
    '<path d="'+pathFor("guangzhou")+'" fill="none" stroke="#c38b53" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>'+
    circleFor("national","#277bb2")+circleFor("guangzhou","#c38b53")+ticks+'</svg>';
}
function drawCompare(){
  const pair=selectedPair();
  const all=A.latestCommon(dataset,pair).aligned;
  comparison=all.filter(r=>+r.period.slice(0,4)>=fromYear && +r.period.slice(0,4)<=toYear);
  const notice=pair.desc+" 当前共有 "+all.length+" 个可比较统计期；本次筛选 "+comparison.length+" 期。";
  $("compareNote").textContent=notice;
  $("compareChart").innerHTML=chartSVG(comparison);
  const visible=comparison.slice().reverse();
  $("compareBody").innerHTML=visible.map(r=>'<tr><td>'+esc(r.period)+'</td><td>'+fmt(r.national)+'%</td>'+
      '<td>'+fmt(r.guangzhou)+'%</td><td class="value">'+signed(r.gap)+'个百分点</td>'+
      '<td>'+officialLink(r.nRef)+'</td><td>'+officialLink(r.gRef)+'</td></tr>').join("")||
    '<tr><td colspan="6" class="muted">没有同统计期可对照数据，等待官方发布。</td></tr>';
  $("compareExport").disabled=comparison.length===0;
}
function exportCsv(){
  const pair=selectedPair();
  const records=[["统计期","指标","全国（%）","广州（%）","广州减全国（百分点）","全国来源","广州来源"]];
  for(const row of comparison)records.push([row.period,pair.label,row.national,row.guangzhou,row.gap.toFixed(3),
    row.nRef.source_url||"",row.gRef.source_url||""]);
  const text="\ufeff"+records.map(cols=>cols.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="全国广州_"+pair.id+"_"+fromYear+"-"+toYear+".csv";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),800);
}
function drawAdvice(){
  const cards=A.advisory(dataset);
  $("adviceGrid").innerHTML=cards.map((item,i)=>'<article class="advice-card">'+
    '<h3>'+(i+1)+'. '+esc(item.title)+'</h3>'+
    '<p><strong>官方数据：</strong>'+esc(item.evidence)+'</p>'+
    '<p><strong>经营解读：</strong>'+esc(item.reading)+'</p>'+
    '<p><strong>建议动作：</strong>'+esc(item.action)+'</p>'+
    '<div class="monitor"><strong>建议跟进指标：</strong>'+esc(item.kpis)+'</div>'+
    '</article>').join("")||'<div class="chart-empty">暂无足够的官方数据提供经营研判。</div>';
}
load();
})();
