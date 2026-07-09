from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from utils.db import get_client

router = APIRouter()

MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]


@router.get("/kategori-trend")
def kategori_trend(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    data = db.table("transactions").select("new_row_total, kategori, year").execute().data

    if kategori and kategori != "all":
        selected = [k.strip() for k in kategori.split(",")]
        data = [r for r in data if r.get("kategori") in selected]

    grouped = defaultdict(lambda: defaultdict(float))
    all_years = set()
    all_cats = set()

    for r in data:
        y = r.get("year")
        k = r.get("kategori") or "Lainnya"
        if y:
            grouped[y][k] += r.get("new_row_total") or 0
            all_years.add(y)
            all_cats.add(k)

    result = []
    for y in sorted(all_years):
        entry = {"year": y}
        for k in all_cats:
            entry[k] = round(grouped[y].get(k, 0))
        result.append(entry)

    # Top 5 categories by total revenue
    cat_totals = {k: sum(grouped[y].get(k, 0) for y in all_years) for k in all_cats}
    top5 = sorted(cat_totals, key=lambda x: -cat_totals[x])[:5]

    return {"data": result, "categories": sorted(all_cats), "top5": top5}


@router.get("/kategori-growth")
def kategori_growth(year: Optional[str] = Query(None)):
    db = get_client()
    data = db.table("transactions").select("new_row_total, kategori, year").execute().data

    grouped = defaultdict(lambda: defaultdict(float))
    for r in data:
        y = r.get("year")
        k = r.get("kategori") or "Lainnya"
        if y:
            grouped[k][y] += r.get("new_row_total") or 0

    compare_year = int(year) if year and year != "all" else None
    all_years = sorted(set(r["year"] for r in data if r.get("year")))

    if compare_year is None and len(all_years) >= 2:
        compare_year = all_years[-1]
        prev_year = all_years[-2]
    elif compare_year:
        idx = all_years.index(compare_year) if compare_year in all_years else -1
        prev_year = all_years[idx - 1] if idx > 0 else None
    else:
        return []

    result = []
    for k, years_rev in grouped.items():
        curr = years_rev.get(compare_year, 0)
        prev = years_rev.get(prev_year, 0) if prev_year else 0
        if prev == 0:
            growth = None
        else:
            growth = round((curr - prev) / prev * 100, 1)
        result.append({"kategori": k, "current": round(curr), "prev": round(prev), "growth": growth})

    result.sort(key=lambda x: (x["growth"] is None, -(x["growth"] or 0)))
    return result


@router.get("/top-products")
def top_products(
    year: Optional[str] = Query(None),
    kategori: Optional[str] = Query(None),
):
    db = get_client()
    data = db.table("transactions").select("new_row_total, item_no, item_description, kategori, quantity, year").execute().data

    if year and year != "all":
        data = [r for r in data if r.get("year") == int(year)]
    if kategori and kategori != "all":
        selected = [k.strip() for k in kategori.split(",")]
        data = [r for r in data if r.get("kategori") in selected]

    grouped = defaultdict(lambda: {"description": "", "revenue": 0, "qty": 0})
    for r in data:
        sku = r.get("item_no") or "UNKNOWN"
        grouped[sku]["description"] = r.get("item_description") or sku
        grouped[sku]["revenue"] += r.get("new_row_total") or 0
        grouped[sku]["qty"] += r.get("quantity") or 0

    result = sorted(
        [{"item_no": k, "description": v["description"], "revenue": round(v["revenue"]), "qty": int(v["qty"])}
         for k, v in grouped.items()],
        key=lambda x: -x["revenue"]
    )[:20]

    return result


@router.get("/heatmap")
def heatmap(year: Optional[str] = Query(None), kategori: Optional[str] = Query(None)):
    db = get_client()
    data = db.table("transactions").select("new_row_total, kategori, posting_date, year").execute().data

    if year and year != "all":
        data = [r for r in data if r.get("year") == int(year)]
    if kategori and kategori != "all":
        selected = [k.strip() for k in kategori.split(",")]
        data = [r for r in data if r.get("kategori") in selected]

    grouped = defaultdict(lambda: defaultdict(float))
    all_cats = set()

    for r in data:
        k = r.get("kategori") or "Lainnya"
        pd_str = r.get("posting_date")
        if not pd_str:
            continue
        m = int(pd_str[5:7])
        grouped[k][m] += r.get("new_row_total") or 0
        all_cats.add(k)

    result = []
    for k in sorted(all_cats):
        row = {"kategori": k}
        for m in range(1, 13):
            row[MONTHS[m - 1]] = round(grouped[k].get(m, 0))
        result.append(row)

    return result
