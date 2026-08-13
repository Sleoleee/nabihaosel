"""
Endpoint Overview berbasis lapisan analitik baru (agg_* PROMPT 1).
Mendukung filter MULTI-select: banyak tahun & banyak channel sekaligus.
"""
import os, sys
from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.db import get_client
import config

router = APIRouter()
MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]


def _csv(v):
    return [x.strip() for x in (v or "").split(",") if x.strip()]


def _fetch(table, cols, years=None, channels=None, months=None):
    db = get_client()
    q = db.table(table).select(cols)
    if years:    q = q.in_("tahun", [int(y) for y in years])
    if channels: q = q.in_("channel", channels)
    if months:   q = q.in_("bulan", [int(m) for m in months])
    return q.execute().data or []


@router.get("/filters")
def filters():
    """Daftar tahun & channel yang tersedia untuk filter global."""
    rows = _fetch("agg_category_month", "tahun")
    years = sorted({int(r["tahun"]) for r in rows if r.get("tahun")}, reverse=True)
    present = {r for r in [c for c in config.BRANCH_GROUP_ORDER]}  # urutan tetap
    ch_rows = _fetch("agg_category_month", "channel")
    ch_have = {r["channel"] for r in ch_rows if r.get("channel")}
    channels = [c for c in config.BRANCH_GROUP_ORDER if c in ch_have]
    return {"years": years, "channels": channels}


def _kpi_from_rows(rows):
    rev = sum(float(r.get("revenue") or 0) for r in rows)
    bills = sum(int(r.get("bills") or 0) for r in rows)
    custs = len({r.get("customer_code") for r in rows})
    return {"revenue": round(rev), "bills": bills, "customers": custs,
            "aov": round(rev / bills) if bills else 0}


def _pct(cur, prev):
    return round((cur - prev) / prev * 100, 1) if prev else None


@router.get("/overview")
def overview(years: Optional[str] = Query(None), channels: Optional[str] = Query(None),
             months: Optional[str] = Query(None), compare: bool = Query(False)):
    yrs = _csv(years)
    chs = _csv(channels)
    mos = _csv(months)

    # Ambil sekali: agg_customer_month untuk KPI + trend + donut channel.
    # Bila compare, ambil juga tahun-1 agar delta YoY bisa dihitung dalam satu fetch.
    fetch_years = set(int(y) for y in yrs) if yrs else None
    if fetch_years and compare:
        fetch_years = fetch_years | {y - 1 for y in fetch_years}
    fy = [str(y) for y in sorted(fetch_years)] if fetch_years else None

    cm = _fetch("agg_customer_month", "tahun,bulan,channel,customer_code,revenue,bills",
                years=fy, channels=chs, months=mos)

    sel_years = set(int(y) for y in yrs) if yrs else {int(r["tahun"]) for r in cm}
    sel_rows = [r for r in cm if int(r["tahun"]) in sel_years]
    kpi = _kpi_from_rows(sel_rows)

    # KPI compare (tahun-1)
    if compare and yrs:
        prev_years = {y - 1 for y in sel_years}
        prev_rows = [r for r in cm if int(r["tahun"]) in prev_years]
        pk = _kpi_from_rows(prev_rows)
        kpi["revenue_change"]   = _pct(kpi["revenue"], pk["revenue"])
        kpi["bills_change"]     = _pct(kpi["bills"], pk["bills"])
        kpi["customers_change"] = _pct(kpi["customers"], pk["customers"])
        kpi["aov_change"]       = _pct(kpi["aov"], pk["aov"])

    # Revenue trend: bulan × tahun (hanya tahun terpilih)
    trend_map = defaultdict(lambda: defaultdict(float))   # bulan -> {tahun: rev}
    for r in sel_rows:
        trend_map[int(r["bulan"])][str(r["tahun"])] += float(r.get("revenue") or 0)
    years_in = sorted({str(y) for y in sel_years})
    trend = []
    for m in range(1, 13):
        row = {"month": MONTHS[m-1], "month_num": m}
        for y in years_in:
            row[y] = round(trend_map[m].get(y, 0))
        trend.append(row)
    primary = years_in[-1] if years_in else None

    # Donut per channel
    by_ch = defaultdict(float)
    for r in sel_rows:
        by_ch[r.get("channel") or "OTHER CHANNEL"] += float(r.get("revenue") or 0)
    by_channel = sorted(({"channel": k, "revenue": round(v)} for k, v in by_ch.items()),
                        key=lambda x: -x["revenue"])

    # Donut per kategori (dari agg_category_month terfilter)
    catrows = _fetch("agg_category_month", "kategori,tahun,revenue",
                     years=yrs or None, channels=chs, months=mos)
    by_kat = defaultdict(float)
    for r in catrows:
        by_kat[r.get("kategori") or "Lainnya"] += float(r.get("revenue") or 0)
    by_kategori = sorted(({"kategori": k, "revenue": round(v)} for k, v in by_kat.items()),
                        key=lambda x: -x["revenue"])

    return {"kpi": kpi, "trend": {"data": trend, "years": years_in, "primary": primary},
            "by_channel": by_channel, "by_kategori": by_kategori}
