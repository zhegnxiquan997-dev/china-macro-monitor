import unittest
from release_scraper import parse_article, period_from_title, parse_publication_date, trusted
CFG={
 "industrial_profit":{"id":"industrial_profit","start_year":2000,"frequency":"monthly","unit":"%","kind":"ytd_yoy"},
 "real_estate_sales":{"id":"real_estate_sales","start_year":2000,"frequency":"monthly","unit":"%","kind":"ytd_yoy"},
 "services":{"id":"services","start_year":2023,"frequency":"monthly","unit":"%","kind":"ytd_yoy"},
 "catering":{"id":"catering","start_year":2000,"frequency":"monthly","unit":"%","kind":"ytd_yoy"},
 "income":{"id":"income","start_year":2013,"frequency":"quarterly","unit":"%","kind":"ytd_real_yoy"},
 "guangzhou_retail":{"id":"guangzhou_retail","start_year":2000,"frequency":"monthly","unit":"%","kind":"ytd_yoy"},
 "guangzhou_catering":{"id":"guangzhou_catering","start_year":2000,"frequency":"monthly","unit":"%","kind":"ytd_yoy"},
 "guangzhou_private_investment":{"id":"guangzhou_private_investment","start_year":2012,"frequency":"monthly","unit":"%","kind":"ytd_yoy"},
}
STAMP="2026-10-14T21:10:00+08:00"

def html(title,body,date="2026-09-15"):
 return f'<html><head><title>{title}</title></head><body><h1>{title}</h1><p>发布时间：{date}</p><div class="article">{body}</div></body></html>'

class ReleaseTests(unittest.TestCase):
 def test_income_real_growth_quarterly(self):
  doc=html("2026年上半年居民收入和消费支出情况",
   "上半年，全国居民人均可支配收入22981元，比上年同期名义增长5.2%，扣除价格因素，实际增长4.2%。",
   "2026-07-15")
  rows=parse_article("https://www.stats.gov.cn/sj/zxfbhjd/202607/t20260715_1964129.html",doc,CFG,STAMP)
  self.assertEqual([(r["indicator_id"],r["period"],r["value"],r["official_release_date"]) for r in rows],
    [("income","2026-Q2",4.2,"2026-07-15")])

 def test_profit(self):
  doc=html("2026年1—8月份全国规模以上工业企业利润增长15.7%",
      "1—8月份，全国规模以上工业企业实现利润总额52719.8亿元，同比增长15.7%。",
      "2026-09-28")
  row=parse_article("https://www.stats.gov.cn/zwfwck/sjfb/202609/t20260928_1965425.html",doc,CFG,STAMP)
  self.assertEqual((row[0]["indicator_id"],row[0]["period"],row[0]["value"]),("industrial_profit","2026-08",15.7))

 def test_housing(self):
  doc=html("2026年1—8月份全国房地产市场基本情况",
      "1—8月份，新建商品房销售面积49880万平方米，同比下降12.1%。")
  row=parse_article("https://www.stats.gov.cn/sj/zxfb/202609/t20260915_1965310.html",doc,CFG,STAMP)
  self.assertEqual((row[0]["indicator_id"],row[0]["value"]),("real_estate_sales",-12.1))

 def test_national_catering_prefers_ytd(self):
  doc=html("2026年1—8月份社会消费品零售总额增长1.1%",
       "按消费类型分，1—8月份，商品零售额290203亿元，同比增长1.0%；"
       "餐饮收入37366亿元，增长2.4%。8月份，商品零售额35280亿元，同比增长0.3%；"
       "餐饮收入4544亿元，增长1.1%。")
  rows=parse_article("https://www.stats.gov.cn/sj/zxfb/202609/t20260915_1965311.html",doc,CFG,STAMP)
  self.assertEqual([(r["indicator_id"],r["period"],r["value"]) for r in rows],
                   [("catering","2026-08",2.4)])

 def test_guangzhou(self):
  doc=html("2026年1—8月广州经济运行情况",
      "1—8月，全市实现社会消费品零售总额7434.18亿元，同比增长2.7%。"
      "分消费类型看，商品零售增长2.5%，餐饮收入增长4.9%。"
      "民间投资总体增势平稳，同比增长4.6%。","2026-09-22")
  row=parse_article("https://tjj.gz.gov.cn/stats_newtjyw/sjjd/content/post_11011965.html",doc,CFG,STAMP)
  self.assertEqual({r["indicator_id"]:r["value"] for r in row},{"guangzhou_retail":2.7,
    "guangzhou_catering":4.9,"guangzhou_private_investment":4.6})

 def test_no_fake(self):
  doc=html("2026年1—8月份全国规模以上工业企业利润增长15.7%","2025年利润有变化")
  self.assertEqual(parse_article("https://www.stats.gov.cn/zwfwck/sjfb/202609/a.html",doc,CFG,STAMP),[])
  self.assertFalse(trusted("https://data.stats.gov.cn.evil.com/fake"))
