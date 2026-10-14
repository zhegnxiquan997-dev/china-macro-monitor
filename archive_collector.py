"""国家统计局长期监测：2000年起的可用官方历史数据 + 新数据增量更新。

新版发布库是网站接口，并非承诺稳定的官方公开API。
系统不杜撰未发布数据，也不将抓取日期误认作官方发布日期。
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import logging
import math
import os
import pathlib
import re
import time
from collections import defaultdict
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

ROOT = pathlib.Path(__file__).resolve().parent
BASE = "https://data.stats.gov.cn/dg/website"
HOME = BASE + "/page.html#/pc/national/home"
API = BASE + "/publicrelease/web/external/stream/esData"
LOG = logging.getLogger("macro")
PERIOD_RE = re.compile(r"^20\d{2}(?:-(?:0[1-9]|1[0-2])|-Q[1-4])?$")
MONTH_CODE_RE = re.compile(r"^(20\d{2})(0[1-9]|1[0-2])(?:MM)?$")
TIME_ZONE = ZoneInfo("Asia/Shanghai")


def stamp():
    return dt.datetime.now(TIME_ZONE).isoformat(timespec="seconds")


def read_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        val = float(str(value).replace(",", "").strip())
        return val if math.isfinite(val) and -1e10 < val < 1e12 else None
    except (ValueError, TypeError):
        return None


def parse_period(raw):
    value = str(raw).strip()
    match = MONTH_CODE_RE.match(value)
    if match:
        return match.group(1) + "-" + match.group(2)
    if re.fullmatch(r"20\d{2}(?:YY|A)", value):
        return value[:4]
    return None


def source_is_official(url):
    try:
        parsed = urlparse(url)
        host = parsed.hostname or ""
        return parsed.scheme == "https" and (
            host == "gov.cn" or host.endswith(".gov.cn")
        )
    except ValueError:
        return False


def parse_api_response(result, metric, fetched_at):
    """Only accept explicit matching UUID and explicitly dated observations."""
    data = result.get("data") or []
    if isinstance(data, dict):
        data = data.get("data") or data.get("rows") or []
    if not isinstance(data, list):
        return []
    target_uuid = metric["code"].split(":", 1)[1].lower()
    out = []
    for point in data:
        if not isinstance(point, dict):
            continue
        period = parse_period(point.get("code", ""))
        if not period or int(period[:4]) < metric["start_year"]:
            continue
        for item in point.get("values") or []:
            if not isinstance(item, dict):
                continue
            returned_id = str(item.get("_id") or item.get("indic_id") or "").lower()
            if returned_id and returned_id != target_uuid:
                continue
            val = number(item.get("value"))
            if val is None:
                continue
            out.append({
                "indicator_id": metric["id"],
                "period": period,
                "value": val,
                "unit": metric["unit"],
                "frequency": metric["frequency"],
                "kind": metric["kind"],
                "source_url": "https://data.stats.gov.cn/",
                "source_title": "国家统计局·国家数据发布库",
                "source_indicator": metric["code"],
                "official_release_date": None,
                "release_date_status": "未由发布库接口提供",
                "retrieved_at": fetched_at,
                "method": "nbs_new_release_api",
            })
    # Repeat response rows can occur for some dimensions; only retain unique points.
    by_date = {}
    for row in out:
        by_date[row["period"]] = row
    return list(by_date.values())


def setup_session():
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry

    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36",
        "Referer": HOME,
        "Accept": "application/json, text/plain, */*",
    })
    retries = Retry(total=2, backoff_factor=1.2, status_forcelist=[429, 500, 502, 503, 504],
                    allowed_methods=["GET", "POST"])
    s.mount("https://", HTTPAdapter(max_retries=retries))
    s.verify = os.getenv("NBS_VERIFY_TLS", "1") != "0"
    return s


def fetch_year(session, metric, year, fetched_at):
    cid, indicator = metric["code"].split(":")
    annual = metric["frequency"] == "annual"
    request = {
        "cid": cid,
        "indicatorIds": [indicator],
        "daCatalogId": "",
        "das": [{"text": "全国", "value": "000000000000"}],
        "showType": "1",
        "dts": [f"{year}YY-{year}YY"] if annual else [f"{year}01MM-{year}12MM"],
        "rootId": "" if annual else "fc982599aa684be7969d7b90b1bd0e84",
    }
    response = session.post(API, json=request, timeout=25, headers={
        "Content-Type": "application/json;charset=UTF-8"
    })
    response.raise_for_status()
    parsed = response.json()
    if not isinstance(parsed, dict):
        raise RuntimeError("unexpected official JSON type")
    if parsed.get("state") not in (20000, "20000", None) or parsed.get("success") is False:
        raise RuntimeError(f"NBS API rejected request: {parsed.get('state')} {parsed.get('message')}")
    return parse_api_response(parsed, metric, fetched_at)


def from_official_csv(catalog, fetched_at):
    path = ROOT / "data" / "official_import.csv"
    if not path.exists():
        return []
    valid = {m["id"]: m for m in catalog}
    rows = []
    with path.open(encoding="utf-8-sig", newline="") as stream:
        for line, row in enumerate(csv.DictReader(stream), 2):
            mid = (row.get("indicator_id") or "").strip()
            if not mid:
                continue
            if mid not in valid:
                LOG.warning("CSV row %d unknown indicator %s", line, mid)
                continue
            period = (row.get("period") or "").strip()
            value = number(row.get("value"))
            url = (row.get("source_url") or "").strip()
            publication = (row.get("published_at") or "").strip()
            if not PERIOD_RE.match(period) or value is None or not source_is_official(url):
                LOG.warning("CSV row %d failed official provenance validation", line)
                continue
            if publication:
                try:
                    dt.date.fromisoformat(publication[:10])
                except ValueError:
                    LOG.warning("CSV row %d has invalid publication date", line)
                    continue
            if int(period[:4]) < valid[mid]["start_year"]:
                LOG.warning("CSV row %d precedes official comparable-series start", line)
                continue
            rows.append({
                "indicator_id": mid,
                "period": period,
                "value": value,
                "unit": valid[mid]["unit"],
                "frequency": valid[mid]["frequency"],
                "kind": valid[mid]["kind"],
                "source_url": url,
                "source_title": row.get("source_title") or "官方发布",
                "source_indicator": "",
                "official_release_date": publication[:10] or None,
                "release_date_status": "已核验官方公报" if publication else "未核实",
                "retrieved_at": fetched_at,
                "method": "official_release_manual_import",
            })
    return rows


def merge_records(existing, incoming):
    """Immutable first-seen observations + value revisions by (metric, period)."""
    archive = [dict(row) for row in existing]
    by_key = defaultdict(list)
    for row in archive:
        by_key[(row["indicator_id"], row["period"])].append(row)
    changes = 0
    for row in incoming:
        key = row["indicator_id"], row["period"]
        versions = by_key[key]
        previous = versions[-1] if versions else None
        if previous and previous.get("value") == row["value"]:
            # A later identified publication date supplements existing metadata,
            # without manufacturing a new numeric revision.
            if not previous.get("official_release_date") and row.get("official_release_date"):
                previous["official_release_date"] = row["official_release_date"]
                previous["release_date_status"] = row["release_date_status"]
                previous["source_url"] = row["source_url"]
                previous["source_title"] = row["source_title"]
            continue
        item = dict(row)
        item["version"] = len(versions) + 1
        item["first_observed_at"] = row["retrieved_at"]
        archive.append(item)
        versions.append(item)
        changes += 1
    archive.sort(key=lambda v: (v["indicator_id"], v["period"], v.get("version", 1)))
    return archive, changes


def build_site(catalog, archive, statuses, updated_at, full):
    latest_period = {}
    records = {}
    revisions = defaultdict(list)
    for row in archive:
        key = (row["indicator_id"], row["period"])
        records[key] = row
        revisions[key].append(row)
    for (mid, period), row in records.items():
        if mid not in latest_period or period > latest_period[mid]["period"]:
            latest_period[mid] = row
    coverage = {}
    for metric in catalog:
        id_ = metric["id"]
        rs = sorted((r for (m, _), r in records.items() if m == id_), key=lambda r: r["period"])
        coverage[id_] = {
            "first_period": rs[0]["period"] if rs else None,
            "last_period": rs[-1]["period"] if rs else None,
            "unique_periods": len(rs),
            "versions": sum(1 for r in archive if r["indicator_id"] == id_),
            "status": statuses.get(id_, {}).get("status", "waiting"),
            "last_error": statuses.get(id_, {}).get("last_error"),
        }
    payload = {
        "schema_version": 2,
        "generated_at": updated_at,
        "history_start_year": 2000,
        "indicators": catalog,
        "latest": latest_period,
        "history": sorted(records.values(), key=lambda r: (r["indicator_id"], r["period"])),
        "revisions": {f"{k[0]}|{k[1]}": v for k, v in revisions.items() if len(v) > 1},
        "coverage": coverage,
        "run_status": statuses,
        "data_count": len(records),
        "archive_versions": len(archive),
        "full_backfill_this_run": full,
        "description": "发布日和统计期分开。历史官方发布日未知时留空，不用抓取日冒充。",
    }
    write_json(ROOT / "docs" / "data.json", payload)


def run(full_requested):
    now = stamp()
    cfg = read_json(ROOT / "indicators.json", {"indicators": []})
    catalog = cfg["indicators"]
    archive_path = ROOT / "data" / "observations.json"
    archive = read_json(archive_path, [])
    state_path = ROOT / "data" / "collector_state.json"
    state = read_json(state_path, {"full_backfill_attempted": False, "status": {}})
    full = full_requested or not state.get("full_backfill_attempted", False)
    current_year = dt.datetime.now(TIME_ZONE).year
    statuses = {}
    incoming = []
    try:
        session = setup_session()
        warm = session.get(HOME.split("#")[0], timeout=20)
        LOG.info("NBS session warm-up HTTP %s", warm.status_code)
    except Exception as error:
        LOG.warning("NBS warm-up unavailable: %s", error)
        session = None

    for metric in catalog:
        mid = metric["id"]
        if metric["source"] != "nbs_api":
            statuses[mid] = {"status": "official_release_import_pending",
                             "last_error": None, "checked_at": now}
            continue
        newly_added = not any(r["indicator_id"] == mid for r in archive)
        years = range(metric["start_year"], current_year + 1) if (full or newly_added) else range(
            max(metric["start_year"], current_year - 2), current_year + 1
        )
        seen = 0
        checked = 0
        error_msg = None
        for year in years:
            if not session:
                error_msg = "国家统计局连接不可用"
                break
            try:
                rows = fetch_year(session, metric, year, now)
                incoming.extend(rows)
                checked += 1
                seen += len(rows)
                if checked % 10 == 0:
                    LOG.info("%s historical progress: %d years", mid, checked)
                time.sleep(0.12)
            except Exception as error:
                error_msg = f"{type(error).__name__}: {str(error)[:220]}"
                LOG.warning("%s %d failure: %s", mid, year, error_msg)
                # One failure must not crash the entire monitor, but a
                # repeatedly blocked endpoint should not generate hundreds
                # of identical retries.
                if checked == 0:
                    break
        statuses[mid] = {
            "status": "ok" if seen else ("partial" if checked else "fetch_failed"),
            "last_error": error_msg,
            "checked_years": checked,
            "fetched_observations": seen,
            "checked_at": now,
        }
    from_csv = from_official_csv(catalog, now)
    incoming.extend(from_csv)
    archive, new = merge_records(archive, incoming)
    write_json(archive_path, archive)
    state["full_backfill_attempted"] = state.get("full_backfill_attempted") or full
    state["last_run"] = now
    state["last_new_records"] = new
    state["status"] = statuses
    write_json(state_path, state)
    build_site(catalog, archive, statuses, now, full)
    LOG.info("Done. Added %d record versions, total archive %d, official manual rows %d",
             new, len(archive), len(from_csv))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--backfill", action="store_true", help="force recheck earliest available year onward")
    args = parser.parse_args()
    run(args.backfill)
