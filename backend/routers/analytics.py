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
from sales_targets import SALESPERSONS, TEAMS, match_salesperson

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

    # Bills vs AOV per bulan (gabungan tahun terpilih)
    ba = defaultdict(lambda: {"bills": 0, "rev": 0.0})
    for r in sel_rows:
        b = ba[int(r["bulan"])]; b["bills"] += int(r.get("bills") or 0); b["rev"] += float(r.get("revenue") or 0)
    bills_aov = [{"month": MONTHS[m-1], "bills": ba[m]["bills"],
                  "aov": round(ba[m]["rev"]/ba[m]["bills"]) if ba[m]["bills"] else 0}
                 for m in range(1, 13)]

    return {"kpi": kpi, "trend": {"data": trend, "years": years_in, "primary": primary},
            "bills_aov": bills_aov, "by_channel": by_channel, "by_kategori": by_kategori}


# ============================ SALES PERFORMANCE ============================
def _fetch_all_rows(table, cols, years=None):
    """Fetch tabel kecil sekaligus (db_max_rows tinggi)."""
    db = get_client()
    q = db.table(table).select(cols)
    if years:
        q = q.in_("tahun", [int(y) for y in years])
    return q.execute().data or []


@router.get("/sales-performance")
def sales_performance(years: Optional[str] = Query(None)):
    """Metrik per salesperson dari agg_salesperson_month + dim_customer + target.
    Selalu hitung YoY (tahun terpilih vs tahun-1). Frontend menyaring per scope."""
    yrs = [int(y) for y in _csv(years)]
    if not yrs:
        rows0 = _fetch_all_rows("agg_salesperson_month", "tahun")
        yrs = sorted({int(r["tahun"]) for r in rows0}) or [2026]
    prev = {y - 1 for y in yrs}
    fetch_years = [str(y) for y in sorted(set(yrs) | prev)]

    asp = _fetch_all_rows("agg_salesperson_month",
        "slp_name,tahun,revenue,bills,customer_new,customer_repeat,customer_reactivated,"
        "revenue_new,revenue_repeat,revenue_reactivated", years=fetch_years)

    sel = set(yrs)
    agg = defaultdict(lambda: {"rev":0.0,"rev_prev":0.0,"bills":0,
                               "new":0,"repeat":0,"react":0,"rev_new":0.0})
    for r in asp:
        y = int(r["tahun"]); s = r["slp_name"]; a = agg[s]
        rev = float(r.get("revenue") or 0)
        if y in sel:
            a["rev"] += rev; a["bills"] += int(r.get("bills") or 0)
            a["new"] += int(r.get("customer_new") or 0)
            a["repeat"] += int(r.get("customer_repeat") or 0)
            a["react"] += int(r.get("customer_reactivated") or 0)
            a["rev_new"] += float(r.get("revenue_new") or 0)
        elif y in prev:
            a["rev_prev"] += rev

    # Portfolio dari dim_customer (customer utama per salesperson)
    dc = _fetch_all_rows("dim_customer", "salesperson_utama,status,revenue_at_risk,total_revenue")
    port = defaultdict(lambda: {"custs":0,"overdue":0,"at_risk":0.0})
    for c in dc:
        s = c.get("salesperson_utama")
        if not s: continue
        p = port[s]; p["custs"] += 1
        if c.get("status") == "Overdue":
            p["overdue"] += 1; p["at_risk"] += float(c.get("revenue_at_risk") or 0)

    tgt = {sp["name"]: sp for sp in SALESPERSONS}

    salespeople = []
    for s, a in agg.items():
        m = match_salesperson(s)
        core = bool(m)
        name = m["name"] if m else s
        target = tgt[name]["target"] if (core and name in tgt) else 0
        rev = round(a["rev"])
        pf = port.get(s, {"custs":0,"overdue":0,"at_risk":0.0})
        salespeople.append({
            "slp_name": s, "name": name, "spv": m["team"] if m else None,
            "is_core": core, "is_non_person": config.is_non_person_slp(s),
            "revenue": rev, "revenue_prev": round(a["rev_prev"]),
            "growth_yoy": _pct(rev, a["rev_prev"]),
            "bills": a["bills"], "aov": round(rev/a["bills"]) if a["bills"] else 0,
            "customers": pf["custs"], "customer_new": a["new"],
            "customer_repeat": a["repeat"], "customer_reactivated": a["react"],
            "revenue_new": round(a["rev_new"]),
            "overdue_customers": pf["overdue"], "revenue_at_risk": round(pf["at_risk"]),
            "target": target, "pct": round(rev/target*100, 1) if target else None,
            "gap": round(target - rev) if target else None,
        })
    salespeople.sort(key=lambda x: -x["revenue"])

    teams = []
    for t in TEAMS:
        members = [s for s in salespeople if s["spv"] == t]
        trev = sum(m["revenue"] for m in members)
        ttgt = sum(m["target"] for m in members)
        teams.append({"team": t, "revenue": round(trev), "target": round(ttgt),
                      "pct": round(trev/ttgt*100, 1) if ttgt else None,
                      "gap": round(ttgt - trev), "members": len(members)})

    return {"salespeople": salespeople, "teams": teams,
            "grand_total_revenue": round(sum(s["revenue"] for s in salespeople))}


@router.get("/sales-trend")
def sales_trend(years: Optional[str] = Query(None)):
    """Revenue bulanan per salesperson (dijumlah lintas tahun terpilih) -> 12 nilai."""
    yrs = _csv(years)
    rows = _fetch_all_rows("agg_salesperson_month", "slp_name,bulan,revenue", years=yrs or None)
    series = defaultdict(lambda: [0.0] * 12)
    for r in rows:
        b = int(r.get("bulan") or 0)
        if 1 <= b <= 12:
            m = match_salesperson(r["slp_name"])
            name = m["name"] if m else r["slp_name"]
            series[name][b-1] += float(r.get("revenue") or 0)
    return {k: [round(x) for x in v] for k, v in series.items()}


@router.get("/sales-mix")
def sales_mix(years: Optional[str] = Query(None)):
    """Mix kategori per salesperson (100% stacked)."""
    yrs = _csv(years)
    rows = _fetch_all_rows("agg_salesperson_category_month", "slp_name,kategori,revenue",
                           years=yrs or None)
    mix = defaultdict(lambda: defaultdict(float))
    for r in rows:
        mix[r["slp_name"]][r.get("kategori") or "Lainnya"] += float(r.get("revenue") or 0)
    out = {}
    for slp, kats in mix.items():
        m = match_salesperson(slp)
        name = m["name"] if m else slp
        top = sorted(kats.items(), key=lambda x: -x[1])[:5]
        out[name] = [{"kategori": k, "revenue": round(v)} for k, v in top]
    return out
