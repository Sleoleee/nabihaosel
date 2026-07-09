from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from utils.db import get_client
from utils.calculations import CHANNEL_NAMES

router = APIRouter()

MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]


def load_human_sales(db, year=None, branch=None):
    data = db.table("transactions").select(
        "new_row_total, document_number, customer_code, customer_name, slp_name, posting_date, year, branch, kategori"
    ).execute().data
    data = [r for r in data if r.get("slp_name") not in CHANNEL_NAMES]
    if year and year != "all":
        data = [r for r in data if r.get("year") == int(year)]
    if branch and branch != "all":
        data = [r for r in data if r.get("branch") == branch]
    return data


@router.get("/leaderboard")
def leaderboard(year: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    db = get_client()
    data = load_human_sales(db, year, branch)

    stats = defaultdict(lambda: {"revenue": 0, "docs": set(), "customers": set(), "categories": defaultdict(float)})

    for r in data:
        sp = r.get("slp_name") or "UNKNOWN"
        stats[sp]["revenue"] += r.get("new_row_total") or 0
        doc = r.get("document_number")
        if doc:
            stats[sp]["docs"].add(doc)
        cust = r.get("customer_code")
        if cust:
            stats[sp]["customers"].add(cust)
        kat = r.get("kategori") or "Lainnya"
        stats[sp]["categories"][kat] += r.get("new_row_total") or 0

    result = []
    for sp, s in stats.items():
        bills = len(s["docs"])
        customers = len(s["customers"])
        aov = s["revenue"] / bills if bills > 0 else 0
        avg_per_cust = s["revenue"] / customers if customers > 0 else 0
        top3_cats = sorted(s["categories"].items(), key=lambda x: -x[1])[:3]
        result.append({
            "name": sp,
            "revenue": round(s["revenue"]),
            "customers": customers,
            "aov": round(aov),
            "bills": bills,
            "avg_per_customer": round(avg_per_cust),
            "top_categories": [c[0] for c in top3_cats],
        })

    result.sort(key=lambda x: -x["revenue"])
    for i, r in enumerate(result):
        r["rank"] = i + 1

    return result


@router.get("/chart")
def sales_chart(year: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    return leaderboard(year, branch)


@router.get("/drilldown/{name}")
def drilldown(name: str, year: Optional[str] = Query(None)):
    db = get_client()
    data = load_human_sales(db, year)
    data = [r for r in data if r.get("slp_name") == name]

    # Monthly trend
    monthly = defaultdict(float)
    for r in data:
        pd_str = r.get("posting_date")
        if pd_str:
            m = int(pd_str[5:7])
            monthly[m] += r.get("new_row_total") or 0

    trend = [{"month": MONTHS[m-1], "revenue": round(monthly.get(m, 0))} for m in range(1, 13)]

    # Category breakdown
    cats = defaultdict(float)
    for r in data:
        cats[r.get("kategori") or "Lainnya"] += r.get("new_row_total") or 0
    cat_list = sorted([{"kategori": k, "revenue": round(v)} for k, v in cats.items()], key=lambda x: -x["revenue"])

    # Customers served
    cust_stats = defaultdict(lambda: {"name": "", "revenue": 0, "last": ""})
    for r in data:
        code = r.get("customer_code") or "UNKNOWN"
        cust_stats[code]["name"] = r.get("customer_name") or code
        cust_stats[code]["revenue"] += r.get("new_row_total") or 0
        pd_str = r.get("posting_date") or ""
        if pd_str > cust_stats[code]["last"]:
            cust_stats[code]["last"] = pd_str

    custs = sorted(
        [{"name": v["name"], "revenue": round(v["revenue"]), "last_purchase": v["last"]} for v in cust_stats.values()],
        key=lambda x: -x["revenue"]
    )

    return {"trend": trend, "categories": cat_list, "customers": custs}


@router.get("/scatter")
def scatter(year: Optional[str] = Query(None), branch: Optional[str] = Query(None)):
    lb = leaderboard(year, branch)
    return [{"name": r["name"], "customers": r["customers"], "revenue": r["revenue"]} for r in lb]
