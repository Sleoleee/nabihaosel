from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from utils.db import get_client
from utils.calculations import CHANNEL_NAMES

router = APIRouter()

MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]


def _int(val):
    return int(val) if val and val != "all" else None

def _str(val):
    return val if val and val != "all" else None


@router.get("/leaderboard")
def leaderboard(year: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    db = get_client()
    rows = db.rpc("get_sales_leaderboard", {"p_year": _int(year), "p_month": None, "p_kategori": None, "p_branch": _str(branch)}).execute().data
    rows = [r for r in rows if r.get("slp_name") not in CHANNEL_NAMES]
    result = []
    for i, r in enumerate(rows):
        bills = int(r.get("bills") or 0)
        rev = float(r.get("revenue") or 0)
        custs = int(r.get("customers") or 0)
        result.append({"rank": i+1, "name": r["slp_name"], "revenue": round(rev), "customers": custs,
                        "bills": bills, "aov": round(rev/bills) if bills else 0,
                        "avg_per_customer": round(rev/custs) if custs else 0, "top_categories": []})
    return result


@router.get("/chart")
def sales_chart(year: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    return leaderboard(year, branch)


@router.get("/drilldown/{name}")
def drilldown(name: str, year: Optional[str] = Query(None)):
    db = get_client()
    trend_rows = db.rpc("get_sales_trend", {"p_year": _int(year), "p_kategori": None, "p_branch": None}).execute().data
    monthly = {r["month"]: float(r["revenue"] or 0) for r in trend_rows if r.get("slp_name") == name}

    raw = db.table("transactions").select("new_row_total,kategori,customer_code,customer_name,posting_date").eq("slp_name", name)
    if year and year != "all":
        raw = raw.eq("year", int(year))
    raw = raw.limit(50000).execute().data

    cats = defaultdict(float)
    cust_stats = defaultdict(lambda: {"name": "", "revenue": 0, "last": ""})
    for r in raw:
        cats[r.get("kategori") or "Lainnya"] += r.get("new_row_total") or 0
        code = r.get("customer_code") or "UNKNOWN"
        cust_stats[code]["name"] = r.get("customer_name") or code
        cust_stats[code]["revenue"] += r.get("new_row_total") or 0
        if (r.get("posting_date") or "") > cust_stats[code]["last"]:
            cust_stats[code]["last"] = r.get("posting_date") or ""

    return {
        "trend": [{"month": MONTHS[m-1], "revenue": round(monthly.get(m, 0))} for m in range(1, 13)],
        "categories": sorted([{"kategori": k, "revenue": round(v)} for k, v in cats.items()], key=lambda x: -x["revenue"]),
        "customers": sorted([{"name": v["name"], "revenue": round(v["revenue"]), "last_purchase": v["last"]}
                              for v in cust_stats.values()], key=lambda x: -x["revenue"]),
    }


@router.get("/scatter")
def scatter(year: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    lb = leaderboard(year, branch)
    return [{"name": r["name"], "customers": r["customers"], "revenue": r["revenue"]} for r in lb]
