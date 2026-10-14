import json
import requests

URL = "https://data.stats.gov.cn/dg/website/publicrelease/web/external/query"
TERMS = ["社会消费品零售总额", "民间固定资产投资", "房地产开发投资", "城镇调查失业率", "规模以上工业企业利润", "全国居民人均可支配收入", "餐饮收入"]
s = requests.Session()
s.headers.update({"User-Agent": "Mozilla/5.0", "Referer": "https://data.stats.gov.cn/dg/website/page.html"})
for term in TERMS:
    try:
        resp = s.get(URL, params={"search":term,"pagenum":1,"pageSize":40}, timeout=20)
        data = resp.json()
        d = data.get("data") or {}
        rows = d.get("data") or d.get("list") or []
        print("\nQUERY:", term, "HTTP", resp.status_code, "found", len(rows))
        for row in rows[:24]:
            print(json.dumps({k:row.get(k) for k in ["cid","indic_id","show_name","i_name","type_value","sdate","edate","treeinfo_globalid"]}, ensure_ascii=False))
    except Exception as e:
        print("ERROR",term,type(e).__name__,str(e)[:200])
