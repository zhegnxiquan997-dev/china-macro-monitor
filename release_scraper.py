"""Official press-release importer.

Scrapes only government-hosted originals, records the official publication date,
and never estimates a value from an unrelated metric or missing month.
This is an optional second source alongside the NBS historical data API.
"""
import datetime as dt
import logging
import re
from urllib.parse import urljoin, urlparse
from html import unescape

LOG = logging.getLogger(__name__)
NBS_INDEX = "https://www.stats.gov.cn/sj/zxfb/index.html"
NBS_RUN_INDEX = "https://www.stats.gov.cn/sj/zxfbhjd/index.html"
GZ_INDEX = "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/"
PINNED = [
    "https://www.stats.gov.cn/sj/zxfbhjd/202609/t20260915_1965307.html",
    "https://www.stats.gov.cn/sj/zxfb/202609/t20260915_1965311.html",
    "https://www.stats.gov.cn/sj/zxfb/202609/t20260915_1965310.html",
    "https://www.stats.gov.cn/zwfwck/sjfb/202609/t20260928_1965425.html",
    "https://www.stats.gov.cn/sj/zxfbhjd/202607/t20260715_1964129.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_11011965.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_10971444.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_10914237.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_10873183.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_10829346.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_10779777.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_10736142.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_10602940.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_10563069.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_10515649.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_10456486.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_10415868.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_10364758.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_10318395.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_10276061.html",
    "https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_10234545.html",
]
INDEXES = [NBS_INDEX,NBS_RUN_INDEX,GZ_INDEX]
MONTH = r"(?:1[—–\-－至到])?([1-9]|1[0-2])月(?:份)?"
PERIOD_TITLE = re.compile(r"(20\d{2})年1[—–\-－至到]([1-9]|1[0-2])月")
YEAR_MONTH = re.compile(r"(20\d{2})年([1-9]|1[0-2])月份?")
DATE_RX = [
    re.compile(r"发布时间[:：]?\s*(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})"),
    re.compile(r"发布日期[:：]?\s*(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})"),
    re.compile(r"(?<!\d)(20\d{2})/(\d{1,2})/(\d{1,2})\s+\d{1,2}:\d{2}"),
]
VALUE = r"(?P<direction>增长|下降)(?P<value>\d+(?:\.\d+)?)%"
METRICS = {
    "nbs_profit":("industrial_profit",re.compile(r"全国规模以上工业企业实现利润总额[\d,.]+亿元，同比"+VALUE)),
    "nbs_sales":("real_estate_sales",re.compile(r"新建商品房销售面积[\d,.]+万平方米，同比"+VALUE)),
    "nbs_catering":("catering",re.compile(r"餐饮收入[\d,.]+亿元，(?:同比)?"+VALUE)),
    "nbs_services":("services",re.compile(r"其中服务零售额(?:同比)?"+VALUE)),
    "nbs_income":("income",re.compile(r"全国居民人均可支配收入[^。]{0,160}?扣除价格因素，实际"+VALUE)),
    "gz_retail":("guangzhou_retail",re.compile(r"(?:全市实现|全市|实现)社会消费品零售总额[\d,.]+亿元，同比"+VALUE)),
    "gz_catering":("guangzhou_catering",re.compile(r"(?:分消费类型看，)?商品零售(?:增长|下降)[\d.]+%，餐饮收入"+VALUE)),
    "gz_private":("guangzhou_private_investment",re.compile(r"民间投资(?:总体增势平稳，)?同比"+VALUE)),
}
TOPIC = {
    "nbs_profit":"规模以上工业企业利润",
    "nbs_sales":"房地产市场基本情况",
    "nbs_catering":"社会消费品零售总额",
    "nbs_services":"国民经济运行",
    "nbs_income":"居民收入和消费支出情况",
    "gz_retail":"广州经济运行情况",
    "gz_catering":"广州经济运行情况",
    "gz_private":"广州经济运行情况",
}

def trusted(url):
    x=urlparse(url)
    return x.scheme=="https" and x.hostname in ("www.stats.gov.cn","stats.gov.cn","tjj.gz.gov.cn")

def text_normalize(txt):
    return re.sub(r"[\s\u00a0\u3000]+","",unescape(txt))

def parse_publication_date(page_text):
    for pattern in DATE_RX:
        m=pattern.search(page_text)
        if m:
            try: return dt.date(*map(int,m.groups())).isoformat()
            except ValueError: continue
    return None

def period_from_title(title,body,published):
    m=PERIOD_TITLE.search(title)
    if m:return f"{m.group(1)}-{int(m.group(2)):02d}"
    y=re.search(r"(20\d{2})年",title)
    year=y.group(1) if y else published[:4] if published else None
    if not year:return None
    if any(t in title for t in ("上半年","二季度")):
        return f"{year}-Q2"
    if any(t in title for t in ("前三季度","三季度")):
        return f"{year}-Q3"
    if "一季度" in title:
        return f"{year}-Q1"
    if any(t in title for t in ("全年","年度")):
        return year
    # General economy release headline may say just '8月份国民经济运行'.
    m=PERIOD_TITLE.search(body[:12000])
    if m:return f"{m.group(1)}-{int(m.group(2)):02d}"
    mm=YEAR_MONTH.search(title)
    if mm:return f"{mm.group(1)}-{int(mm.group(2)):02d}"
    # Press conferences often omit the year and lead with "8月份国民经济运行".
    if "国民经济运行" in title and published:
        c=re.search(r"1[—–\-－至到]([1-9]|1[0-2])月份?，社会消费商品和服务零售总额",body)
        if c:return f"{year}-{int(c.group(1)):02d}"
    return None

def parse_article(url,html,catalog,retrieved_at):
    """Excludes article if year/period/headline or verifiable source missing."""
    if not trusted(url):return []
    from bs4 import BeautifulSoup
    soup=BeautifulSoup(html,"html.parser")
    title_el=soup.find("h1")
    h1_text=title_el.get_text(" ",strip=True) if title_el else ""
    title=text_normalize(h1_text or (soup.title.get_text(" ",strip=True) if soup.title else ""))
    text=soup.get_text(" ",strip=True)
    normalized=text_normalize(text)
    released=parse_publication_date(text)
    period=period_from_title(title,normalized,released)
    # Guangzhou quarter headlines describe calendar-year-to-date cumulative results.
    if urlparse(url).hostname=="tjj.gz.gov.cn" and period and re.fullmatch(r"20\d{2}-Q[1-4]",period):
        year,quarter=period.split("-Q")
        period=f"{year}-{int(quarter)*3:02d}"
    if not period:return []
    found=[]
    for key,(mid,pattern) in METRICS.items():
        if TOPIC[key] not in title:continue
        if key.startswith("gz_")!=(urlparse(url).hostname=="tjj.gz.gov.cn"):continue
        metric=catalog.get(mid)
        if metric is None or int(period[:4])<metric["start_year"]:continue
        if metric["frequency"]=="monthly" and not re.match(r"20\d{2}-\d{2}$",period):continue
        if metric["frequency"]=="quarterly" and not re.match(r"20\d{2}-Q[1-4]$",period):continue
        matches=list(pattern.finditer(normalized))
        if not matches:continue
        if len(matches)>1:
            signed=[float(m.group("value"))*(-1 if m.group("direction")=="下降" else 1) for m in matches]
            if len(set(signed)) == 1:
                match=matches[0]  # Repeated mention of the identical official figure.
            elif key == "nbs_catering":
                # National retail release contains both YTD and single-month catering.
                # Use the YTD clause explicitly, never the single-month value.
                month=int(period[-2:])
                marker=re.search(rf"按消费类型分，1[—–\-－至到]{month}月份?，",normalized)
                match=next((m for m in matches if marker and 0<=m.start()-marker.end()<140),None)
                if match is None:continue
            else:
                LOG.warning("Conflicting %s release figures at %s: %s",mid,url,signed)
                continue
        else:
            match=matches[0]
        value=float(match.group("value")) * (-1 if match.group("direction")=="下降" else 1)
        found.append({
            "indicator_id":mid,"period":period,"value":value,
            "unit":metric["unit"],"kind":metric["kind"],"frequency":metric["frequency"],
            "source_url":url,"source_title":title,
            "source_indicator":None,"official_release_date":released,
            "release_date_status":"官方公报页面标注" if released else "原文日期未识别",
            "retrieved_at":retrieved_at,"method":"official_release_scraper",
        })
    return found

def get_candidate_urls(session):
    from bs4 import BeautifulSoup
    candidates=set(PINNED)
    for index in INDEXES:
        try:
            response=session.get(index,timeout=20)
            response.raise_for_status()
            doc=BeautifulSoup(response.content,"html.parser")
            n=0
            for a in doc.select("a[href]"):
                title=text_normalize(a.get_text(" ",strip=True))
                if not any(v in title for v in TOPIC.values()):continue
                target=urljoin(index,a.get("href","")).split("#")[0]
                if not trusted(target):continue
                if not (target.endswith(".html") or "/content/post_" in target):continue
                candidates.add(target);n+=1
                if n>=35:break
        except Exception as error:
            LOG.warning("Official listing failed: %s (%s)",index,type(error).__name__)
    return sorted(candidates)

def collect_official_releases(catalog,retrieved_at,session=None):
    from requests import Session
    session=session or Session()
    session.headers.update({"User-Agent":"Mozilla/5.0 Chrome/125 Safari/537.36",
                            "Referer":"https://www.stats.gov.cn/"})
    mapping={x["id"]:x for x in catalog}
    urls=get_candidate_urls(session)
    results=[]
    scanned=0
    errors=0
    for url in urls[:95]:
        try:
            response=session.get(url,timeout=18)
            response.raise_for_status()
            rows=parse_article(url,response.content,mapping,retrieved_at)
            if url in PINNED:
                from bs4 import BeautifulSoup
                soup=BeautifulSoup(response.content,"html.parser")
                titles=[n.get_text(" ",strip=True)[:140] for n in soup.find_all("h1")[:3]]
                LOG.info("Pinned source diagnostics: url=%s rows=%s title=%r h1=%r body_len=%d sample=%r",
                         url,len(rows),soup.title.get_text(" ",strip=True)[:110] if soup.title else None,
                         titles,len(soup.get_text(" ",strip=True)),soup.get_text(" ",strip=True)[:160])
            results.extend(rows)
            scanned+=1
        except Exception as error:
            errors+=1
            LOG.warning("Release scraping failed %s: %s",url,str(error)[:160])
    # Key includes source URL, so same official value in multiple releases is de-duplicated upstream.
    LOG.info("Official release discovery: scanned=%s failed=%s observations=%s",scanned,errors,len(results))
    return results
