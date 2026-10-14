"""Official macro monitor: source-verified imports only; no fabricated values."""
import csv,json,datetime,pathlib,urllib.parse
from zoneinfo import ZoneInfo
ROOT=pathlib.Path(__file__).resolve().parent
cfg=json.loads((ROOT/"config.json").read_text(encoding="utf-8"))
allowed={i["id"] for i in cfg["indicators"]}
now=datetime.datetime.now(ZoneInfo("Asia/Shanghai")).isoformat(timespec="seconds")
db=ROOT/"data/observations.json"
old=json.loads(db.read_text(encoding="utf-8")) if db.exists() else []
new=[]
with (ROOT/"data/official_import.csv").open(encoding="utf-8-sig",newline="") as f:
 for row in csv.DictReader(f):
  if not row.get("indicator_id"):continue
  if row["indicator_id"] not in allowed:raise ValueError("Unknown indicator")
  if not row["period"][:4].isdigit():raise ValueError("Bad period")
  row["value"]=float(row["value"])
  if not -1000<=row["value"]<=1000:raise ValueError("Outlier")
  u=urllib.parse.urlparse(row["source_url"])
  if u.scheme!="https" or not u.hostname or not row["source_title"] or not row["published_at"]:raise ValueError("Missing provenance")
  row["fetched_at"]=now
  new.append(row)
keys={(r["indicator_id"],r["period"],r["source_url"],str(r["value"])) for r in old}
for r in new:
 k=(r["indicator_id"],r["period"],r["source_url"],str(r["value"]))
 if k not in keys:old.append(r);keys.add(k)
old.sort(key=lambda r:(r["indicator_id"],r["period"],r["fetched_at"]))
db.write_text(json.dumps(old,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
latest={}
for r in old:
 k=r["indicator_id"]
 if k not in latest or (r["period"],r["fetched_at"])>(latest[k]["period"],latest[k]["fetched_at"]):latest[k]=r
payload={"generated_at":now,"indicators":cfg["indicators"],"latest":latest,"history":old,"data_count":len(old),"automatic_official_collection_enabled":False}
(ROOT/"docs").mkdir(exist_ok=True)
(ROOT/"docs/data.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("Published",len(latest),"indicators; automatic official endpoint not yet configured")
