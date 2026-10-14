import requests,json,time
S=requests.Session();S.headers.update({'User-Agent':'Mozilla/5.0','Referer':'https://data.stats.gov.cn/dg/website/page.html'})
url='https://data.stats.gov.cn/dg/website/publicrelease/web/external/query'
for term in ['商品房销售面积','商品房销售面积累计','规模以上工业企业利润总额','规模以上工业企业利润','餐饮收入','居民人均可支配收入','城镇调查失业率','社会消费品零售总额','民间固定资产投资']:
 try:
  res=S.get(url,params={'search':term,'code':'1','pagenum':1,'pageSize':100},timeout=18)
  obj=res.json();rows=(obj.get('data') or {}).get('data') or []
  print('\n***',term,'HTTP',res.status_code,'type1',len(rows),'***')
  seen=set()
  for r in rows:
   if r.get('type_value')!='1':continue
   key=(r.get('cid'),r.get('indic_id'))
   if key in seen:continue
   seen.add(key)
   print(json.dumps({k:r.get(k) for k in ('show_name','cid','indic_id','sdate','edate','treeinfo_globalid','type_value')},ensure_ascii=False))
   if len(seen)>=18:break
 except Exception as e:print('ERROR',term,repr(e))
 time.sleep(.15)
