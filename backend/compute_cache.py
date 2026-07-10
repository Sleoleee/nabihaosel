"""
Jalankan dari folder backend/ setelah setiap upload data:
    python compute_cache.py

Membaca semua transaksi dari Supabase, menghitung semua agregasi lokal,
lalu menyimpan hasil ke tabel dashboard_cache.
"""
import sys, os, json
from collections import defaultdict
from datetime import date
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
sys.path.insert(0, os.path.dirname(__file__))

from utils.db import get_client
from utils.calculations import get_customer_tier

ROW_LIMIT = 1_000_000
MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]

TIER_ORDER = [
    "Tier 1 — ≥30jt","Tier 2 — 20–30jt","Tier 3 — 15–20jt","Tier 4 — 10–15jt",
    "Tier 5 — 7–10jt","Tier 6 — 6–7jt","Tier 7 — 5–6jt","Tier 8 — 4–5jt",
    "Tier 9 — 3–4jt","Tier 10 — 2–3jt","Tier 11 — 1–2jt",
    "Tier 12 — 500rb–1jt","Tier 13 — <500rb",
]


BATCH_SIZE = 5000

def fetch_all(db):
    print("Fetching all transactions from Supabase (paginated)...")
    all_rows = []
    start = 0
    while True:
        end = start + BATCH_SIZE - 1
        batch = (db.table("transactions")
                 .select("customer_code,customer_name,new_row_total,document_number,posting_date,year,kategori,branch")
                 .order("posting_date")
                 .range(start, end)
                 .execute().data)
        if not batch:
            break
        all_rows.extend(batch)
        print(f"  fetched {len(all_rows)} rows...", end="\r")
        if len(batch) < BATCH_SIZE:
            break
        start += BATCH_SIZE
    print(f"\n  Total: {len(all_rows)} rows fetched.")
    return all_rows


def compute_all(rows):
    years_set = sorted(set(str(r["year"]) for r in rows if r.get("year")), reverse=True)

    # Aggregation buckets keyed by (year_or_all, month_or_all)
    kpi       = defaultdict(lambda: {"rev": 0.0, "docs": set(), "custs": set()})
    trend     = defaultdict(float)        # (year, month) → rev
    kat       = defaultdict(float)        # (year_key, month_key, kategori) → rev
    branch_   = defaultdict(float)        # (year_key, month_key, branch) → rev
    bills_rev = defaultdict(lambda: {"docs": set(), "rev": 0.0})  # (year_key, month) → ...

    # Per-customer tracking
    cust_meta  = {}           # code → {name, rev, months, last, first}
    cust_docs  = defaultdict(set)                # code → set of doc numbers
    cust_doc_date = defaultdict(dict)            # code → {doc → first_posting_date}

    for r in rows:
        y     = str(r.get("year")) if r.get("year") is not None else None
        doc   = r.get("document_number")
        code  = r.get("customer_code") or "UNKNOWN"
        rev   = float(r.get("new_row_total") or 0)
        pd_s  = r.get("posting_date") or ""
        month = int(pd_s[5:7]) if len(pd_s) >= 7 else None
        k     = r.get("kategori") or "Lainnya"
        br    = r.get("branch") or "Lainnya"

        # KPI
        for yk in (("all", "all"), (y, "all"), ("all", month), (y, month)):
            if None in yk: continue
            kpi[yk]["rev"] += rev
            if doc: kpi[yk]["docs"].add(doc)
            if code: kpi[yk]["custs"].add(code)

        # Revenue trend (year × month)
        if y and month:
            trend[(y, month)] += rev

        # By kategori
        for yk, mk in ((str(y) if y else None, str(month) if month else None),
                       ("all", str(month) if month else None),
                       (str(y) if y else None, "all"),
                       ("all", "all")):
            if yk is None or mk is None: continue
            kat[(yk, mk, k)] += rev

        # By branch
        for yk, mk in ((str(y) if y else None, str(month) if month else None),
                       ("all", str(month) if month else None),
                       (str(y) if y else None, "all"),
                       ("all", "all")):
            if yk is None or mk is None: continue
            branch_[(yk, mk, br)] += rev

        # Bills/AOV
        for yk in ((str(y) if y else None, month), ("all", month)):
            if yk[0] is None or yk[1] is None: continue
            if doc: bills_rev[yk]["docs"].add(doc)
            bills_rev[yk]["rev"] += rev

        # Customer meta
        if code not in cust_meta:
            cust_meta[code] = {"name": "", "rev": 0.0, "months": set(), "last": "", "first": ""}
        cust_meta[code]["name"] = r.get("customer_name") or code
        cust_meta[code]["rev"] += rev
        if pd_s:
            cust_meta[code]["months"].add(pd_s[:7])
            if pd_s > cust_meta[code]["last"]: cust_meta[code]["last"] = pd_s
            if not cust_meta[code]["first"] or pd_s < cust_meta[code]["first"]:
                cust_meta[code]["first"] = pd_s
        if doc: cust_docs[code].add(doc)
        # Track first posting_date per bill for interval calc
        if doc and pd_s:
            existing = cust_doc_date[code].get(doc)
            if not existing or pd_s < existing:
                cust_doc_date[code][doc] = pd_s

    return {
        "years_set": years_set,
        "kpi": kpi,
        "trend": trend,
        "kat": kat,
        "branch": branch_,
        "bills_rev": bills_rev,
        "cust_meta": cust_meta,
        "cust_docs": cust_docs,
        "cust_doc_date": cust_doc_date,
    }


def build_kpi(agg, yk, mk):
    bucket = agg["kpi"].get((yk, mk), {})
    rev   = bucket.get("rev", 0)
    bills = len(bucket.get("docs", set()))
    custs = len(bucket.get("custs", set()))
    return {"revenue": rev, "bills": bills, "customers": custs, "aov": rev / bills if bills else 0}


def build_trend(agg, y):
    if y == "all":
        years_in = list(agg["years_set"])  # strings like "2025"
    else:
        years_in = [y] if y in agg["years_set"] else []
    result = []
    for m in range(1, 13):
        entry = {"month": MONTHS[m - 1], "month_num": m}
        for yr in years_in:
            entry[yr] = round(agg["trend"].get((yr, m), 0))
        result.append(entry)
    return {"data": result, "years": years_in}


def build_kat(agg, yk, mk):
    grouped = defaultdict(float)
    for (y2, m2, k), rev in agg["kat"].items():
        if y2 == yk and m2 == mk:
            grouped[k] += rev
    return sorted([{"kategori": k, "revenue": round(v)} for k, v in grouped.items()], key=lambda x: -x["revenue"])


def build_branch(agg, yk, mk):
    grouped = defaultdict(float)
    for (y2, m2, b), rev in agg["branch"].items():
        if y2 == yk and m2 == mk:
            grouped[b] += rev
    return sorted([{"branch": b, "revenue": round(v)} for b, v in grouped.items()], key=lambda x: -x["revenue"])


def build_bills_aov(agg, yk):
    result = []
    for m in range(1, 13):
        bucket = agg["bills_rev"].get((yk, m), {})
        bills = len(bucket.get("docs", set()))
        rev = bucket.get("rev", 0)
        result.append({"month": MONTHS[m - 1], "bills": bills,
                        "aov": round(rev / bills) if bills else 0})
    return result


def build_customers(agg):
    cust_meta     = agg["cust_meta"]
    cust_docs     = agg["cust_docs"]
    cust_doc_date = agg["cust_doc_date"]

    all_last = [m["last"] for m in cust_meta.values() if m["last"]]
    cutoff = max(all_last) if all_last else date.today().isoformat()

    rows = []
    for code, meta in cust_meta.items():
        bill_count    = len(cust_docs[code])
        months_active = len(meta["months"])
        avg_monthly   = meta["rev"] / max(1, months_active)
        last          = meta["last"]
        days_since    = (date.fromisoformat(cutoff) - date.fromisoformat(last)).days if last else 9999
        hours_since   = round(days_since * 24.0, 1)

        # Avg interval between bills (in hours)
        bill_dates_sorted = sorted(cust_doc_date[code].values())
        if len(bill_dates_sorted) >= 2:
            intervals_days = [(date.fromisoformat(bill_dates_sorted[i]) - date.fromisoformat(bill_dates_sorted[i-1])).days
                              for i in range(1, len(bill_dates_sorted))]
            avg_interval_hours = round(sum(intervals_days) / len(intervals_days) * 24.0, 1)
        else:
            avg_interval_hours = None

        overdue_ratio = round(hours_since / avg_interval_hours, 2) if avg_interval_hours else None

        rows.append({
            "code": code,
            "name": meta["name"],
            "revenue": round(meta["rev"]),
            "bills": bill_count,
            "months_active": months_active,
            "last_purchase": last,
            "days_since_purchase": days_since,
            "hours_since_last": hours_since,
            "avg_interval_hours": avg_interval_hours,
            "overdue_ratio": overdue_ratio,
            "avg_monthly": round(avg_monthly),
            "tier": get_customer_tier(avg_monthly),
            "rfm_segment": "",  # will be filled after RFM calc
        })

    rows.sort(key=lambda x: -x["revenue"])
    return rows


def compute_rfm_and_attach(customers):
    if not customers:
        return customers, {"matrix": [], "segments": []}

    rec_vals  = sorted(c["hours_since_last"] for c in customers)
    freq_vals = sorted(c["bills"] for c in customers)
    mon_vals  = sorted(c["revenue"] for c in customers)

    def q4(val, vals, rev=False):
        n = len(vals)
        q25, q50, q75 = vals[n//4], vals[n//2], vals[3*n//4]
        if rev: return 4 if val<=q25 else 3 if val<=q50 else 2 if val<=q75 else 1
        return 4 if val>=q75 else 3 if val>=q50 else 2 if val>=q25 else 1

    matrix = defaultdict(lambda: {"count": 0, "revenue": 0})
    seg    = defaultdict(lambda: {"count": 0, "revenue": 0})

    for c in customers:
        r = q4(c["hours_since_last"], rec_vals, rev=True)
        f = q4(c["bills"], freq_vals)
        m = q4(c["revenue"], mon_vals)
        if r>=3 and f>=3 and m>=3: segment = "Champions"
        elif f>=3 and m>=3:        segment = "Loyal"
        elif r<=2 and f>=2 and m>=2: segment = "At Risk"
        elif r==1 and f<=2:        segment = "Lost"
        elif r>=3 and f<=2:        segment = "Promising"
        else:                      segment = "Need Attention"
        c["rfm_segment"] = segment
        k = (f, m)
        matrix[k]["count"] += 1; matrix[k]["revenue"] += c["revenue"]
        seg[segment]["count"] += 1; seg[segment]["revenue"] += c["revenue"]

    rfm = {
        "matrix":   [{"f_score": f, "m_score": m, **v} for (f,m),v in matrix.items()],
        "segments": [{"segment": k, **v} for k,v in seg.items()],
    }
    return customers, rfm


def build_tiers(customers):
    td = defaultdict(lambda: {"count": 0, "revenue": 0, "customers": []})
    for c in customers:
        t = c["tier"]
        td[t]["count"] += 1; td[t]["revenue"] += c["revenue"]; td[t]["customers"].append(c["name"])
    return [{"tier": t, "count": td[t]["count"], "revenue": round(td[t]["revenue"]),
             "customers": td[t]["customers"][:5], "extra": max(0, len(td[t]["customers"])-5)}
            for t in TIER_ORDER]


def build_recency(customers):
    buckets = {"0–7": 0, "8–30": 0, "31–60": 0, "61–90": 0, "91–180": 0, "180+": 0}
    for c in customers:
        d = c["days_since_purchase"]
        if d <= 7:    buckets["0–7"] += 1
        elif d <= 30: buckets["8–30"] += 1
        elif d <= 60: buckets["31–60"] += 1
        elif d <= 90: buckets["61–90"] += 1
        elif d <= 180: buckets["91–180"] += 1
        else:          buckets["180+"] += 1
    return [{"bucket": k, "count": v} for k, v in buckets.items()]


def build_alerts(customers):
    at_risk  = [c for c in customers if c.get("rfm_segment") == "At Risk"]
    lapsed   = [c for c in customers if c.get("overdue_ratio") and c["overdue_ratio"] >= 2.0]
    return {
        "at_risk_count":   len(at_risk),
        "at_risk_revenue": sum(c["revenue"] for c in at_risk),
        "lapsed_count":    len(lapsed),
        "lapsed_revenue":  sum(c["revenue"] for c in lapsed),
    }


def upsert(db, key, payload):
    db.table("dashboard_cache").upsert(
        {"cache_key": key, "payload": payload, "updated_at": "now()"},
        on_conflict="cache_key"
    ).execute()


def main():
    db = get_client()
    rows = fetch_all(db)
    if not rows:
        print("No data found."); return

    years = sorted(set(str(r["year"]) for r in rows if r.get("year")), reverse=True)
    kategori_list = sorted(set(r["kategori"] for r in rows if r.get("kategori")))
    branches = sorted(set(r["branch"] for r in rows if r.get("branch")))
    upsert(db, "filters", {"years": years, "kategori": kategori_list, "branches": branches})
    print("✓ filters")

    print("Computing aggregations...")
    agg = compute_all(rows)

    # Build customer list once (all years) with intervals and RFM
    print("  Computing customer metrics + RFM...")
    customers_all = build_customers(agg)
    customers_all, rfm_all = compute_rfm_and_attach(customers_all)
    upsert(db, "customers__all", customers_all)
    upsert(db, "rfm__all",       rfm_all)
    upsert(db, "tiers__all",     build_tiers(customers_all))
    upsert(db, "recency__all",   build_recency(customers_all))
    upsert(db, "alerts__all",    build_alerts(customers_all))

    # Per-year customer cache
    for y in years:
        yr_rows = [r for r in rows if str(r.get("year")) == y]
        yr_agg = compute_all(yr_rows)
        yr_custs = build_customers(yr_agg)
        yr_custs, yr_rfm = compute_rfm_and_attach(yr_custs)
        upsert(db, f"customers__{y}", yr_custs)
        upsert(db, f"rfm__{y}",       yr_rfm)
        upsert(db, f"tiers__{y}",     build_tiers(yr_custs))
        upsert(db, f"recency__{y}",   build_recency(yr_custs))
        upsert(db, f"alerts__{y}",    build_alerts(yr_custs))

    # Overview metrics: full-year + per-month
    year_keys = ["all"] + years
    for yk in year_keys:
        upsert(db, f"kpi__{yk}",           build_kpi(agg, yk, "all"))
        upsert(db, f"revenue_trend__{yk}", build_trend(agg, yk))
        upsert(db, f"bills_aov__{yk}",     build_bills_aov(agg, yk))
        upsert(db, f"by_kategori__{yk}",   build_kat(agg, yk, "all"))
        upsert(db, f"by_branch__{yk}",     build_branch(agg, yk, "all"))

        for m in range(1, 13):
            ms = str(m)
            upsert(db, f"kpi__{yk}__{ms}",         build_kpi(agg, yk, m))
            upsert(db, f"by_kategori__{yk}__{ms}", build_kat(agg, yk, ms))
            upsert(db, f"by_branch__{yk}__{ms}",   build_branch(agg, yk, ms))

        print(f"  ✓ year={yk}")

    print("\nDone! Cache updated. Dashboard will now read from cache.")


if __name__ == "__main__":
    main()
