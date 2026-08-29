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
def sales_performance(years: Optional[str] = Query(None), channels: Optional[str] = Query(None)):
    """Metrik per salesperson dari agg_salesperson_month + dim_customer + target.
    Selalu hitung YoY (tahun terpilih vs tahun-1). Frontend menyaring per scope."""
    yrs = [int(y) for y in _csv(years)]
    if not yrs:
        rows0 = _fetch_all_rows("agg_salesperson_month", "tahun")
        yrs = sorted({int(r["tahun"]) for r in rows0}) or [2026]
    chs = _csv(channels)
    prev = {y - 1 for y in yrs}
    fetch_years = [str(y) for y in sorted(set(yrs) | prev)]

    asp = _fetch_all_rows("agg_salesperson_month",
        "slp_name,tahun,channel,revenue,bills,customer_new,customer_repeat,customer_reactivated,"
        "revenue_new,revenue_repeat,revenue_reactivated", years=fetch_years)
    if chs:
        asp = [r for r in asp if r.get("channel") in chs]

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


RFM_ORDER = ["At Risk","Lost","Need Attention","Promising","Loyal","Champions"]
TIER_ORDER = ["Tier 1 — ≥30jt","Tier 2 — 20–30jt","Tier 3 — 15–20jt","Tier 4 — 10–15jt","Tier 5 — 7–10jt","Tier 6 — 6–7jt","Tier 7 — 5–6jt","Tier 8 — 4–5jt","Tier 9 — 3–4jt","Tier 10 — 2–3jt","Tier 11 — 1–2jt","Tier 12 — 500rb–1jt","Tier 13 — <500rb"]


@router.get("/product")
def product(years: Optional[str] = Query(None), channels: Optional[str] = Query(None),
            core_only: bool = Query(True)):
    yrs = [int(y) for y in _csv(years)]
    if not yrs:
        yrs = sorted({int(r["tahun"]) for r in _fetch_all_rows("agg_category_month","tahun")}) or [2026]
    prev = {y-1 for y in yrs}; selset = set(yrs)
    fy = [str(y) for y in sorted(selset | prev)]
    rows = _fetch("agg_category_month", "kategori,tahun,channel,revenue", years=fy, channels=_csv(channels))
    cat = defaultdict(lambda: {"rev":0.0,"prev":0.0})
    chan = defaultdict(lambda: defaultdict(float))
    for r in rows:
        k = r.get("kategori") or "Lainnya"
        if core_only and not config.is_produk_inti(k): continue
        y = int(r["tahun"]); rev = float(r.get("revenue") or 0)
        if y in selset: cat[k]["rev"] += rev; chan[k][r.get("channel") or "OTHER CHANNEL"] += rev
        elif y in prev: cat[k]["prev"] += rev
    total = sum(v["rev"] for v in cat.values()) or 1
    matrix = [{"kategori":k,"revenue":round(v["rev"]),"share":round(v["rev"]/total*100,1),
               "growth_yoy":_pct(v["rev"],v["prev"])} for k,v in cat.items() if v["rev"] > 0]
    movers = sorted(({"kategori":k,"delta":round(v["rev"]-v["prev"]),"growth":_pct(v["rev"],v["prev"]),
                      "revenue":round(v["rev"])} for k,v in cat.items() if v["rev"] or v["prev"]),
                    key=lambda x: x["delta"])
    cat_channel = [{"kategori":k, **{ch:round(rv) for ch,rv in chan[k].items()}} for k in chan]
    biggest = max(matrix, key=lambda x:x["revenue"]) if matrix else None
    tg = [m for m in matrix if m["growth_yoy"] is not None]
    top_growth = max(tg, key=lambda x:x["growth_yoy"]) if tg else None
    return {"kpi":{"n_kategori":len(matrix),"biggest":biggest,"top_growth":top_growth},
            "matrix":matrix, "movers":{"up":movers[-10:][::-1],"down":movers[:10]},
            "cat_channel":cat_channel,
            "channels_present":[c for c in config.BRANCH_GROUP_ORDER if any(c in cc for cc in chan.values())]}


@router.get("/product-pairing")
def product_pairing(years: Optional[str] = Query(None)):
    yrs = set(int(y) for y in _csv(years))
    rows = _fetch_all_rows("agg_category_pairing",
        "kategori_a,kategori_b,tahun,jumlah_nota_bersama,support,confidence,lift")
    agg = defaultdict(lambda: {"cnt":0,"lift":0.0,"conf":0.0,"n":0})
    for r in rows:
        if yrs and int(r["tahun"]) not in yrs: continue
        k = (r["kategori_a"], r["kategori_b"]); a = agg[k]
        a["cnt"] += int(r.get("jumlah_nota_bersama") or 0)
        a["lift"] += float(r.get("lift") or 0); a["conf"] += float(r.get("confidence") or 0); a["n"] += 1
    out = [{"kategori_a":a,"kategori_b":b,"count":v["cnt"],
            "lift":round(v["lift"]/v["n"],2) if v["n"] else 0,
            "confidence":round(v["conf"]/v["n"],3) if v["n"] else 0} for (a,b),v in agg.items()]
    out.sort(key=lambda x:-x["lift"])
    return out[:40]


@router.get("/product-penetration")
def product_penetration(channels: Optional[str] = Query(None), core_only: bool = Query(True)):
    chs = _csv(channels)
    dc = _fetch_all_rows("dim_customer", "customer_code,tier,channel_utama")
    if chs: dc = [c for c in dc if c.get("channel_utama") in chs]
    tier_of = {c["customer_code"]: c.get("tier") for c in dc}
    tier_total = defaultdict(set)
    for c in dc:
        if c.get("tier"): tier_total[c["tier"]].add(c["customer_code"])
    acc = _fetch_all_rows("agg_customer_category", "customer_code,kategori")
    buyers = defaultdict(set)   # (tier,kat) -> customers
    kats = set()
    for r in acc:
        code = r["customer_code"]; kat = r.get("kategori") or "Lainnya"
        if core_only and not config.is_produk_inti(kat): continue
        t = tier_of.get(code)
        if not t: continue
        buyers[(t,kat)].add(code); kats.add(kat)
    tiers = [t for t in TIER_ORDER if t in tier_total]
    kat_list = sorted(kats)
    cells = []
    for t in tiers:
        tot = len(tier_total[t]) or 1
        for k in kat_list:
            b = len(buyers[(t,k)])
            cells.append({"tier":t.split(" — ")[0],"kategori":k,"pct":round(b/tot*100,1),"buyers":b,"total":tot})
    return {"tiers":[t.split(" — ")[0] for t in tiers], "kategori":kat_list, "cells":cells}

@router.get("/customer-analytics")
def customer_analytics(channels: Optional[str] = Query(None)):
    """KPI, tier, RFM bubble, segmen, konsentrasi, reorder — dari dim_customer (lifetime).
    Filter channel via channel_utama. (RFM/tier bersifat lifetime, tak difilter tahun.)"""
    chs = _csv(channels)
    dc = _fetch_all_rows("dim_customer",
        "customer_code,total_revenue,monetary,interval_normal_hari,days_since_last_order,"
        "recency_ratio,frequency,tier,segmen_rfm,status,channel_utama,jumlah_bills,revenue_at_risk")
    if chs:
        dc = [c for c in dc if c.get("channel_utama") in chs]
    n = len(dc)
    total_rev = sum(float(c.get("total_revenue") or 0) for c in dc)
    ints = [float(c["interval_normal_hari"]) for c in dc if c.get("interval_normal_hari")]
    with_ratio = [c for c in dc if c.get("recency_ratio") is not None]
    overdue = [c for c in with_ratio if float(c["recency_ratio"]) >= 1.0]
    kpi = {
        "total_customers": n,
        "avg_rev_per_customer": round(total_rev/n) if n else 0,
        "avg_retention_days": round(sum(ints)/len(ints),1) if ints else 0,
        "revenue_at_risk": round(sum(float(c.get("revenue_at_risk") or 0) for c in dc)),
        "overdue_rate": round(len(overdue)/len(with_ratio)*100,1) if with_ratio else 0,
    }
    # Tier distribution
    tier = defaultdict(lambda: {"count":0,"revenue":0.0,"mon":0.0})
    for c in dc:
        t = tier[c.get("tier") or "-"]; t["count"]+=1
        t["revenue"]+=float(c.get("total_revenue") or 0); t["mon"]+=float(c.get("monetary") or 0)
    tier_dist = [{"tier":k,"count":v["count"],"revenue":round(v["revenue"]),
                  "avg_monthly":round(v["mon"]/v["count"]) if v["count"] else 0,
                  "pct_rev":round(v["revenue"]/total_rev*100,1) if total_rev else 0}
                 for k,v in tier.items()]
    # RFM bubble + segmen
    seg = defaultdict(lambda: {"count":0,"revenue":0.0,"rec":0.0,"freq":0.0})
    for c in dc:
        s = c.get("segmen_rfm")
        if not s: continue
        v = seg[s]; v["count"]+=1; v["revenue"]+=float(c.get("total_revenue") or 0)
        v["rec"]+=float(c.get("days_since_last_order") or 0); v["freq"]+=float(c.get("frequency") or 0)
    rfm_bubble = [{"segment":k,"count":v["count"],"revenue":round(v["revenue"]),
                   "avg_recency_days":round(v["rec"]/v["count"]) if v["count"] else 0,
                   "avg_frequency":round(v["freq"]/v["count"],1) if v["count"] else 0}
                  for k,v in seg.items()]
    # Konsentrasi (pareto customer)
    revs = sorted((float(c.get("total_revenue") or 0) for c in dc), reverse=True)
    top10 = round(sum(revs[:10])/total_rev*100,1) if total_rev else 0
    cum=0; pareto=[]
    for i,r in enumerate(revs[:50]):
        cum+=r; pareto.append({"rank":i+1,"cum":round(cum/total_rev*100,1) if total_rev else 0})
    # Reorder behaviour
    bills_dist = defaultdict(int)
    for c in dc:
        b = int(c.get("jumlah_bills") or 0)
        key = "1" if b<=1 else "2-3" if b<=3 else "4-6" if b<=6 else "7-12" if b<=12 else "13+"
        bills_dist[key]+=1
    repeat_rate = round(sum(1 for c in dc if int(c.get("jumlah_bills") or 0)>1)/n*100,1) if n else 0
    interval_dist = defaultdict(int)
    for iv in ints:
        key = "<7h" if iv<7 else "7-14h" if iv<14 else "15-30h" if iv<30 else "31-60h" if iv<60 else "61-90h" if iv<90 else ">90h"
        interval_dist[key]+=1

    return {"kpi":kpi, "tier_dist":tier_dist, "rfm_bubble":rfm_bubble,
            "concentration":{"top10_pct":top10,"pareto":pareto},
            "reorder":{"repeat_rate":repeat_rate,
                       "bills_dist":[{"k":k,"v":bills_dist[k]} for k in ["1","2-3","4-6","7-12","13+"]],
                       "interval_dist":[{"k":k,"v":interval_dist[k]} for k in ["<7h","7-14h","15-30h","31-60h","61-90h",">90h"]]}}


@router.get("/customer-lifecycle")
def customer_lifecycle(years: Optional[str] = Query(None), channels: Optional[str] = Query(None)):
    """Lifecycle flow bulanan (New/Repeat/Reactivated + Net) dari agg_customer_month."""
    yrs = _csv(years); chs = _csv(channels)
    rows = _fetch("agg_customer_month", "tahun,bulan,channel,customer_code,revenue,status_lifecycle",
                  years=yrs or None, channels=chs)
    by_m = defaultdict(lambda: {"new":set(),"repeat":set(),"react":set(),
                                "rev_new":0.0,"rev_repeat":0.0,"rev_react":0.0})
    for r in rows:
        key = (int(r["tahun"]), int(r["bulan"])); st = r.get("status_lifecycle") or "repeat"
        code = r.get("customer_code"); rev = float(r.get("revenue") or 0)
        m = by_m[key]
        if st=="new": m["new"].add(code); m["rev_new"]+=rev
        elif st=="reactivated": m["react"].add(code); m["rev_react"]+=rev
        else: m["repeat"].add(code); m["rev_repeat"]+=rev
    MONTHS_ = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]
    out = []
    for (y,mo) in sorted(by_m):
        m = by_m[(y,mo)]
        out.append({"label":f"{MONTHS_[mo-1]} {str(y)[2:]}", "tahun":y, "bulan":mo,
                    "New":len(m["new"]),"Repeat":len(m["repeat"]),"Reactivated":len(m["react"]),
                    "net":len(m["new"])+len(m["repeat"])+len(m["react"]),
                    "rev_new":round(m["rev_new"]),"rev_repeat":round(m["rev_repeat"]),"rev_react":round(m["rev_react"])})
    return out


@router.get("/customer-cohort")
def customer_cohort():
    rows = _fetch_all_rows("agg_cohort_retention", "cohort_bulan,bulan_ke_n,customer_aktif,pct_retained")
    return sorted(rows, key=lambda r:(r["cohort_bulan"], r["bulan_ke_n"]))


@router.get("/customer-list")
def customer_list(segment: Optional[str] = Query(None), tier: Optional[str] = Query(None),
                  status: Optional[str] = Query(None), channel: Optional[str] = Query(None),
                  search: Optional[str] = Query(None), page: int = Query(1), limit: int = Query(25)):
    dc = _fetch_all_rows("dim_customer",
        "customer_code,customer_name,tier,segmen_rfm,status,total_revenue,avg_spending_per_month_active,"
        "jumlah_bills,last_order_date,interval_normal_hari,days_since_last_order,recency_ratio,"
        "revenue_at_risk,salesperson_utama,channel_utama")
    def keep(c):
        if segment and segment!="all" and c.get("segmen_rfm")!=segment: return False
        if tier and tier!="all" and c.get("tier")!=tier: return False
        if status and status!="all" and c.get("status")!=status: return False
        if channel and channel!="all" and c.get("channel_utama")!=channel: return False
        if search and search.lower() not in (c.get("customer_name") or "").lower(): return False
        return True
    rows = [c for c in dc if keep(c)]
    rows.sort(key=lambda c: -(float(c.get("revenue_at_risk") or 0)))
    total = len(rows)
    start = (page-1)*limit
    return {"data": rows[start:start+limit], "total": total}


@router.get("/product-sku")
def product_sku(years: Optional[str] = Query(None), core_only: bool = Query(True)):
    """Pareto SKU (ABC) + efek volume vs harga, dari agg_sku_year."""
    yrs = [int(y) for y in _csv(years)]
    if not yrs:
        yrs = sorted({int(r["tahun"]) for r in _fetch_all_rows("agg_sku_year","tahun")}) or [2026]
    prev = {y-1 for y in yrs}; selset = set(yrs)
    fy = [str(y) for y in sorted(selset | prev)]
    rows = _fetch_all_rows("agg_sku_year", "item_no,tahun,revenue,quantity,harga_rata2,unit,jumlah_customer", years=fy)
    di = {d["item_no"]: d for d in _fetch_all_rows("dim_item", "item_no,item_desc,kategori,is_produk_inti")}
    agg = defaultdict(lambda: {"rev":0.,"prev":0.,"qty":0.,"qtyp":0.,"pr":0.,"prp":0.,"ns":0,"np":0,"unit":"","cust":0})
    for r in rows:
        it = r["item_no"]; y = int(r["tahun"]); d = di.get(it, {})
        if core_only and not d.get("is_produk_inti", True): continue
        a = agg[it]; a["unit"] = r.get("unit") or a["unit"]
        if y in selset:
            a["rev"]+=float(r.get("revenue") or 0); a["qty"]+=float(r.get("quantity") or 0)
            a["pr"]+=float(r.get("harga_rata2") or 0); a["ns"]+=1; a["cust"]=max(a["cust"], int(r.get("jumlah_customer") or 0))
        elif y in prev:
            a["prev"]+=float(r.get("revenue") or 0); a["qtyp"]+=float(r.get("quantity") or 0)
            a["prp"]+=float(r.get("harga_rata2") or 0); a["np"]+=1
    items = []
    for it, a in agg.items():
        if a["rev"] <= 0: continue
        price = a["pr"]/a["ns"] if a["ns"] else 0; pricep = a["prp"]/a["np"] if a["np"] else 0
        d = di.get(it, {})
        items.append({"item_no":it,"item_desc":d.get("item_desc"),"kategori":d.get("kategori"),
            "revenue":round(a["rev"]),"qty":round(a["qty"],1),"unit":a["unit"],"customers":a["cust"],
            "growth":_pct(a["rev"],a["prev"]),"delta":round(a["rev"]-a["prev"]),
            "vol_effect":round((a["qty"]-a["qtyp"])*pricep),"price_effect":round(a["qty"]*(price-pricep))})
    items.sort(key=lambda x:-x["revenue"])
    total = sum(i["revenue"] for i in items) or 1
    cum = 0
    for it in items:
        cum += it["revenue"]; it["cum_pct"] = round(cum/total*100,1)
        it["abc"] = "A" if it["cum_pct"]<=80 else "B" if it["cum_pct"]<=95 else "C"
    movers = sorted(items, key=lambda x:x["delta"])
    return {"pareto":items[:150], "n_sku":len(items),
            "a_count":sum(1 for it in items if it["abc"]=="A"),
            "movers":{"up":movers[-10:][::-1],"down":movers[:10]}}


@router.get("/discount")
def discount(years: Optional[str] = Query(None), core_only: bool = Query(True)):
    """PROMPT 6 — Diskon & Harga (agg_discount_category_month). Tanpa margin/HPP."""
    yrs = [int(y) for y in _csv(years)]
    prev = {y-1 for y in yrs}; selset = set(yrs)
    fy = [str(y) for y in sorted(selset | prev)] if yrs else None
    rows = _fetch_all_rows("agg_discount_category_month",
        "kategori,tahun,revenue_gross,revenue_net,disc_amount", years=fy)
    cat = defaultdict(lambda: {"gross":0.,"net":0.,"disc":0.,"netp":0.})
    tot = {"gross":0.,"net":0.,"disc":0.,"netp":0.}
    for r in rows:
        k = r["kategori"]; y = int(r["tahun"])
        if core_only and not config.is_produk_inti(k): continue
        gr=float(r.get("revenue_gross") or 0); nt=float(r.get("revenue_net") or 0); ds=float(r.get("disc_amount") or 0)
        c = cat[k]
        if (not yrs) or (y in selset):
            c["gross"]+=gr; c["net"]+=nt; c["disc"]+=ds; tot["gross"]+=gr; tot["net"]+=nt; tot["disc"]+=ds
        elif y in prev:
            c["netp"]+=nt; tot["netp"]+=nt
    by_cat = sorted(({"kategori":k,"disc_pct":round(v["disc"]/v["gross"]*100,1) if v["gross"] else 0,
                      "revenue":round(v["net"]),"disc_amount":round(v["disc"]),
                      "growth":_pct(v["net"],v["netp"])} for k,v in cat.items() if v["gross"]>0),
                     key=lambda x:-x["disc_pct"])
    kpi = {"revenue_gross":round(tot["gross"]),"revenue_net":round(tot["net"]),
           "disc_amount":round(tot["disc"]),
           "disc_pct":round(tot["disc"]/tot["gross"]*100,1) if tot["gross"] else 0,
           "disc_pct_prev": None,
           "net_growth":_pct(tot["net"],tot["netp"]) if tot["netp"] else None}
    return {"kpi":kpi, "by_cat":by_cat}


@router.get("/qa-reconcile")
def qa_reconcile():
    """PROMPT 7 — rekonsiliasi revenue lintas sumber agregat untuk beberapa filter."""
    out = []
    combos = [("2024 full",["2024"]),("2025 full",["2025"]),("2026 YTD",["2026"]),("Semua",None)]
    for label, yrs in combos:
        cat  = sum(float(r.get("revenue") or 0) for r in _fetch("agg_category_month","revenue",years=yrs))
        cust = sum(float(r.get("revenue") or 0) for r in _fetch("agg_customer_month","revenue",years=yrs))
        slp  = sum(float(r.get("revenue") or 0) for r in _fetch("agg_salesperson_month","revenue",years=yrs))
        base = cust or 1
        diff = max(abs(cat-base), abs(slp-base))/base
        out.append({"filter":label,"category":round(cat),"customer":round(cust),"salesperson":round(slp),
                    "max_diff_pct":round(diff*100,4),"status":"LOLOS" if diff<=0.0001 else "GAGAL"})
    return out


@router.get("/customer-detail")
def customer_detail(code: str = Query(...)):
    db = get_client()
    dc = db.table("dim_customer").select("*").eq("customer_code", code).limit(1).execute().data
    cats = db.table("agg_customer_category").select("kategori,revenue,qty_bills,last_purchase_date").eq("customer_code", code).execute().data or []
    months = db.table("agg_customer_month").select("tahun,bulan,revenue").eq("customer_code", code).execute().data or []
    mmap = defaultdict(float)
    for m in months: mmap[(int(m["tahun"]),int(m["bulan"]))] += float(m.get("revenue") or 0)
    timeline = [{"label":f"{y}-{mo:02d}","revenue":round(v)} for (y,mo),v in sorted(mmap.items())]
    return {"customer": dc[0] if dc else None,
            "categories": sorted(cats, key=lambda x:-(x.get("revenue") or 0)),
            "timeline": timeline}


@router.get("/customer-bridge")
def customer_bridge(years: Optional[str] = Query(None), channels: Optional[str] = Query(None)):
    """Revenue Bridge (waterfall) + Net Customer Growth (New - Lost)."""
    yrs = [int(y) for y in _csv(years)]
    if not yrs:
        yrs = sorted({int(r["tahun"]) for r in _fetch_all_rows("agg_customer_month","tahun")})[-1:] or [2026]
    prev = {y-1 for y in yrs}; selset = set(yrs)
    chs = _csv(channels)
    rows = _fetch("agg_customer_month", "tahun,bulan,channel,customer_code,revenue,status_lifecycle",
                  years=[str(y) for y in sorted(selset|prev)], channels=chs)
    cur_total=prev_total=new_rev=react_rev=0.0
    cur_cust=set(); prev_cust=set(); new_cust=set()
    for r in rows:
        y=int(r["tahun"]); rev=float(r.get("revenue") or 0); code=r.get("customer_code"); st=r.get("status_lifecycle")
        if y in selset:
            cur_total+=rev; cur_cust.add(code)
            if st=="new": new_rev+=rev; new_cust.add(code)
            elif st=="reactivated": react_rev+=rev
        elif y in prev:
            prev_total+=rev; prev_cust.add(code)
    repeat_churn_net = cur_total - prev_total - new_rev - react_rev
    bridge = [
        {"label":"Periode lalu","value":round(prev_total),"type":"base"},
        {"label":"Customer baru","value":round(new_rev),"type":"pos"},
        {"label":"Reactivated","value":round(react_rev),"type":"pos"},
        {"label":"Repeat & churn (net)","value":round(repeat_churn_net),"type":"net"},
        {"label":"Periode ini","value":round(cur_total),"type":"base"},
    ]
    lost = len(prev_cust - cur_cust)
    return {"bridge":bridge,
            "net_growth":{"new":len(new_cust),"lost":lost,"net":len(new_cust)-lost}}


@router.get("/sales-trend")
def sales_trend(years: Optional[str] = Query(None), channels: Optional[str] = Query(None)):
    """Revenue bulanan per salesperson (dijumlah lintas tahun terpilih) -> 12 nilai."""
    yrs = _csv(years); chs = _csv(channels)
    rows = _fetch_all_rows("agg_salesperson_month", "slp_name,bulan,channel,revenue", years=yrs or None)
    if chs:
        rows = [r for r in rows if r.get("channel") in chs]
    series = defaultdict(lambda: [0.0] * 12)
    for r in rows:
        b = int(r.get("bulan") or 0)
        if 1 <= b <= 12:
            m = match_salesperson(r["slp_name"])
            name = m["name"] if m else r["slp_name"]
            series[name][b-1] += float(r.get("revenue") or 0)
    return {k: [round(x) for x in v] for k, v in series.items()}


@router.get("/sales-mix")
def sales_mix(years: Optional[str] = Query(None), channels: Optional[str] = Query(None)):
    """Mix kategori per salesperson (100% stacked)."""
    yrs = _csv(years); chs = _csv(channels)
    rows = _fetch_all_rows("agg_salesperson_category_month", "slp_name,kategori,channel,revenue",
                           years=yrs or None)
    if chs:
        rows = [r for r in rows if r.get("channel") in chs]
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


# ============================ TERRITORY (PROMPT 9) ============================
def _sel_years(years):
    yrs = [int(y) for y in _csv(years)]
    if not yrs:
        rows = _fetch_all_rows("agg_province_month", "tahun")
        yrs = sorted({int(r["tahun"]) for r in rows if r.get("tahun")})[-1:] or [2026]
    return sorted(yrs)


@router.get("/territory")
def territory(years: Optional[str] = Query(None),
              kategori: Optional[str] = Query(None),
              salesperson: Optional[str] = Query(None),
              months: Optional[str] = Query(None)):
    """Semua data page Territory kecuali drill: coverage banner, KPI, per-provinsi
    (peta/ranking/tabel/aktivasi/growth/depth), rollup pulau, rincian Non-Trade,
    heatmap coverage salesperson & penetrasi kategori."""
    yrs = _sel_years(years)
    latest = max(yrs); prev = latest - 1
    mos = set(int(m) for m in _csv(months)) if months else None

    prov_dim = {p["province_code"]: p for p in _fetch_all_rows("dim_province",
                "province_code,province_name,region_pulau")}
    apm = _fetch_all_rows("agg_province_month",
        "province_code,tahun,bulan,revenue,bills,customer_aktif,customer_baru,customer_lost,"
        "revenue_at_risk,customer_overdue,aov")
    dps = _fetch_all_rows("dim_province_stats",
        "province_code,tahun,customer_terdaftar,customer_aktif,customer_tidur,tingkat_aktivasi")
    apc = _fetch_all_rows("agg_province_category", "province_code,kategori,tahun,revenue,jumlah_customer")
    aps = _fetch_all_rows("agg_province_salesperson", "province_code,slp_name,tahun,revenue,jumlah_customer")

    # revenue per provinsi per tahun (untuk growth) + agregat periode terpilih
    rev_py = defaultdict(float)          # (pc, tahun) -> rev
    agg = defaultdict(lambda: {"rev": 0.0, "bills": 0, "overdue": 0, "at_risk": 0.0, "baru": 0})
    for r in apm:
        pc = r["province_code"]; y = int(r["tahun"]); b = int(r.get("bulan") or 0)
        rev = float(r.get("revenue") or 0)
        rev_py[(pc, y)] += rev
        if y in yrs and (mos is None or b in mos):
            a = agg[pc]
            a["rev"] += rev; a["bills"] += int(r.get("bills") or 0)
            a["overdue"] += int(r.get("customer_overdue") or 0)
            a["at_risk"] += float(r.get("revenue_at_risk") or 0)
            a["baru"] += int(r.get("customer_baru") or 0)

    dps_latest = {d["province_code"]: d for d in dps if int(d["tahun"]) == latest}

    # top kategori & salesperson dominan per provinsi (tahun terbaru)
    # kategori bersifat lifetime (agg_province_category disimpan tahun=0)
    kat_by_prov = defaultdict(list); slp_by_prov = defaultdict(list)
    for r in apc:
        kat_by_prov[r["province_code"]].append((r["kategori"], float(r.get("revenue") or 0)))
    for r in aps:
        if int(r["tahun"]) == latest:
            slp_by_prov[r["province_code"]].append((r["slp_name"], float(r.get("revenue") or 0)))

    total_rev_sel = sum(a["rev"] for a in agg.values())
    provinces_out = []
    for pc, p in prov_dim.items():
        a = agg.get(pc, {"rev": 0.0, "bills": 0, "overdue": 0, "at_risk": 0.0, "baru": 0})
        d = dps_latest.get(pc, {})
        aktif = int(d.get("customer_aktif") or 0)
        terdaftar = int(d.get("customer_terdaftar") or 0)
        tidur = int(d.get("customer_tidur") or 0)
        rev = a["rev"]
        cur = rev_py.get((pc, latest), 0.0); pre = rev_py.get((pc, prev), 0.0)
        growth = round((cur - pre) / pre * 100, 1) if pre else None
        kats = sorted(kat_by_prov.get(pc, []), key=lambda x: -x[1])
        slps = sorted(slp_by_prov.get(pc, []), key=lambda x: -x[1])
        slp_tot = sum(v for _, v in slps)
        provinces_out.append({
            "province_code": pc, "province_name": p["province_name"], "region_pulau": p["region_pulau"],
            "revenue": round(rev), "share": round(rev / total_rev_sel * 100, 1) if total_rev_sel else 0,
            "growth_yoy": growth, "bills": a["bills"],
            "aov": round(rev / a["bills"]) if a["bills"] else 0,
            "customer_aktif": aktif, "customer_terdaftar": terdaftar, "customer_tidur": tidur,
            "tingkat_aktivasi": float(d.get("tingkat_aktivasi") or 0),
            "rev_per_cust": round(rev / aktif) if aktif else 0,
            "overdue_rate": round(a["overdue"] / aktif * 100, 1) if aktif else 0,
            "revenue_at_risk": round(a["at_risk"]), "customer_baru": a["baru"],
            "top_kategori": [k for k, _ in kats[:3]],
            "slp_dominan": slps[0][0] if slps else None,
            "slp_share": round(slps[0][1] / slp_tot * 100, 1) if slps and slp_tot else 0,
        })
    provinces_out.sort(key=lambda x: -x["revenue"])

    # rollup pulau
    reg = defaultdict(lambda: {"revenue": 0, "aktif": 0, "terdaftar": 0, "tidur": 0})
    for p in provinces_out:
        r = reg[p["region_pulau"]]
        r["revenue"] += p["revenue"]; r["aktif"] += p["customer_aktif"]
        r["terdaftar"] += p["customer_terdaftar"]; r["tidur"] += p["customer_tidur"]
    regions_out = [{"region_pulau": k, **v,
                    "tingkat_aktivasi": round(v["aktif"] / v["terdaftar"] * 100, 1) if v["terdaftar"] else 0}
                   for k, v in reg.items()]
    regions_out.sort(key=lambda x: -x["revenue"])

    # coverage banner (total = agg_category_month, agar rekonsiliasi dg Overview)
    acm = _fetch("agg_category_month", "tahun,bulan,revenue", years=[str(y) for y in yrs])
    total_all = sum(float(r.get("revenue") or 0) for r in acm
                    if (mos is None or int(r.get("bulan") or 0) in mos))
    nontrade = max(0.0, total_all - total_rev_sel)

    # rincian Non-Trade (lifetime dari dim_customer) — untuk drawer "lihat rincian"
    dc_non = _fetch_all_rows("dim_customer",
        "customer_code,customer_name,total_revenue,non_territory_type,is_territory")
    nt = defaultdict(lambda: {"revenue": 0.0, "n": 0})
    nt_entities = []
    for c in dc_non:
        if c.get("is_territory") is False:
            t = c.get("non_territory_type") or "Belum Terpetakan"
            nt[t]["revenue"] += float(c.get("total_revenue") or 0); nt[t]["n"] += 1
            nt_entities.append({"name": c.get("customer_name"), "type": t,
                                "revenue": round(float(c.get("total_revenue") or 0))})
    nt_entities.sort(key=lambda x: -x["revenue"])
    coverage_details = [{"type": k, "revenue": round(v["revenue"]), "n": v["n"]}
                        for k, v in sorted(nt.items(), key=lambda x: -x[1]["revenue"])]

    # KPI
    prov_aktif = sum(1 for p in provinces_out if p["revenue"] > 0)
    terbesar = provinces_out[0] if provinces_out else None
    growth_cand = [p for p in provinces_out if p["growth_yoy"] is not None and p["revenue"] > 0]
    growth_top = max(growth_cand, key=lambda x: x["growth_yoy"]) if growth_cand else None
    nat_terdaftar = sum(p["customer_terdaftar"] for p in provinces_out)
    nat_aktif = sum(p["customer_aktif"] for p in provinces_out)
    rpc_list = sorted([p["rev_per_cust"] for p in provinces_out if p["rev_per_cust"] > 0])
    rpc_med = rpc_list[len(rpc_list)//2] if rpc_list else 0

    # penetrasi kategori (top 12 kategori by revenue) & coverage salesperson (top 12)
    kat_tot = defaultdict(float)
    for r in apc:
        kat_tot[r["kategori"]] += float(r.get("revenue") or 0)
    top_kats = [k for k, _ in sorted(kat_tot.items(), key=lambda x: -x[1])[:12]]
    pen = {}
    for r in apc:
        if r["kategori"] not in top_kats:
            continue
        pc = r["province_code"]; d = dps_latest.get(pc, {})
        ak = int(d.get("customer_aktif") or 0)
        pen.setdefault(pc, {})[r["kategori"]] = round(int(r.get("jumlah_customer") or 0) / ak * 100, 1) if ak else 0

    slp_tot = defaultdict(float)
    for r in aps:
        if int(r["tahun"]) == latest:
            slp_tot[r["slp_name"]] += float(r.get("revenue") or 0)
    top_slps = [s for s, _ in sorted(slp_tot.items(), key=lambda x: -x[1])[:12]]
    cov = {}; single_dep = {}
    for pc, slps in slp_by_prov.items():
        tot = sum(v for _, v in slps)
        cov[pc] = {s: round(v) for s, v in slps if s in top_slps}
        single_dep[pc] = round(max((v for _, v in slps), default=0) / tot * 100, 1) if tot else 0

    return {
        "years": yrs, "latest_year": latest,
        "coverage": {"pct": round(total_rev_sel / total_all * 100, 1) if total_all else 0,
                     "territory_rev": round(total_rev_sel), "total_rev": round(total_all),
                     "nontrade_rev": round(nontrade)},
        "coverage_details": coverage_details, "nontrade_entities": nt_entities[:50],
        "kpi": {
            "prov_aktif": prov_aktif, "prov_total": len(prov_dim),
            "terbesar": {"name": terbesar["province_name"], "share": terbesar["share"]} if terbesar else None,
            "growth_top": {"name": growth_top["province_name"], "pct": growth_top["growth_yoy"]} if growth_top else None,
            "aktivasi": {"aktif": nat_aktif, "terdaftar": nat_terdaftar,
                         "pct": round(nat_aktif / nat_terdaftar * 100, 1) if nat_terdaftar else 0},
            "rev_per_aktif": round(total_rev_sel / nat_aktif) if nat_aktif else 0,
            "rev_per_aktif_median": rpc_med,
        },
        "provinces": provinces_out, "regions": regions_out,
        "penetration": {"kategori": top_kats, "data": pen},
        "coverage_salesperson": {"salespeople": top_slps, "data": cov, "single_dep": single_dep},
    }


@router.get("/territory-detail")
def territory_detail(province_code: str = Query(...), years: Optional[str] = Query(None)):
    """Drill satu provinsi: tren bulanan vs tahun lalu, akuisisi customer baru per bulan,
    daftar customer (dg flag 'tidur')."""
    yrs = _sel_years(years); latest = max(yrs); prev = latest - 1
    apm = _fetch_all_rows("agg_province_month",
        "province_code,tahun,bulan,revenue,customer_baru")
    apm = [r for r in apm if r["province_code"] == province_code]
    trend = {latest: [0.0]*12, prev: [0.0]*12}
    baru = [0]*12
    for r in apm:
        y = int(r["tahun"]); b = int(r.get("bulan") or 0)
        if 1 <= b <= 12:
            if y in trend:
                trend[y][b-1] += float(r.get("revenue") or 0)
            if y == latest:
                baru[b-1] += int(r.get("customer_baru") or 0)

    dc = _fetch_all_rows("dim_customer",
        "customer_code,customer_name,tier,segmen_rfm,salesperson_utama,status,"
        "days_since_last_order,total_revenue,province_code,is_territory")
    custs = []
    for c in dc:
        if c.get("province_code") != province_code:
            continue
        dsl = c.get("days_since_last_order")
        custs.append({
            "customer_code": c["customer_code"], "customer_name": c.get("customer_name"),
            "tier": c.get("tier"), "segmen_rfm": c.get("segmen_rfm"),
            "salesperson": c.get("salesperson_utama"), "status": c.get("status"),
            "days_since_last_order": dsl, "revenue": round(float(c.get("total_revenue") or 0)),
            "tidur": (dsl is None),   # terdaftar tapi belum pernah/lama tak beli
        })
    custs.sort(key=lambda x: -x["revenue"])
    return {"province_code": province_code,
            "trend": {"labels": MONTHS, "current": [round(x) for x in trend[latest]],
                      "prev": [round(x) for x in trend[prev]], "year": latest, "prev_year": prev},
            "acquisition": {"labels": MONTHS, "data": baru},
            "customers": custs}


@router.get("/territory-meta")
def territory_meta():
    """master_updated_at terbaru untuk footer 'Data wilayah per <tanggal>'."""
    db = get_client()
    try:
        r = db.table("customer_master").select("master_updated_at").order(
            "master_updated_at", desc=True).limit(1).execute().data
        return {"master_updated_at": (r[0]["master_updated_at"] if r else None)}
    except Exception:
        return {"master_updated_at": None}
