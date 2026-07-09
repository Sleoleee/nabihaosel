from fastapi import APIRouter, Query
from typing import Optional
from utils.db import get_client

router = APIRouter()

MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]


def build_filter(q, year=None, month=None, kategori=None, branch=None):
    if year and year != "all":
        q = q.eq("year", int(year))
    if month and month != "all":
        q = q.eq("month", int(month))
    if kategori and kategori != "all":
        q = q.eq("kategori", kategori)
    if branch and branch != "all":
        q = q.eq("branch", branch)
    return q


@router.get("/kpi")
def kpi(
    year: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
    branch: Optional[str] = Query(None),
):
    db = get_client()

    def fetch_revenue(y=None, m=None):
        q = db.table("transactions").select("new_row_total, document_number, customer_code, posting_date")
        if y:
            q = q.eq("year", int(y))
        if m and m != "all":
            # Filter by month via posting_date month
            pass
        return q.execute().data

    current_data = fetch_revenue(year if year and year != "all" else None)
    if month and month != "all":
        current_data = [r for r in current_data if r.get("posting_date") and int(r["posting_date"][5:7]) == int(month)]
    if kategori and kategori != "all":
        current_data = [r for r in current_data if r.get("kategori") == kategori]
    if branch and branch != "all":
        current_data = [r for r in current_data if r.get("branch") == branch]

    # YoY comparison
    yoy_data = []
    if year and year != "all":
        prev_year = str(int(year) - 1)
        yoy_data = fetch_revenue(prev_year)
        if month and month != "all":
            yoy_data = [r for r in yoy_data if r.get("posting_date") and int(r["posting_date"][5:7]) == int(month)]

    def calc_metrics(data):
        total_rev = sum(r.get("new_row_total") or 0 for r in data)
        bills = len(set(r.get("document_number") for r in data if r.get("document_number")))
        aov = total_rev / bills if bills > 0 else 0
        customers = len(set(r.get("customer_code") for r in data if r.get("customer_code")))
        return total_rev, bills, aov, customers

    rev, bills, aov, custs = calc_metrics(current_data)
    prev_rev, prev_bills, prev_aov, prev_custs = calc_metrics(yoy_data) if yoy_data else (0, 0, 0, 0)

    def pct_change(current, prev):
        if prev == 0:
            return None
        return round((current - prev) / prev * 100, 1)

    return {
        "revenue": rev,
        "bills": bills,
        "aov": aov,
        "customers": custs,
        "revenue_change": pct_change(rev, prev_rev),
        "bills_change": pct_change(bills, prev_bills),
        "aov_change": pct_change(aov, prev_aov),
        "customers_change": pct_change(custs, prev_custs),
    }


@router.get("/revenue-trend")
def revenue_trend(
    year: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
    branch: Optional[str] = Query(None),
):
    db = get_client()
    data = db.table("transactions").select("new_row_total, posting_date, year").execute().data

    if kategori and kategori != "all":
        data = [r for r in data if r.get("kategori") == kategori]
    if branch and branch != "all":
        data = [r for r in data if r.get("branch") == branch]

    # Group by year and month
    from collections import defaultdict
    grouped = defaultdict(lambda: defaultdict(float))

    years_to_show = set()
    if year and year != "all":
        years_to_show.add(int(year))
    else:
        years_to_show = set(r["year"] for r in data if r.get("year"))

    for r in data:
        y = r.get("year")
        if not y or y not in years_to_show:
            continue
        pd_str = r.get("posting_date")
        if not pd_str:
            continue
        m = int(pd_str[5:7])
        grouped[y][m] += r.get("new_row_total") or 0

    result = []
    for m_idx in range(1, 13):
        entry = {"month": MONTHS[m_idx - 1], "month_num": m_idx}
        for y in sorted(years_to_show):
            entry[str(y)] = round(grouped[y].get(m_idx, 0))
        result.append(entry)

    return {"data": result, "years": sorted(years_to_show)}


@router.get("/bills-aov")
def bills_aov(
    year: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
    branch: Optional[str] = Query(None),
):
    db = get_client()
    data = db.table("transactions").select("new_row_total, document_number, posting_date, year").execute().data

    if year and year != "all":
        data = [r for r in data if r.get("year") == int(year)]
    if kategori and kategori != "all":
        data = [r for r in data if r.get("kategori") == kategori]
    if branch and branch != "all":
        data = [r for r in data if r.get("branch") == branch]

    from collections import defaultdict
    monthly_bills = defaultdict(set)
    monthly_rev = defaultdict(float)

    for r in data:
        pd_str = r.get("posting_date")
        if not pd_str:
            continue
        m = int(pd_str[5:7])
        doc = r.get("document_number")
        if doc:
            monthly_bills[m].add(doc)
        monthly_rev[m] += r.get("new_row_total") or 0

    result = []
    for m_idx in range(1, 13):
        bills = len(monthly_bills[m_idx])
        rev = monthly_rev[m_idx]
        aov = rev / bills if bills > 0 else 0
        result.append({
            "month": MONTHS[m_idx - 1],
            "bills": bills,
            "aov": round(aov),
        })

    return result


@router.get("/by-kategori")
def by_kategori(
    year: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    branch: Optional[str] = Query(None),
):
    db = get_client()
    data = db.table("transactions").select("new_row_total, kategori, posting_date, year, branch").execute().data

    if year and year != "all":
        data = [r for r in data if r.get("year") == int(year)]
    if month and month != "all":
        data = [r for r in data if r.get("posting_date") and int(r["posting_date"][5:7]) == int(month)]
    if branch and branch != "all":
        data = [r for r in data if r.get("branch") == branch]

    from collections import defaultdict
    grouped = defaultdict(float)
    for r in data:
        k = r.get("kategori") or "Lainnya"
        grouped[k] += r.get("new_row_total") or 0

    result = sorted([{"kategori": k, "revenue": round(v)} for k, v in grouped.items()], key=lambda x: -x["revenue"])
    return result


@router.get("/by-branch")
def by_branch(
    year: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
):
    db = get_client()
    data = db.table("transactions").select("new_row_total, branch, posting_date, year, kategori").execute().data

    if year and year != "all":
        data = [r for r in data if r.get("year") == int(year)]
    if month and month != "all":
        data = [r for r in data if r.get("posting_date") and int(r["posting_date"][5:7]) == int(month)]
    if kategori and kategori != "all":
        data = [r for r in data if r.get("kategori") == kategori]

    from collections import defaultdict
    grouped = defaultdict(float)
    for r in data:
        b = r.get("branch") or "Lainnya"
        grouped[b] += r.get("new_row_total") or 0

    result = sorted([{"branch": b, "revenue": round(v)} for b, v in grouped.items()], key=lambda x: -x["revenue"])
    return result


@router.get("/filters")
def get_filters():
    """Return available years, categories, branches for dropdowns."""
    db = get_client()
    data = db.table("transactions").select("year, kategori, branch").execute().data

    years = sorted(set(r["year"] for r in data if r.get("year")), reverse=True)
    kategori = sorted(set(r["kategori"] for r in data if r.get("kategori")))
    branches = sorted(set(r["branch"] for r in data if r.get("branch")))

    return {"years": years, "kategori": kategori, "branches": branches}
