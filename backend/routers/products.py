from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from utils.db import get_client

router = APIRouter()

MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]


def _int(val):
    return int(val) if val and val != "all" else None


@router.get("/kategori-trend")
def kategori_trend(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    params = {
        "p_year": _int(year),
        "p_branch": None,
    }
    rows = db.rpc("get_product_trend", params).execute().data

    if kategori and kategori != "all":
        selected = {k.strip() for k in kategori.split(",")}
        rows = [r for r in rows if r.get("kategori") in selected]

    grouped = defaultdict(lambda: defaultdict(float))
    all_years = set()
    all_cats = set()

    # product_trend returns kategori/month/revenue — group by year is not available
    # so we fetch without year filter and group ourselves
    params2 = {"p_year": None, "p_branch": None}
    all_rows = db.rpc("get_product_trend", params2).execute().data
    if kategori and kategori != "all":
        selected = {k.strip() for k in kategori.split(",")}
        all_rows = [r for r in all_rows if r.get("kategori") in selected]

    # We need year info — use a different approach: aggregate by year directly
    year_rows = db.rpc("get_revenue_by_kategori", {"p_year": None, "p_month": None, "p_branch": None}).execute().data

    # Fall back: get yearly breakdown from transactions via kpi per year per kategori
    # Use simpler SQL: get all kategori yearly totals
    data = db.table("transactions").select("new_row_total, kategori, year").limit(10).execute().data
    # Get distinct years first
    filter_data = db.rpc("get_filters", {}).execute().data
    all_db_years = filter_data[0].get("years", []) if filter_data else []

    result_grouped = defaultdict(lambda: defaultdict(float))
    all_cats2 = set()

    for y in all_db_years:
        cat_rows = db.rpc("get_revenue_by_kategori", {"p_year": y, "p_month": None, "p_branch": None}).execute().data
        for r in cat_rows:
            k = r["kategori"]
            if kategori and kategori != "all":
                if k not in {kk.strip() for kk in kategori.split(",")}:
                    continue
            result_grouped[y][k] = float(r["revenue"] or 0)
            all_cats2.add(k)

    result = []
    for y in sorted(all_db_years):
        entry = {"year": y}
        for k in all_cats2:
            entry[k] = round(result_grouped[y].get(k, 0))
        result.append(entry)

    cat_totals = {k: sum(result_grouped[y].get(k, 0) for y in all_db_years) for k in all_cats2}
    top5 = sorted(cat_totals, key=lambda x: -cat_totals[x])[:5]

    return {"data": result, "categories": sorted(all_cats2), "top5": top5}


@router.get("/kategori-growth")
def kategori_growth(year: Optional[str] = Query(None)):
    db = get_client()
    filter_data = db.rpc("get_filters", {}).execute().data
    all_years = sorted(filter_data[0].get("years", [])) if filter_data else []

    compare_year = _int(year)
    if compare_year is None and len(all_years) >= 2:
        compare_year = all_years[-1]
        prev_year = all_years[-2]
    elif compare_year and compare_year in all_years:
        idx = all_years.index(compare_year)
        prev_year = all_years[idx - 1] if idx > 0 else None
    else:
        return []

    curr_rows = db.rpc("get_revenue_by_kategori", {"p_year": compare_year, "p_month": None, "p_branch": None}).execute().data
    prev_rows = db.rpc("get_revenue_by_kategori", {"p_year": prev_year, "p_month": None, "p_branch": None}).execute().data if prev_year else []

    curr_map = {r["kategori"]: float(r["revenue"] or 0) for r in curr_rows}
    prev_map = {r["kategori"]: float(r["revenue"] or 0) for r in prev_rows}
    all_cats = set(curr_map) | set(prev_map)

    result = []
    for k in all_cats:
        curr = curr_map.get(k, 0)
        prev = prev_map.get(k, 0)
        growth = round((curr - prev) / prev * 100, 1) if prev > 0 else None
        result.append({"kategori": k, "current": round(curr), "prev": round(prev), "growth": growth})

    result.sort(key=lambda x: (x["growth"] is None, -(x["growth"] or 0)))
    return result


@router.get("/top-products")
def top_products(
    year: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
):
    db = get_client()
    params = {
        "p_year": _int(year),
        "p_month": None,
        "p_kategori": kategori if kategori and kategori != "all" else None,
        "p_branch": None,
        "p_limit": 20,
    }
    rows = db.rpc("get_top_products", params).execute().data
    return [
        {
            "item_no": r["item_no"],
            "description": r["item_description"],
            "kategori": r["kategori"],
            "revenue": round(float(r["revenue"] or 0)),
            "qty": int(float(r["quantity"] or 0)),
        }
        for r in rows
    ]


@router.get("/heatmap")
def heatmap(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    params = {
        "p_year": _int(year),
        "p_branch": None,
    }
    rows = db.rpc("get_product_trend", params).execute().data

    if kategori and kategori != "all":
        selected = {k.strip() for k in kategori.split(",")}
        rows = [r for r in rows if r.get("kategori") in selected]

    grouped = defaultdict(lambda: defaultdict(float))
    all_cats = set()

    for r in rows:
        k = r["kategori"]
        m = r["month"]
        grouped[k][m] += float(r["revenue"] or 0)
        all_cats.add(k)

    result = []
    for k in sorted(all_cats):
        row = {"kategori": k}
        for m in range(1, 13):
            row[MONTHS[m - 1]] = round(grouped[k].get(m, 0))
        result.append(row)

    return result
