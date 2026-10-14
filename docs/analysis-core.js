/* 经济信号：纯函数，共享于浏览器与 Node 单元测试。 */
(function(root, factory) {
  const api=factory();
  if(typeof module==="object" && module.exports) module.exports=api;
  else root.MacroAnalysis=api;
})(typeof globalThis!=="undefined"?globalThis:this, function() {
  "use strict";
  const PAIRS=[
    {id:"retail",national:"retail_ytd",guangzhou:"guangzhou_retail",label:"社零累计同比",unit:"%",desc:"同为年初至统计月的社零累计同比增速。"},
    {id:"catering",national:"catering",guangzhou:"guangzhou_catering",label:"餐饮收入累计同比",unit:"%",desc:"名义餐饮收入增速，并非调味品终端销量。"},
    {id:"private",national:"private_investment",guangzhou:"guangzhou_private_investment",label:"民间固定资产投资累计同比",unit:"%",desc:"产业结构有差异；增速差不能代表投资规模差。"}
  ];
  const COMPONENTS=[
    {id:"retail_ytd",label:"全国社零累计同比",weight:20,direction:1,threshold:0.3,frequency:"monthly"},
    {id:"private_investment",label:"民间投资累计同比",weight:20,direction:1,threshold:0.5,frequency:"monthly"},
    {id:"real_estate_investment",label:"房地产开发投资累计同比",weight:20,direction:1,threshold:0.5,frequency:"monthly"},
    {id:"industrial_profit",label:"工业利润累计同比",weight:15,direction:1,threshold:1,frequency:"monthly"},
    {id:"unemployment",label:"城镇调查失业率",weight:15,direction:-1,threshold:0.2,frequency:"monthly"},
    {id:"income",label:"居民实际收入增速",weight:10,direction:1,threshold:0.3,frequency:"quarterly"}
  ];
  function validRow(r) {
    return !!r && /^20\d{2}-(0[1-9]|1[0-2]|Q[1-4])$/.test(String(r.period||"")) && Number.isFinite(+r.value);
  }
  function dataByIndicator(data,id) {
    return (data&&data.history||[]).filter(x=>x.indicator_id===id && validRow(x)).sort((a,b)=>a.period.localeCompare(b.period));
  }
  function latestCommon(data,pair) {
    const a=new Map(dataByIndicator(data,pair.national).filter(x=>/^\d{4}-\d{2}$/.test(x.period)).map(r=>[r.period,r]));
    const b=new Map(dataByIndicator(data,pair.guangzhou).filter(x=>/^\d{4}-\d{2}$/.test(x.period)).map(r=>[r.period,r]));
    const periods=[...a.keys()].filter(p=>b.has(p)).sort();
    return {periods,aligned:periods.map(p=>({period:p,national:+a.get(p).value,guangzhou:+b.get(p).value,
      nRef:a.get(p),gRef:b.get(p),gap:+b.get(p).value-(+a.get(p).value)}))};
  }
  function previousThreeMonths(period) {
    const m=/^(20\d{2})-(0[1-9]|1[0-2])$/.exec(period||"");
    if(!m || +m[2]<=3)return null;
    return m[1]+"-"+String(+m[2]-3).padStart(2,"0");
  }
  function previousQuarter(period) {
    const m=/^(20\d{2})-Q([1-4])$/.exec(period||"");
    return (!m || +m[2]<=1)?null:m[1]+"-Q"+(+m[2]-1);
  }
  function score(data) {
    const retail=dataByIndicator(data,"retail_ytd");
    const anchor=retail.length?retail[retail.length-1].period:null;
    const m=/^(20\d{2})-(0[1-9]|1[0-2])$/.exec(anchor||"");
    let weightUsed=0,weighted=0,assessed=0;
    const items=COMPONENTS.map(spec=>{
      const map=new Map(dataByIndicator(data,spec.id).map(x=>[x.period,x]));
      const candidates=spec.frequency==="quarterly" && m?[...map.keys()].filter(p=>p.startsWith(m[1]+"-Q") && +p.slice(-1)<=Math.ceil(+m[2]/3)).sort():[];
      const nowPeriod=spec.frequency==="quarterly"?candidates.at(-1)||null:anchor;
      const beforePeriod=nowPeriod?(spec.frequency==="quarterly"?previousQuarter(nowPeriod):previousThreeMonths(nowPeriod)):null;
      const now=nowPeriod&&map.get(nowPeriod),before=beforePeriod&&map.get(beforePeriod);
      if(!now || !before) return {...spec,status:"未计分",nowPeriod,nowValue:now?+now.value:null,
        beforePeriod,beforeValue:before?+before.value:null,delta:null,points:null,
        reason:!now?"缺少当前对应统计期":!beforePeriod?"年初不足三个月，不跨年比较累计增速":"缺少精确的比较基准期"};
      const rawDelta=(+now.value)-(+before.value);
      const delta=rawDelta*spec.direction;
      const status=delta>=spec.threshold-1e-8?"改善":delta<=-spec.threshold+1e-8?"走弱":"基本持平";
      const points=status==="改善"?80:status==="走弱"?20:50;
      weightUsed+=spec.weight;weighted+=spec.weight*points;assessed++;
      return {...spec,status,nowPeriod,beforePeriod,nowValue:+now.value,beforeValue:+before.value,delta:rawDelta,points,reason:null};
    });
    const eligible=weightUsed>=70&&assessed>=4;
    const value=eligible?Math.round(weighted/weightUsed):null;
    return {anchor,baseline:previousThreeMonths(anchor),items,coverage:weightUsed,assessed,value,eligible,
      trend:value===null?"数据不足":value>=65?"边际改善":value>=40?"分化或持平":"边际走弱",
      method:"3个月前至当前同口径数据的变化（季度收入用同年上季度）。方向改善记80，基本持平50，走弱20。缺项不计分，显示已覆盖权重；不足70%或少于4项不计算。属于分析规则，不是官方复苏指数。"};
  }
  function latest(data,id){const s=dataByIndicator(data,id);return s.length?s[s.length-1]:null;}
  function advisory(data){
    const out=[];
    const retail=latestCommon(data,PAIRS[0]).aligned.at(-1);
    const gzCatering=latest(data,"guangzhou_catering");
    const investment=latest(data,"private_investment");
    const estate=latest(data,"real_estate_investment");
    function str(x){return (+x).toFixed(1)+"%";}
    if(retail)out.push({title:"广州消费表现相对全国",evidence:retail.period+"广州累计社零 "+str(retail.guangzhou)+"，全国 "+str(retail.national)+"，相差 "+retail.gap.toFixed(1)+"个百分点。",
      reading:retail.gap>1?"广州增速相对较高，但不能由此推断各渠道都在增长。":retail.gap< -1?"广州增速相对较低，仍要排查终端结构和同店动销。":"广州和全国社零累计同比相近，细分渠道需求仍需独立检验。",
      action:"按片区、渠道比较同店动销、有效门店数及核心SKU价盘；不要把经销商进货当成消费者购买。",
      kpis:"同店动销同比 / 有效覆盖终端 / 核心SKU实际成交价"});
    if(gzCatering){
      const rows=dataByIndicator(data,"guangzhou_catering").filter(x=>x.period.slice(0,4)===gzCatering.period.slice(0,4));
      const change=rows.length>=2?(+rows[rows.length-1].value)-(+rows[0].value):null;
      out.push({title:"餐饮二批与产品结构",evidence:gzCatering.period+"广州餐饮累计同比 "+str(gzCatering.value)+(change===null?"":"；较当年最早记录变动 "+change.toFixed(1)+"个百分点。"),
        reading:change!==null&&change<-0.6?"餐饮累计增速放缓，但不等同于调味品采购量下降。":"餐饮收入增速与调味品品类需求不是一一对应关系。",
        action:"分别追踪社会餐饮、食堂和餐饮二批，按复购、单店动销和毛利筛选料酒、蚝油、鸡粉推广方案。",
        kpis:"餐饮终端复购率 / 料酒蚝油单店动销 / 促销费用效率"});
    }
    if(investment)out.push({title:"经销商库存和资金周转",evidence:investment.period+"全国民间投资累计同比 "+str(investment.value)+"。",
      reading:investment.value<0?"投资偏谨慎属于宏观风险线索，不能代替客户自身财务审计。":"投资数据改善也不代表经销商资金压力同步解除。",
      action:"对高库存客户建立库存倍数、账龄和连续三个月终端动销联动预警，避免单纯压货换取短期提货达成。",
      kpis:"经销商库存倍数 / 应收账款账龄 / 终端真实动销"});
    if(estate)out.push({title:"房地产与社区终端",evidence:estate.period+"房地产开发投资累计同比 "+str(estate.value)+"。",
      reading:"房地产变化可能影响住房相关消费预期和社区客流，但不能直接推出调味品销量变化。",
      action:"对新老社区、商超、批发市场采用可比门店口径，识别终端转移和商品结构变化。",
      kpis:"社区可比终端动销 / 活跃终端净增 / 缺品SKU数量"});
    return out;
  }
  return {PAIRS,COMPONENTS,dataByIndicator,latestCommon,previousThreeMonths,score,latest,advisory};
});
