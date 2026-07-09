from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from utils.db import get_client
from utils.calculations import CHANNEL_NAMES

router = APIRouter()

MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]
ROW_LIMIT = 100000


def load_sales(db, year=None, branch=None):
    q = db.table("transactions").select(
        "new_row_total,document_number,customer_code,customer_name,slp_name,posting_date,year,branch,kategori"
    )
    if year and year != "all":
        q = q.eq("year", int(year))
    if branch and branch != "all":
        q = q.eq("branch", branch)
    data = q.limit(ROW_LIMIT).execute().data
    return [r for r in data if r.get("slp_name") not in CHANNEL_NAMES]


@router.get("/leaderboard")
def leaderboard(year: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    db = get_client()
    data = load_sales(db, year, branch)
    stats = defaultdict(lambda: {"revenue": 0, "docs": set(), "customers": set()})
    for r in data:
        sp = r.get("slp_name") or "UNKNOWN"
        stats[sp]["revenue"] += r.get("new_row_total") or 0
        if r.get("document_number"):
            stats[sp]["docs"].add(r["document_number"])
        if r.get("customer_code"):
            stats[sp]["customers"].add(r["customer_code"])
    result = []
    for i, (sp, s) in enumerate(sorted(stats.items(), key=lambda x: -x[1]["revenue"])):
        bills = len(s["docs"])
        custs = len(s["customers"])
        rev = s["revenue"]
        result.append({"rank": i+1, "name": sp, "revenue": round(rev), "customers": custs,
                        "bills": bills, "aov": round(rev/bills) if bills else 0,
                        "avg_per_customer": round(rev/custs) if custs else 0, "top_categories": []})
    return result


@router.get("/chart")
def sales_chart(year: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    return leaderboard(year, branch)


@router.get("/drilldown/{name}")
def drilldown(name: str, year: Optional[str] = Query(None)):
    db = get_client()
    q = db.table("transactions").select(
        "new_row_total,kategori,customer_code,customer_name,posting_date,year"
    ).eq("slp_name", name)
    if year and year != "all":
        q = q.eq("year", int(year))
    data = q.limit(ROW_LIMIT).execute().data

    monthly = defaultdict(float)
    cats = defaultdict(float)
    cust_stats = defaultdict(lambda: {"name": "", "revenue": 0, "last": ""})
    for r in data:
        pd_str = r.get("posting_date")
        if pd_str:
            monthly[int(pd_str[5:7])] += r.get("new_row_total") or 0
        cats[r.get("kategori") or "Lainnya"] += r.get("new_row_total") or 0
        code = r.get("customer_code") or "UNKNOWN"
        cust_stats[code]["name"] = r.get("customer_name") or code
        cust_stats[code]["revenue"] += r.get("new_row_total") or 0
        if (pd_str or "") > cust_stats[code]["last"]:
            cust_stats[code]["last"] = pd_str or ""

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
