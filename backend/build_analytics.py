"""
PROMPT 1 — Pengisi lapisan analitik.
Jalankan dari folder backend/ SETELAH menjalankan analytics_schema.sql di Supabase:
    python build_analytics.py

Alur: fetch transaksi bersih -> build semua dim_/agg_ di Python -> validasi
rekonsiliasi (gagal bila selisih revenue > 0.01%) -> upsert ke tabel.
"""
import sys, os, time, pickle
import statistics
from datetime import date
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
sys.path.insert(0, os.path.dirname(__file__))

import config
from utils.calculations import get_customer_tier
from sales_targets import match_salesperson

SWEEP = 2000
TOL = 0.0001   # 0.01%
PLACEHOLDER_SLP = "-No Sales Employee-"

COLS = ("id,document_number,posting_date,year,customer_code,customer_name,item_no,"
        "item_description,kategori,quantity,unit,harga_awal,harga_jual,"
        "disc_per_row,disc_for_document,new_row_total,slp_name,branch")


# ============================ FETCH ============================
def _retry(fn, tries=5):
    """Ulangi operasi jaringan dengan backoff (2,4,8,16s) — tahan kedip koneksi."""
    delay = 2
    for i in range(tries):
        try:
            return fn()
        except Exception as e:
            if i == tries - 1:
                raise
            print(f"\n  (koneksi error, retry {i+1}/{tries-1} setelah {delay}s: {str(e)[:70]})")
            time.sleep(delay); delay *= 2


CACHE_FILE = os.path.join(os.path.dirname(__file__), ".rows_cache.pkl")

def fetch_clean(db, use_cache=False):
    if use_cache and os.path.exists(CACHE_FILE):
        print(f"Memuat baris dari cache lokal ({CACHE_FILE}) — lewati fetch jaringan.")
        with open(CACHE_FILE, "rb") as f:
            rows = pickle.load(f)
        print(f"{len(rows)} baris dari cache.")
        return rows
    print(f"Fetching transaksi (tahun >= {config.MIN_YEAR}) via keyset id...")
    rows, last_id, scanned = [], 0, 0
    while True:
        batch = _retry(lambda: db.table("transactions").select(COLS)
                       .gt("id", last_id).order("id").limit(SWEEP).execute().data)
        if not batch:
            break
        scanned += len(batch)
        for r in batch:
            y = r.get("year")
            if y is not None and int(y) >= config.MIN_YEAR:
                rows.append(r)
        last_id = batch[-1]["id"]
        print(f"  ...{scanned} disisir, {len(rows)} dipakai", end="\r")
        if len(batch) < SWEEP:
            break
    print(f"\n{len(rows)} baris siap diproses.")
    if use_cache:
        try:
            with open(CACHE_FILE, "wb") as f:
                pickle.dump(rows, f)
            print(f"Baris disimpan ke cache ({CACHE_FILE}). Hapus file itu setelah upload data baru.")
        except Exception as e:
            print(f"(gagal simpan cache: {e})")
    return rows


# ============================ HELPERS ============================
def _f(v):
    try: return float(v)
    except (TypeError, ValueError): return 0.0

def _month_diff(cohort, ym):
    (y0, m0), (y1, m1) = map(lambda s: (int(s[:4]), int(s[5:7])), (cohort, ym))
    return (y1 - y0) * 12 + (m1 - m0)

def q4(val, vals, rev=False):
    n = len(vals)
    if n == 0: return 1
    q25, q50, q75 = vals[n//4], vals[n//2], vals[min(n-1, 3*n//4)]
    if rev:  # nilai kecil = skor tinggi (dipakai untuk Recency ratio)
        return 4 if val<=q25 else 3 if val<=q50 else 2 if val<=q75 else 1
    return 4 if val>=q75 else 3 if val>=q50 else 2 if val>=q25 else 1

def rfm_segment(r, f, m):
    if r>=3 and f>=3 and m>=3: return "Champions"
    if f>=3 and m>=3:          return "Loyal"
    if r<=2 and f>=2 and m>=2: return "At Risk"
    if r==1 and f<=2:          return "Lost"
    if r>=3 and f<=2:          return "Promising"
    return "Need Attention"


# ============================ BUILD ============================
def build_all(rows):
    # akumulator
    cust = defaultdict(lambda: {"rev":0.0,"name":"","months":set(),"docs":set(),
                                "first":"","last":"","slp_rev":defaultdict(float),
                                "ch_rev":defaultdict(float),"kats":set(),"doc_date":{}})
    cm_firstdate = defaultdict(dict)                 # code -> {ym -> min tanggal}
    cm_slp_rev   = defaultdict(lambda: defaultdict(float))  # (code,y,m) -> slp -> rev

    asp   = defaultdict(lambda: {"rev":0.0,"docs":set(),"custs":set()})   # (slp,y,m,ch)
    ascm  = defaultdict(lambda: {"rev":0.0,"docs":set()})                 # (slp,kat,y,m,ch)
    askum_year = defaultdict(lambda: {"rev":0.0,"qty":0.0,"unit":"","custs":set()})  # (item,y)
    cm_ch_rev = defaultdict(lambda: defaultdict(float))                   # (code,y,m) -> ch -> rev
    acm   = defaultdict(lambda: {"rev":0.0,"docs":set(),"custs":set()})   # (kat,y,m,ch)
    askum = defaultdict(lambda: {"rev":0.0,"qty":0.0,"unit":"","custs":set()})  # (item,y,m)
    acustm= defaultdict(lambda: {"rev":0.0,"docs":set()})                 # (code,y,m,ch)
    cm_rev = defaultdict(float)                                           # (code,y,m) -> rev (semua channel)
    acc_cat = defaultdict(lambda: {"rev":0.0,"docs":set(),"last":""})     # (code,kat)
    disc  = defaultdict(lambda: {"gross":0.0,"net":0.0})                  # (kat,y,m)

    docdata = {}                     # doc -> {"cats":set,"year":y}
    katyear_docs = defaultdict(set)  # (kat,year) -> docs
    year_docs = defaultdict(set)     # year -> docs

    total_rev = 0.0
    slp_total = defaultdict(float)

    for r in rows:
        rev  = _f(r.get(config.REVENUE_COLUMN))
        total_rev += rev
        code = r.get("customer_code") or "UNKNOWN"
        doc  = r.get("document_number")
        pd_s = r.get("posting_date") or ""
        if len(pd_s) < 7:
            continue
        y, mo = int(pd_s[:4]), int(pd_s[5:7])
        ym = pd_s[:7]
        kat = (r.get("kategori") or "Lainnya")
        item = r.get("item_no")
        slp = r.get("slp_name") or PLACEHOLDER_SLP
        ch  = config.branch_group(r.get("branch"))
        qty = _f(r.get("quantity"))
        hawal = _f(r.get("harga_awal"))

        c = cust[code]
        c["rev"] += rev; c["name"] = r.get("customer_name") or code
        c["months"].add(ym); c["kats"].add(kat)
        c["slp_rev"][slp] += rev; c["ch_rev"][ch] += rev
        if doc: c["docs"].add(doc)
        if pd_s:
            if pd_s > c["last"]: c["last"] = pd_s
            if not c["first"] or pd_s < c["first"]: c["first"] = pd_s
        if doc and pd_s:
            d = c["doc_date"].get(doc)
            if not d or pd_s < d: c["doc_date"][doc] = pd_s
            fd = cm_firstdate[code].get(ym)
            if not fd or pd_s < fd: cm_firstdate[code][ym] = pd_s
        cm_slp_rev[(code,y,mo)][slp] += rev

        slp_total[slp] += rev
        cm_ch_rev[(code,y,mo)][ch] += rev
        a = asp[(slp,y,mo,ch)]; a["rev"]+=rev; a["custs"].add(code)
        if doc: a["docs"].add(doc)
        s2 = ascm[(slp,kat,y,mo,ch)]; s2["rev"]+=rev
        if doc: s2["docs"].add(doc)
        k = acm[(kat,y,mo,ch)]; k["rev"]+=rev; k["custs"].add(code)
        if doc: k["docs"].add(doc)
        if item:
            sk = askum[(item,y,mo)]; sk["rev"]+=rev; sk["qty"]+=qty; sk["unit"]=r.get("unit") or sk["unit"]; sk["custs"].add(code)
            sy = askum_year[(item,y)]; sy["rev"]+=rev; sy["qty"]+=qty; sy["unit"]=r.get("unit") or sy["unit"]; sy["custs"].add(code)
        cmm = acustm[(code,y,mo,ch)]; cmm["rev"]+=rev
        if doc: cmm["docs"].add(doc)
        cm_rev[(code,y,mo)] += rev
        cc = acc_cat[(code,kat)]; cc["rev"]+=rev
        if doc: cc["docs"].add(doc)
        if pd_s > cc["last"]: cc["last"] = pd_s
        dd = disc[(kat,y,mo)]; dd["gross"] += hawal*qty; dd["net"] += rev

        if doc:
            dg = docdata.setdefault(doc, {"cats":set(),"year":y})
            dg["cats"].add(kat)
            katyear_docs[(kat,y)].add(doc)
            year_docs[y].add(doc)

    # ---------- dim_customer ----------
    cutoff = max((c["last"] for c in cust.values() if c["last"]), default=date.today().isoformat())
    cutoff_d = date.fromisoformat(cutoff)
    intervals_all = []
    dim_customer = {}
    for code, c in cust.items():
        months_active = len(c["months"]) or 1
        bills = len(c["docs"])
        avg_monthly = c["rev"]/months_active
        udates = sorted(set(c["doc_date"].values()))
        gaps = [ (date.fromisoformat(udates[i]) - date.fromisoformat(udates[i-1])).days
                 for i in range(1, len(udates)) ]
        gaps = [g for g in gaps if g > 0]
        interval = statistics.median(gaps) if gaps else None
        if interval: intervals_all.append(interval)
        days_since = (cutoff_d - date.fromisoformat(c["last"])).days if c["last"] else 9999
        if interval:
            ratio = round(days_since/interval, 3)
            status = "Lost" if days_since > config.LOST_MULTIPLIER*interval else ("Overdue" if days_since > interval else "Active")
        else:
            ratio, status = None, "Active"
        monetary = avg_monthly
        frequency = round(bills/months_active, 3)
        dim_customer[code] = {
            "customer_code":code, "customer_name":c["name"],
            "first_order_date":c["first"] or None, "last_order_date":c["last"] or None,
            "total_revenue":round(c["rev"]), "jumlah_bulan_aktif":months_active,
            "avg_spending_per_month_active":round(avg_monthly),
            "tier":get_customer_tier(avg_monthly),
            "interval_normal_hari": round(interval,1) if interval is not None else None,
            "days_since_last_order":days_since, "recency_ratio":ratio,
            "frequency":frequency, "monetary":round(monetary),
            "segmen_rfm":"", "status":status,
            "salesperson_utama": max(c["slp_rev"].items(), key=lambda x:x[1])[0] if c["slp_rev"] else None,
            "channel_utama": max(c["ch_rev"].items(), key=lambda x:x[1])[0] if c["ch_rev"] else None,
            "revenue_at_risk": round(monetary) if status=="Overdue" else 0,
            "jumlah_bills":bills, "jumlah_kategori_pernah_dibeli":len(c["kats"]),
        }

    # ---------- RFM (definisi terkoreksi: R=rasio, F=bills/bulan, M=avg/bulan) ----------
    gmed = statistics.median(intervals_all) if intervals_all else 30
    scored = list(dim_customer.values())
    def eff_r(d):
        return d["recency_ratio"] if d["recency_ratio"] is not None else round(d["days_since_last_order"]/gmed, 3)
    rvals = sorted(eff_r(d) for d in scored)
    fvals = sorted(d["frequency"] for d in scored)
    mvals = sorted(d["monetary"] for d in scored)
    seg_shift_old, seg_shift_new = {}, {}
    # perbandingan metode lama (recency mentah, bills mentah, revenue total) untuk laporan
    old_rvals = sorted(d["days_since_last_order"] for d in scored)
    old_fvals = sorted(d["jumlah_bills"] for d in scored)
    old_mvals = sorted(d["total_revenue"] for d in scored)
    for d in scored:
        r = q4(eff_r(d), rvals, rev=True); f = q4(d["frequency"], fvals); m = q4(d["monetary"], mvals)
        d["segmen_rfm"] = rfm_segment(r, f, m)
        seg_shift_new[d["customer_code"]] = d["segmen_rfm"]
        ro = q4(d["days_since_last_order"], old_rvals, rev=True); fo = q4(d["jumlah_bills"], old_fvals); mo_ = q4(d["total_revenue"], old_mvals)
        seg_shift_old[d["customer_code"]] = rfm_segment(ro, fo, mo_)
    moved = sum(1 for k in seg_shift_new if seg_shift_new[k] != seg_shift_old.get(k))

    # ---------- status lifecycle per (customer, tahun, bulan) ----------
    cm_status = {}
    for code, mdict in cm_firstdate.items():
        interval = dim_customer.get(code, {}).get("interval_normal_hari")
        months_sorted = sorted(mdict.items())                     # [(ym, firstdate)]
        for i, (ym, fd) in enumerate(months_sorted):
            y2, mo2 = int(ym[:4]), int(ym[5:7])
            if i == 0:
                st = "new"
            elif interval:
                gap = (date.fromisoformat(fd) - date.fromisoformat(months_sorted[i-1][1])).days
                st = "reactivated" if gap >= config.REACTIVATE_MULTIPLIER*interval else "repeat"
            else:
                st = "repeat"
            cm_status[(code, y2, mo2)] = st
    lifecycle_by_cm = cm_status

    # ---------- agg_customer_month (per channel) ----------
    agg_customer_month = [{"customer_code":code,"tahun":y,"bulan":mo,"channel":ch,
        "revenue":round(v["rev"]),"bills":len(v["docs"]),
        "status_lifecycle":cm_status.get((code,y,mo),"repeat")}
        for (code,y,mo,ch),v in acustm.items()]

    # ---------- agg_salesperson_month (+ lifecycle via slp dominan customer-bulan) ----------
    asp_life = defaultdict(lambda: {"new":0,"repeat":0,"react":0,"rev_new":0.0,"rev_repeat":0.0,"rev_react":0.0})
    for (code,y,mo), slp_rev in cm_slp_rev.items():
        dom = max(slp_rev.items(), key=lambda x:x[1])[0]
        chrev = cm_ch_rev[(code,y,mo)]
        dom_ch = max(chrev.items(), key=lambda x:x[1])[0] if chrev else "OTHER CHANNEL"
        st = lifecycle_by_cm.get((code,y,mo), "repeat")
        rev = sum(slp_rev.values())
        L = asp_life[(dom,y,mo,dom_ch)]
        if st=="new": L["new"]+=1; L["rev_new"]+=rev
        elif st=="reactivated": L["react"]+=1; L["rev_react"]+=rev
        else: L["repeat"]+=1; L["rev_repeat"]+=rev
    agg_salesperson_month = []
    for (slp,y,mo,ch), v in asp.items():
        bills = len(v["docs"]); L = asp_life.get((slp,y,mo,ch), {})
        agg_salesperson_month.append({"slp_name":slp,"tahun":y,"bulan":mo,"channel":ch,
            "revenue":round(v["rev"]),"bills":bills,
            "aov":round(v["rev"]/bills) if bills else 0,"customer_aktif":len(v["custs"]),
            "customer_new":L.get("new",0),"customer_repeat":L.get("repeat",0),
            "customer_reactivated":L.get("react",0),"customer_lost":0,
            "revenue_new":round(L.get("rev_new",0)),"revenue_repeat":round(L.get("rev_repeat",0)),
            "revenue_reactivated":round(L.get("rev_react",0)),"revenue_lost":0})

    # ---------- agg lain ----------
    agg_salesperson_category_month = [{"slp_name":s,"kategori":k,"tahun":y,"bulan":mo,"channel":ch,
        "revenue":round(v["rev"]),"bills":len(v["docs"])} for (s,k,y,mo,ch),v in ascm.items()]
    agg_sku_year = [{"item_no":it,"tahun":y,"revenue":round(v["rev"]),"quantity":round(v["qty"],2),
        "unit":v["unit"],"jumlah_customer":len(v["custs"]),
        "harga_rata2":round(v["rev"]/v["qty"]) if v["qty"] else 0} for (it,y),v in askum_year.items()]
    agg_category_month = [{"kategori":k,"tahun":y,"bulan":mo,"channel":ch,"revenue":round(v["rev"]),
        "bills":len(v["docs"]),"customer_aktif":len(v["custs"])} for (k,y,mo,ch),v in acm.items()]
    agg_sku_month = [{"item_no":it,"tahun":y,"bulan":mo,"revenue":round(v["rev"]),
        "quantity":round(v["qty"],2),"unit":v["unit"],"jumlah_customer":len(v["custs"]),
        "harga_rata2":round(v["rev"]/v["qty"]) if v["qty"] else 0} for (it,y,mo),v in askum.items()]
    agg_customer_category = [{"customer_code":c,"kategori":k,"revenue":round(v["rev"]),
        "qty_bills":len(v["docs"]),"last_purchase_date":v["last"] or None} for (c,k),v in acc_cat.items()]
    agg_discount_category_month = []
    for (k,y,mo), v in disc.items():
        gross = v["gross"]; damt = gross - v["net"]
        agg_discount_category_month.append({"kategori":k,"tahun":y,"bulan":mo,
            "revenue_gross":round(gross),"revenue_net":round(v["net"]),
            "disc_amount":round(damt),"disc_pct_rata2":round(damt/gross*100,2) if gross>0 else 0})

    # ---------- agg_category_pairing ----------
    pair_count = defaultdict(int)
    for doc, dg in docdata.items():
        cats = sorted(dg["cats"]); y = dg["year"]
        for i in range(len(cats)):
            for j in range(i+1, len(cats)):
                pair_count[(cats[i],cats[j],y)] += 1
    agg_category_pairing = []
    for (a,b,y), cnt in pair_count.items():
        tot = len(year_docs[y]) or 1
        na, nb = len(katyear_docs[(a,y)]), len(katyear_docs[(b,y)])
        support = cnt/tot
        conf = cnt/na if na else 0
        lift = conf/(nb/tot) if nb else 0
        agg_category_pairing.append({"kategori_a":a,"kategori_b":b,"tahun":y,
            "jumlah_nota_bersama":cnt,"support":round(support,5),
            "confidence":round(conf,4),"lift":round(lift,3)})

    # ---------- agg_cohort_retention ----------
    cohort = defaultdict(lambda: {"custs":set(),"rev":0.0})   # (cohort_ym, n)
    cohort_size = defaultdict(set)
    for code, c in cust.items():
        if not c["first"]: continue
        cohort_ym = c["first"][:7]
        cohort_size[cohort_ym].add(code)
        for ym in c["months"]:
            n = _month_diff(cohort_ym, ym)
            cohort[(cohort_ym,n)]["custs"].add(code)
            cohort[(cohort_ym,n)]["rev"] += cm_rev[(code, int(ym[:4]), int(ym[5:7]))]
    agg_cohort_retention = []
    for (cym,n), v in cohort.items():
        size = len(cohort_size[cym]) or 1
        agg_cohort_retention.append({"cohort_bulan":cym,"bulan_ke_n":n,
            "customer_aktif":len(v["custs"]),"revenue":round(v["rev"]),
            "pct_retained":round(len(v["custs"])/size*100,2)})

    # ---------- dim_salesperson ----------
    dim_salesperson = []
    for slp, rev in slp_total.items():
        sp = match_salesperson(slp)
        dim_salesperson.append({"slp_name":slp,"spv":sp["team"] if sp else None,
            "is_tim_inti_k25":bool(sp),"is_non_person":config.is_non_person_slp(slp),
            "total_revenue":round(rev)})

    tables = {
        "dim_customer": list(dim_customer.values()),
        "dim_salesperson": dim_salesperson,
        "agg_salesperson_month": agg_salesperson_month,
        "agg_salesperson_category_month": agg_salesperson_category_month,
        "agg_category_month": agg_category_month,
        "agg_sku_month": agg_sku_month,
        "agg_sku_year": agg_sku_year,
        "agg_customer_month": agg_customer_month,
        "agg_customer_category": agg_customer_category,
        "agg_category_pairing": agg_category_pairing,
        "agg_cohort_retention": agg_cohort_retention,
        "agg_discount_category_month": agg_discount_category_month,
    }
    report = {"total_rev": total_rev, "n_customers": len(dim_customer),
              "seg_moved": moved, "slp_total": slp_total}
    return tables, report


# ============================ VALIDATE ============================
def validate(rows, tables, report):
    total = report["total_rev"]
    msgs, ok = [], True
    def check(name, s):
        nonlocal ok
        diff = abs(s - total) / total if total else 0
        status = "LOLOS" if diff <= TOL else "GAGAL"
        if diff > TOL: ok = False
        msgs.append(f"  [{status}] {name}: {s:,.0f} (selisih {diff*100:.4f}%)")
    msgs.append(f"Total revenue (fact): {total:,.0f}")
    check("Σ agg_salesperson_month", sum(r["revenue"] for r in tables["agg_salesperson_month"]))
    check("Σ agg_category_month",     sum(r["revenue"] for r in tables["agg_category_month"]))
    check("Σ agg_customer_month",     sum(r["revenue"] for r in tables["agg_customer_month"]))
    n_distinct = len(set((r.get("customer_code") or "UNKNOWN") for r in rows
                         if len(r.get("posting_date") or "") >= 7))
    msgs.append(f"  dim_customer: {report['n_customers']} customer (distinct code di fact: {n_distinct})")
    msgs.append(f"  Segmen RFM berpindah akibat koreksi definisi: {report['seg_moved']} customer")
    # SlpName tak dikenal (bukan tim inti & bukan non-person)
    unknown = [(s,rev) for s,rev in report["slp_total"].items()
               if not match_salesperson(s) and not config.is_non_person_slp(s)]
    unknown.sort(key=lambda x:-x[1])
    msgs.append(f"  SlpName di luar tim inti & bukan non-person: {len(unknown)} (top 10 by revenue)")
    for s,rev in unknown[:10]:
        msgs.append(f"      - {s!r}: {rev:,.0f}")
    return ok, msgs


# ============================ WRITE ============================
PK = {
    "dim_customer":"customer_code", "dim_salesperson":"slp_name",
    "agg_salesperson_month":"slp_name,tahun,bulan,channel",
    "agg_salesperson_category_month":"slp_name,kategori,tahun,bulan,channel",
    "agg_category_month":"kategori,tahun,bulan,channel", "agg_sku_month":"item_no,tahun,bulan",
    "agg_sku_year":"item_no,tahun",
    "agg_customer_month":"customer_code,tahun,bulan,channel",
    "agg_customer_category":"customer_code,kategori",
    "agg_category_pairing":"kategori_a,kategori_b,tahun",
    "agg_cohort_retention":"cohort_bulan,bulan_ke_n",
    "agg_discount_category_month":"kategori,tahun,bulan",
}
CHUNK = 1000

def write_tables(db, tables):
    for name, recs in tables.items():
        print(f"  {name}: {len(recs)} baris...", end=" ")
        for i in range(0, len(recs), CHUNK):
            chunk = recs[i:i+CHUNK]
            _retry(lambda: db.table(name).upsert(chunk, on_conflict=PK[name]).execute())
        print("ok")


# ============================ MAIN ============================
def main():
    from utils.db import get_client
    db = get_client()
    use_cache = "--cache" in sys.argv
    rows = fetch_clean(db, use_cache=use_cache)
    if not rows:
        print("Tidak ada data."); return
    print("Membangun agregasi...")
    tables, report = build_all(rows)
    print("\n--- VALIDASI REKONSILIASI ---")
    ok, msgs = validate(rows, tables, report)
    print("\n".join(msgs))
    if not ok:
        print("\n❌ Rekonsiliasi GAGAL (selisih > 0.01%). Penulisan dibatalkan.")
        sys.exit(1)
    print("\n✓ Rekonsiliasi lolos. Menulis ke tabel...")
    write_tables(db, tables)
    print("\nDone! Lapisan analitik terisi.")


if __name__ == "__main__":
    main()
