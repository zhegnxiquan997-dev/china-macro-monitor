(() => {
"use strict";
const $=id=>document.getElementById(id);
const escapeHTML=(s)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let data=null,selected="retail",yearFrom=2000,yearTo=new Date().getFullYear(),month="all",limit=48;
const format=(x)=>x===null||x===undefined?"—":Number(x).toLocaleString("zh-CN",{maximumFractionDigits:3});
function sourceLink(r){
 if(!r||!/^https:\/\/(?:[a-z0-9-]+\.)*gov\.cn\//i.test(r.source_url||""))return "—";
 return '<a target="_blank" rel="noopener noreferrer" href="'+escapeHTML(r.source_url)+'">官方来源 ↗</a>';
}
function latestMap(){return data?.latest||{};}
function currentMeta(){return (data?.indicators||[]).find(m=>m.id===selected);}
function selectedHistory(){
 return (data?.history||[]).filter(r=>r.indicator_id===selected&&Number(r.period.slice(0,4))>=yearFrom&&Number(r.period.slice(0,4))<=yearTo&&(month==="all"||r.period.endsWith("-"+month))).sort((a,b)=>a.period.localeCompare(b.period));
}
function init(){
 $("stamp").textContent=data.generated_at||"—";
 $("cnt").textContent=format(data.data_count);
 $("archive").textContent=format(data.archive_versions||data.data_count);
 $("start").textContent=data.history_start_year+"";
 $("series").textContent=data.indicators.length+"";
 const exists=data.indicators.find(m=>data.latest?.[m.id]);
 if(exists)selected=exists.id;
 const available=[...new Set(data.indicators.map(x=>x.group||"其它"))];
 $("sidebar").innerHTML=available.map(g=>'<div class="category">'+escapeHTML(g)+'</div>'+data.indicators.filter(x=>x.group===g).map(m=>'<button class="metric" data-id="'+escapeHTML(m.id)+'"><span>'+escapeHTML(m.name)+'</span><i class="dot '+(data.coverage?.[m.id]?.unique_periods?"filled":"")+'"></i></button>').join("")).join("");
 $("sidebar").addEventListener("click",ev=>{const b=ev.target.closest("button[data-id]");if(!b)return;selected=b.dataset.id;limit=48;draw()});
 const maxYear=new Date().getFullYear();for(const name of ["yearFrom","yearTo"]){$(name).innerHTML=Array.from({length:maxYear-1999},(_,i)=>{const y=2000+i;return '<option value="'+y+'">'+y+'</option>'}).join("")}
 $("yearFrom").value=2000;$("yearTo").value=maxYear;
 $("yearFrom").addEventListener("change",e=>{yearFrom=+e.target.value;if(yearFrom>yearTo){yearTo=yearFrom;$("yearTo").value=yearTo}limit=48;draw()});
 $("yearTo").addEventListener("change",e=>{yearTo=+e.target.value;if(yearTo<yearFrom){yearFrom=yearTo;$("yearFrom").value=yearFrom}limit=48;draw()});
 $("month").addEventListener("change",e=>{month=e.target.value;limit=48;draw()});
 $("more").addEventListener("click",()=>{limit+=100;drawTable()});
 $("download").addEventListener("click",downloadCSV);
 draw();
}
function draw(){
 document.querySelectorAll(".metric").forEach(x=>x.classList.toggle("active",x.dataset.id===selected));
 let m=currentMeta(),rows=selectedHistory(),latest=latestMap()[selected],cov=data.coverage?.[selected]||{};
 $("metricName").textContent=m.name;
 $("category").textContent=m.group+" / "+(m.frequency==="monthly"?"月度":m.frequency==="quarterly"?"季度":"年度")+" / "+m.kind;
 $("headlineValue").textContent=latest?format(latest.value)+" "+m.unit:"暂无已核实数据";
 $("headlinePeriod").textContent=latest?"最近统计期："+latest.period:"该指标尚未取得可核验官方数据";
 $("headlineSource").innerHTML=latest?sourceLink(latest):"";
 $("metricNote").textContent=m.note||"";
 $("firstPeriod").textContent=cov.first_period||"—";
 $("lastPeriod").textContent=cov.last_period||"—";
 $("observed").textContent=format(cov.unique_periods||0);
 $("sourceType").textContent=m.source==="nbs_api"?"国家统计局新版数据接口":data.coverage?.[selected]?.unique_periods?"官方公报（已核验入库）":"官方公报（待接入）";
 let status=data.run_status?.[selected];
 $("warning").textContent= status?.last_error?"本次抓取异常："+status.last_error:(rows.length?"历史数据来源可追溯；旧数据的最初发布日期可能尚未核实。":"当前缺少该指标的可核验历史记录；不会用估算值填充。");
 $("coverageText").textContent="配置可回溯至："+m.start_year+"年；实际已入库："+(cov.first_period||"暂无")+" 至 "+(cov.last_period||"暂无")+"。";
 $("coverageBar").style.width=(cov.unique_periods?Math.min(100,100*cov.unique_periods/(Math.max(1,(new Date().getFullYear()-m.start_year+1)*(m.frequency==="monthly"?12:m.frequency==="quarterly"?4:1)))):0)+"%";
 $("tableTitle").textContent=m.name+" · 历史明细";
 $("rowHint").textContent="当前筛选共 "+rows.length+" 期";
 renderChart(rows,m);
 drawTable();
}
function numericX(period){
 const m=period.match(/^(\d{4})(?:-(\d{2})|-Q(\d))?$/);
 if(!m)return 0;return +m[1]+(m[2]?(+m[2]-.5)/12:m[3]?(+m[3]-.5)/4:.5);
}
function renderChart(rows,m){
 const el=$("chart");
 if(!rows.length){el.innerHTML='<div class="noData">暂无可以绘制的官方历史数据。历史年份不会用0填补。</div>';return}
 const W=960,H=315,pad={l:66,r:25,t:20,b:44},v=rows.map(r=>Number(r.value));
 let ymin=Math.min(...v),ymax=Math.max(...v);const span=Math.max(ymax-ymin,1);ymin-=span*.12;ymax+=span*.12;
 const x0=Math.min(...rows.map(r=>numericX(r.period))),x1=Math.max(...rows.map(r=>numericX(r.period)));
 const xx=r=>pad.l+(numericX(r.period)-x0)/Math.max(.0001,x1-x0)*(W-pad.l-pad.r);
 const yy=r=>H-pad.b-(r.value-ymin)/(ymax-ymin)*(H-pad.t-pad.b);
 const grid=Array.from({length:5},(_,i)=>{let y=pad.t+(H-pad.t-pad.b)*i/4,val=ymax-(ymax-ymin)*i/4;return '<line x1="'+pad.l+'" x2="'+(W-pad.r)+'" y1="'+y+'" y2="'+y+'" stroke="#e9eff5"/><text x="'+(pad.l-9)+'" y="'+(y+4)+'" font-size="12" fill="#8290a1" text-anchor="end">'+format(val)+'</text>'}).join("");
 const step=m.frequency==="monthly"?1/12:m.frequency==="quarterly"?1/4:1;
 let d="";rows.forEach((r,i)=>{const prev=rows[i-1]; const gap=prev?numericX(r.period)-numericX(prev.period):0;d+=(i===0||gap>step*2.4?"M":"L")+xx(r).toFixed(2)+","+yy(r).toFixed(2)+" "});
 let xticks=[];let low=Math.ceil(x0),high=Math.floor(x1),stride=Math.max(1,Math.ceil((high-low)/7));for(let y=low;y<=high;y+=stride)xticks.push(y);
 const xs=xticks.map(y=>{let x=pad.l+(y-x0)/Math.max(.0001,x1-x0)*(W-pad.l-pad.r);return '<text x="'+x+'" y="'+(H-14)+'" text-anchor="middle" fill="#8290a1" font-size="12">'+y+'</text>'}).join("");
 const circles=rows.map((r,i)=>i%Math.max(1,Math.ceil(rows.length/100))===0?'<circle cx="'+xx(r)+'" cy="'+yy(r)+'" r="3" fill="#19749c"><title>'+escapeHTML(r.period+"："+format(r.value)+" "+m.unit)+'</title></circle>':"").join("");
 el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+escapeHTML(m.name)+'历史趋势">'+grid+'<path d="'+d+'" fill="none" stroke="#19749c" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>'+circles+xs+'</svg>';
}
function drawTable(){
 let m=currentMeta(),rows=selectedHistory().reverse(); const show=rows.slice(0,limit);
 $("tbody").innerHTML=show.map(r=>{
 const key=r.indicator_id+"|"+r.period,vs=data.revisions?.[key]||[];
 const date=r.official_release_date||"未核实";
 const rev=vs.length>1?'<span class="badge">修订'+vs.length+'版</span>':(r.version>1?'<span class="badge">第'+r.version+'版</span>':"—");
 return '<tr><td>'+escapeHTML(r.period)+'</td><td class="value">'+format(r.value)+" "+escapeHTML(m.unit)+'</td><td>'+escapeHTML(date)+'</td><td>'+escapeHTML(r.kind||m.kind)+'</td><td>'+rev+'</td><td>'+sourceLink(r)+'</td><td title="'+escapeHTML(r.retrieved_at||"")+'">'+escapeHTML((r.retrieved_at||"").slice(0,10))+'</td></tr>'
 }).join("")||'<tr><td colspan="7" class="noData">该筛选范围没有已核验数据</td></tr>';
 $("more").disabled=rows.length<=limit;$("showing").textContent="显示 "+Math.min(limit,rows.length)+" / "+rows.length+" 期";
}
function downloadCSV(){
 const m=currentMeta(),rows=selectedHistory();
 const hdr=["指标","统计期","数值","单位","统计口径","官方发布日期","来源","抓取日期","修订版本"];
 const lines=[hdr,...rows.map(r=>[m.name,r.period,r.value,m.unit,r.kind||m.kind,r.official_release_date||"",r.source_url||"",r.retrieved_at||"",r.version||1])];
 const csv="\ufeff"+lines.map(row=>row.map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(",")).join("\r\n");
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),link=document.createElement("a"),url=URL.createObjectURL(blob);
 link.href=url;link.download="中国经济_"+selected+"_"+yearFrom+"-"+yearTo+".csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),500);
}
fetch("./data.json?ts="+Math.floor(Date.now()/300000)).then(r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json()}).then(v=>{data=v;if(!data.schema_version||data.schema_version<2)throw Error("新历史数据尚未生成");init()}).catch(err=>{$("loading").textContent="数据尚未生成或更新中："+err.message+"。请查看GitHub Actions运行情况。"});
})();