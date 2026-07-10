"""
Jalankan dari folder backend/:
    python compute_cache.py

Script ini membaca semua data dari Supabase, menghitung semua agregasi
di Python (lokal), lalu menyimpan hasilnya ke tabel dashboard_cache.
Dashboard hanya perlu baca 1 baris per key — sangat cepat.

Jalankan ulang setiap kali ada upload data baru.
"""
import sys, os, json
from collections import defaultdict
from datetime import date

sys.path.insert(0, os.path.dirname(__file__))
from utils.db import get_client
from utils.calculations import get_customer_tier

ROW_LIMIT = 1_000_000
MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]


def fetch_all(db):
    print("Fetching all transactions from Supabase...")
    rows = (db.table("transactions")
            .select("customer_code,customer_name,new_row_total,document_number,posting_date,year,kategori,branch")
            .order("posting_date")
            .limit(ROW_LIMIT)
            .execute().data)
    print(f"  {len(rows)} rows fetched.")
    return rows


def compute_all(rows):
    """Compute all aggregations needed by the dashboard in one pass."""

    years_set = sorted(set(r["year"] for r in rows if r.get("year")), reverse=True)

    # per-row groupings
    kpi_by = defaultdict(lambda: {"rev": 0, "docs": set(), "custs": set()})
    trend_by = defaultdict(float)          # (year, month) → rev
    kat_by = defaultdict(float)            # (year, kategori) → rev
    branch_by = defaultdict(float)         # (year, branch) → rev
    bills_by = defaultdict(lambda: {"docs": set(), "rev": 0})  # (year, month) → {docs, rev}
    cust_by = defaultdict(lambda: {"name": "", "rev": 0, "docs": set(), "months": set(), "last": ""})

    for r in rows:
        y = r.get("year")
        doc = r.get("document_number")
        code = r.get("customer_code") or "UNKNOWN"
        rev = r.get("new_row_total") or 0
        pd_str = r.get("posting_date") or ""
        month = int(pd_str[5:7]) if pd_str and len(pd_str) >= 7 else None
        kat = r.get("kategori") or "Lainnya"
        br = r.get("branch") or "Lainnya"

        # KPI — keyed by (year, month, kategori, branch) but we only store
        # full-year aggregates; month/kat/branch filtering done in backend from sub-keys
        kpi_by[("all", "all", "all", "all")]["rev"] += rev
        if doc: kpi_by[("all", "all", "all", "all")]["docs"].add(doc)
        if code: kpi_by[("all", "all", "all", "all")]["custs"].add(code)

        if y:
            kpi_by[(y, "all", "all", "all")]["rev"] += rev
            if doc: kpi_by[(y, "all", "all", "all")]["docs"].add(doc)
            if code: kpi_by[(y, "all", "all", "all")]["custs"].add(code)

        # Revenue trend
        if y and month:
            trend_by[(y, month)] += rev
            trend_by[("all", month)] += rev

        # By kategori
        if y:
            kat_by[(y, kat)] += rev
        kat_by[("all", kat)] += rev

        # By branch
        if y:
            branch_by[(y, br)] += rev
        branch_by[("all", br)] += rev

        # Bills/AOV
        if y and month:
            if doc: bills_by[(y, month)]["docs"].add(doc)
            bills_by[(y, month)]["rev"] += rev
            if doc: bills_by[("all", month)]["docs"].add(doc)
            bills_by[("all", month)]["rev"] += rev

        # Customer summary
        cust_by[code]["name"] = r.get("customer_name") or code
        cust_by[code]["rev"] += rev
        if doc: cust_by[code]["docs"].add(doc)
        if pd_str:
            cust_by[code]["months"].add(pd_str[:7])
            if pd_str > cust_by[code]["last"]:
                cust_by[code]["last"] = pd_str

    return {
        "years_set": years_set,
        "kpi_by": kpi_by,
        "trend_by": trend_by,
        "kat_by": kat_by,
        "branch_by": branch_by,
        "bills_by": bills_by,
        "cust_by": cust_by,
    }


def build_kpi(agg, y):
    bucket = agg["kpi_by"].get((y, "all", "all", "all"), {})
    rev = bucket.get("rev", 0)
    bills = len(bucket.get("docs", set()))
    custs = len(bucket.get("custs", set()))
    return {"revenue": rev, "bills": bills, "customers": custs, "aov": rev / bills if bills else 0}


def build_trend(agg, y):
    years_in = agg["years_set"] if y == "all" else ([int(y)] if int(y) in agg["years_set"] else [])
    result = []
    for m in range(1, 13):
        entry = {"month": MONTHS[m - 1], "month_num": m}
        for yr in years_in:
            entry[str(yr)] = round(agg["trend_by"].get((yr, m), 0))
        result.append(entry)
    return {"data": result, "years": years_in}


def build_kat(agg, y):
    grouped = defaultdict(float)
    for (yr, kat), rev in agg["kat_by"].items():
        if y == "all" and yr == "all":
            grouped[kat] += rev
        elif str(yr) == str(y):
            grouped[kat] += rev
    return sorted([{"kategori": k, "revenue": round(v)} for k, v in grouped.items()], key=lambda x: -x["revenue"])


def build_branch(agg, y):
    grouped = defaultdict(float)
    for (yr, br), rev in agg["branch_by"].items():
        if y == "all" and yr == "all":
            grouped[br] += rev
        elif str(yr) == str(y):
            grouped[br] += rev
    return sorted([{"branch": b, "revenue": round(v)} for b, v in grouped.items()], key=lambda x: -x["revenue"])


def build_bills_aov(agg, y):
    result = []
    for m in range(1, 13):
        k = ("all", m) if y == "all" else (int(y), m)
        bucket = agg["bills_by"].get(k, {})
        bills = len(bucket.get("docs", set()))
        rev = bucket.get("rev", 0)
        result.append({"month": MONTHS[m - 1], "bills": bills, "aov": round(rev / bills) if bills else 0})
    return result


def build_customers(agg, y):
    """Returns customer rows sorted by revenue desc."""
    cust_by = agg["cust_by"]
    all_dates = [s["last"] for s in cust_by.values() if s["last"]]
    cutoff = max(all_dates) if all_dates else date.today().isoformat()

    rows = []
    for code, s in cust_by.items():
        months_active = len(s["months"])
        avg = s["rev"] / max(1, months_active)
        last = s["last"]
        days = (date.fromisoformat(cutoff) - date.fromisoformat(last)).days if last else 9999
        rows.append({
            "code": code,
            "name": s["name"],
            "revenue": round(s["rev"]),
            "bills": len(s["docs"]),
            "months_active": months_active,
            "last_purchase": last,
            "days_since_purchase": days,
            "avg_monthly": round(avg),
            "tier": get_customer_tier(avg),
        })

    rows.sort(key=lambda x: -x["revenue"])
    return rows


def build_rfm(customers):
    if not customers:
        return {"matrix": [], "segments": []}

    rec_vals = sorted(c["days_since_purchase"] for c in customers)
    freq_vals = sorted(c["bills"] for c in customers)
    mon_vals = sorted(c["revenue"] for c in customers)

    def q4(val, vals, rev=False):
        n = len(vals)
        q25, q50, q75 = vals[n // 4], vals[n // 2], vals[3 * n // 4]
        if rev: return 4 if val <= q25 else 3 if val <= q50 else 2 if val <= q75 else 1
        return 4 if val >= q75 else 3 if val >= q50 else 2 if val >= q25 else 1

    matrix = defaultdict(lambda: {"count": 0, "revenue": 0})
    seg = defaultdict(lambda: {"count": 0, "revenue": 0})
    for c in customers:
        r = q4(c["days_since_purchase"], rec_vals, rev=True)
        f = q4(c["bills"], freq_vals)
        m = q4(c["revenue"], mon_vals)
        if r >= 3 and f >= 3 and m >= 3: segment = "Champions"
        elif f >= 3 and m >= 3: segment = "Loyal"
        elif r <= 2 and f >= 2 and m >= 2: segment = "At Risk"
        elif r == 1 and f <= 2: segment = "Lost"
        elif r >= 3 and f <= 2: segment = "Promising"
        else: segment = "Need Attention"
        k = (f, m)
        matrix[k]["count"] += 1
        matrix[k]["revenue"] += c["revenue"]
        seg[segment]["count"] += 1
        seg[segment]["revenue"] += c["revenue"]

    return {
        "matrix": [{"f_score": fs, "m_score": ms, **v} for (fs, ms), v in matrix.items()],
        "segments": [{"segment": k, **v} for k, v in seg.items()],
    }


def build_tiers(customers):
    tier_order = [
        "Tier 1 — ≥30jt","Tier 2 — 20–30jt","Tier 3 — 15–20jt","Tier 4 — 10–15jt",
        "Tier 5 — 7–10jt","Tier 6 — 6–7jt","Tier 7 — 5–6jt","Tier 8 — 4–5jt",
        "Tier 9 — 3–4jt","Tier 10 — 2–3jt","Tier 11 — 1–2jt",
        "Tier 12 — 500rb–1jt","Tier 13 — <500rb",
    ]
    td = defaultdict(lambda: {"count": 0, "revenue": 0, "customers": []})
    for c in customers:
        t = c["tier"]
        td[t]["count"] += 1
        td[t]["revenue"] += c["revenue"]
        td[t]["customers"].append(c["name"])
    return [{"tier": t, "count": td[t]["count"], "revenue": round(td[t]["revenue"]),
             "customers": td[t]["customers"][:5], "extra": max(0, len(td[t]["customers"]) - 5)}
            for t in tier_order]


def build_recency(customers):
    cutoff_days = {c["code"]: c["days_since_purchase"] for c in customers}
    buckets = {"0–30": 0, "31–60": 0, "61–90": 0, "91–180": 0, "180+": 0}
    for d in cutoff_days.values():
        if d <= 30: buckets["0–30"] += 1
        elif d <= 60: buckets["31–60"] += 1
        elif d <= 90: buckets["61–90"] += 1
        elif d <= 180: buckets["91–180"] += 1
        else: buckets["180+"] += 1
    return [{"bucket": k, "count": v} for k, v in buckets.items()]


def upsert(db, key, payload):
    db.table("dashboard_cache").upsert(
        {"cache_key": key, "payload": payload, "updated_at": "now()"},
        on_conflict="cache_key"
    ).execute()


def main():
    db = get_client()
    rows = fetch_all(db)
    if not rows:
        print("No data found.")
        return

    # Distinct filter values
    years = sorted(set(r["year"] for r in rows if r.get("year")), reverse=True)
    kategori_list = sorted(set(r["kategori"] for r in rows if r.get("kategori")))
    branches = sorted(set(r["branch"] for r in rows if r.get("branch")))
    filters_payload = {"years": years, "kategori": kategori_list, "branches": branches}
    upsert(db, "filters", filters_payload)
    print("✓ filters")

    print("Computing aggregations...")
    agg = compute_all(rows)

    year_keys = ["all"] + [str(y) for y in years]
    for y in year_keys:
        kpi = build_kpi(agg, y)
        upsert(db, f"kpi__{y}", kpi)

        trend = build_trend(agg, y)
        upsert(db, f"revenue_trend__{y}", trend)

        kat = build_kat(agg, y)
        upsert(db, f"by_kategori__{y}", kat)

        br = build_branch(agg, y)
        upsert(db, f"by_branch__{y}", br)

        baov = build_bills_aov(agg, y)
        upsert(db, f"bills_aov__{y}", baov)

        # For customer endpoints, compute for "all" only or filter by year
        if y == "all":
            customers = build_customers(agg, y)
        else:
            # filter rows by year then recompute
            yr_rows = [r for r in rows if str(r.get("year")) == y]
            yr_agg = compute_all(yr_rows)
            customers = build_customers(yr_agg, "all")

        upsert(db, f"customers__{y}", customers)
        upsert(db, f"rfm__{y}", build_rfm(customers))
        upsert(db, f"tiers__{y}", build_tiers(customers))
        upsert(db, f"recency__{y}", build_recency(customers))
        print(f"  ✓ year={y}")

    print("\nDone! Cache updated. Dashboard will now read from cache.")


if __name__ == "__main__":
    main()
