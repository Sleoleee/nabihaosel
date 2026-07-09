from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from utils.db import get_client
from utils.calculations import CHANNEL_NAMES

router = APIRouter()

MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]


def _int(val):
    return int(val) if val and val != "all" else None


def _get_leaderboard_data(db, year=None, branch=None):
    params = {
        "p_year": _int(year) if year else None,
        "p_month": None,
        "p_kategori": None,
        "p_branch": branch if branch and branch != "all" else None,
    }
    rows = db.rpc("get_sales_leaderboard", params).execute().data
    return [r for r in rows if r.get("slp_name") not in CHANNEL_NAMES]


@router.get("/leaderboard")
def leaderboard(year: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    db = get_client()
    rows = _get_leaderboard_data(db, year, branch)

    result = []
    for i, r in enumerate(rows):
        bills = int(r.get("bills") or 0)
        revenue = float(r.get("revenue") or 0)
        customers = int(r.get("customers") or 0)
        result.append({
            "rank": i + 1,
            "name": r["slp_name"],
            "revenue": round(revenue),
            "customers": customers,
            "bills": bills,
            "aov": round(revenue / bills) if bills > 0 else 0,
            "avg_per_customer": round(revenue / customers) if customers > 0 else 0,
            "top_categories": [],
        })
    return result


@router.get("/chart")
def sales_chart(year: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    return leaderboard(year, branch)


@router.get("/drilldown/{name}")
def drilldown(name: str, year: Optional[str] = Query(None)):
    db = get_client()

    # Monthly trend for this salesperson
    trend_rows = db.rpc("get_sales_trend", {
        "p_year": _int(year),
        "p_kategori": None,
        "p_branch": None,
    }).execute().data
    trend_rows = [r for r in trend_rows if r.get("slp_name") == name]
    monthly = {r["month"]: float(r["revenue"] or 0) for r in trend_rows}
    trend = [{"month": MONTHS[m-1], "revenue": round(monthly.get(m, 0))} for m in range(1, 13)]

    # Category breakdown for this salesperson - fetch via leaderboard with kategori filter
    cat_rows = db.rpc("get_revenue_by_kategori", {
        "p_year": _int(year),
        "p_month": None,
        "p_branch": None,
    }).execute().data

    # For drilldown we need per-salesperson kategori — fetch limited rows from transactions
    # Use a small select with filters to avoid 1000-row limit issues
    raw = db.table("transactions").select(
        "new_row_total, kategori, customer_code, customer_name, posting_date"
    ).eq("slp_name", name).execute().data

    if year and year != "all":
        raw = [r for r in raw if r.get("year") == int(year)]

    cats = defaultdict(float)
    cust_stats = defaultdict(lambda: {"name": "", "revenue": 0, "last": ""})
    for r in raw:
        cats[r.get("kategori") or "Lainnya"] += r.get("new_row_total") or 0
        code = r.get("customer_code") or "UNKNOWN"
        cust_stats[code]["name"] = r.get("customer_name") or code
        cust_stats[code]["revenue"] += r.get("new_row_total") or 0
        pd_str = r.get("posting_date") or ""
        if pd_str > cust_stats[code]["last"]:
            cust_stats[code]["last"] = pd_str

    cat_list = sorted([{"kategori": k, "revenue": round(v)} for k, v in cats.items()], key=lambda x: -x["revenue"])
    custs = sorted(
        [{"name": v["name"], "revenue": round(v["revenue"]), "last_purchase": v["last"]} for v in cust_stats.values()],
        key=lambda x: -x["revenue"]
    )

    return {"trend": trend, "categories": cat_list, "customers": custs}


@router.get("/scatter")
def scatter(year: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    lb = leaderboard(year, branch)
    return [{"name": r["name"], "customers": r["customers"], "revenue": r["revenue"]} for r in lb]
