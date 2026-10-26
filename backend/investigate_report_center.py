"""
FASE 0 Report Center — investigasi read-only atas SQLite lokal.
TIDAK mengubah kode/DB. Menjawab poin 2,3,4,7 dari PROMPT_CLAUDE_CODE_REPORT_CENTER.

  python investigate_report_center.py [--reorder-month 2026-09]

Poin 1,5,6,8 dijawab terpisah dari kode (lihat laporan Fase 0).
"""
import sys, os, argparse
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config
import local_store

REV = config.REVENUE_COLUMN
TOKO_CHANNELS = {"SUKSES JAYA", "NAMI", "BLOOMIE"}
# Brand = nilai Kategori khusus (sumber otoritatif, bukan keyword deskripsi).
BRAND_CATEGORIES = {
    "ROCHE": "Roche",
    "MIMORI": "Mimori",
    "GLIMORE": "Glimore",
    "BLISS BEAUTY": "Bliss Beauty",
    "AKSESORIS RAMBUT KAMINO": "Kamino",
}


def brand_of(kategori):
    return BRAND_CATEGORIES.get(str(kategori or "").strip().upper())


def ym_of(posting):
    d = str(posting or "")
    try:
        return (int(d[:4]), int(d[5:7]))
    except Exception:
        return None


def qf(v):
    try: return float(v)
    except Exception: return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reorder-month", default="2026-09")
    args = ap.parse_args()
    ry, rm = int(args.reorder_month[:4]), int(args.reorder_month[5:7])
    M = (ry, rm)

    conn = local_store.connect(); local_store.ensure_schema(conn)
    total = local_store.count(conn)
    print(f"Membaca {total} baris (tahun >= {config.MIN_YEAR})...\n")

    brand_cache = {}
    item_rev = defaultdict(float); item_desc = {}
    brand_rev = defaultdict(float)                      # brand(None=unmapped) -> revenue
    group_rev = defaultdict(lambda: defaultdict(float)) # tahun -> grup omset -> revenue
    chan_month_rev = defaultdict(float)                 # (channel, y, m) -> revenue
    chan_month_doc = defaultdict(set)
    # reorder: (brand, customer) -> set(ym)
    bc_months = defaultdict(set)

    for r in local_store.iter_rows(conn, where="CAST(year AS INTEGER) >= ?", params=(config.MIN_YEAR,)):
        rev = qf(r.get(REV)); it = r.get("item_no")
        ch = config.branch_group(r.get("branch"))
        ym = ym_of(r.get("posting_date"))
        y = ym[0] if ym else None
        if it not in brand_cache:
            brand_cache[it] = brand_of(r.get("kategori"))
            item_desc.setdefault(it, r.get("item_description"))
        br = brand_cache[it]
        item_rev[it] += rev
        brand_rev[br] += rev
        # kelompok omset
        if ch in TOKO_CHANNELS:
            grp = "TOKO"
        elif br is not None:
            grp = "BRAND"
        else:
            grp = "LAINNYA"
        if y:
            group_rev[y][grp] += rev
        if ym:
            chan_month_rev[(ch, ym[0], ym[1])] += rev
            if r.get("document_number") is not None:
                chan_month_doc[(ch, ym[0], ym[1])].add(r.get("document_number"))
        # reorder tracking (brand pembeli per customer per bulan)
        cust = r.get("customer_code")
        if br is not None and cust and ym:
            bc_months[(br, cust)].add(ym)
    conn.close()

    # ---------- POIN 2: brand mapping ----------
    print("=" * 72); print("POIN 2 — PEMETAAN BRAND (match kata kunci di deskripsi/kode item)"); print("=" * 72)
    tot = sum(brand_rev.values()) or 1
    for b in ["Mimori", "Roche", "Glimore", "Bliss Beauty", "Kamino"]:
        print(f"  {b:<14} Rp{round(brand_rev.get(b,0)):>18,}  ({brand_rev.get(b,0)/tot*100:5.2f}%)")
    unmapped = brand_rev.get(None, 0)
    print(f"  {'(tak terpetakan)':<14} Rp{round(unmapped):>18,}  ({unmapped/tot*100:5.2f}%)")
    print(f"\n  % revenue TIDAK terpetakan ke brand: {unmapped/tot*100:.2f}%")
    print("\n  20 item TAK TERPETAKAN teratas (by revenue):")
    un_items = sorted(((rv, it) for it, rv in item_rev.items() if brand_cache.get(it) is None), reverse=True)[:20]
    for rv, it in un_items:
        print(f"    {it:<22} Rp{round(rv):>14,}  | {str(item_desc.get(it,''))[:46]}")

    # ---------- POIN 3: kelompok omset ----------
    print("\n" + "=" * 72); print("POIN 3 — PORSI KELOMPOK OMSET (TOKO / BRAND / LAINNYA)"); print("=" * 72)
    for y in sorted(group_rev):
        gy = group_rev[y]; ty = sum(gy.values()) or 1
        print(f"  Tahun {y}: Toko {gy.get('TOKO',0)/ty*100:5.1f}%  | Brand {gy.get('BRAND',0)/ty*100:5.1f}%  | Lainnya {gy.get('LAINNYA',0)/ty*100:5.1f}%")
    print("  Target Sep 2026 (template): Toko 38,3% | Brand 27,6% | Lainnya 34,1%")

    # ---------- POIN 4: brand reorder rate ----------
    print("\n" + "=" * 72); print(f"POIN 4 — BRAND REORDER RATE (bulan M = {ry}-{rm:02d})"); print("=" * 72)
    def prior3(ym):
        y, m = ym; out = []
        for k in (1, 2, 3):
            mm = m - k; yy = y
            while mm <= 0: mm += 12; yy -= 1
            out.append((yy, mm))
        return set(out)
    P3 = prior3(M)
    print("  baseline: Kamino 26,4% | Roche 30% | Glimore 16,5% | Mimori 20% | Others 15%")
    print(f"  (a) = %pembeli brand di M yang PERNAH beli brand itu sebelum M")
    print(f"  (b) = %pembeli brand di 3 bln sebelum M ({sorted(P3)}) yang beli lagi di M\n")
    print(f"  {'Brand':<14}{'buyer_M':>9}{'def(a)':>9}{'def(b)':>9}")
    brands_list = ["Kamino", "Roche", "Glimore", "Mimori", "Bliss Beauty"]
    # kumpulkan per brand
    per_brand = defaultdict(lambda: {"M": set(), "before": set(), "p3": set()})
    for (br, cust), mset in bc_months.items():
        pb = per_brand[br]
        if M in mset: pb["M"].add(cust)
        if any(x < M for x in mset): pb["before"].add(cust)
        if mset & P3: pb["p3"].add(cust)
    def rate(br):
        pb = per_brand[br]
        a = len(pb["M"] & pb["before"]) / len(pb["M"]) if pb["M"] else 0
        b = len(pb["p3"] & pb["M"]) / len(pb["p3"]) if pb["p3"] else 0
        return len(pb["M"]), a, b
    for br in brands_list:
        n, a, b = rate(br)
        print(f"  {br:<14}{n:>9}{a*100:>8.1f}%{b*100:>8.1f}%")
    # Others varian: Bliss saja vs semua non-4-brand
    print("\n  Others — kandidat definisi:")
    n, a, b = rate("Bliss Beauty")
    print(f"    Others=Bliss Beauty saja : def(a) {a*100:.1f}% | def(b) {b*100:.1f}%  (buyer_M {n})")

    # ---------- POIN 7: matriks channel x bulan ----------
    print("\n" + "=" * 72); print("POIN 7 — MATRIKS CHANNEL x BULAN (✓=ada transaksi)"); print("=" * 72)
    months = sorted({(y, m) for (_, y, m) in chan_month_rev})
    hdr = "  " + f"{'Channel':<14}" + "".join(f"{y%100:02d}{m:02d} " for (y, m) in months)
    print(hdr)
    for ch in config.BRANCH_GROUP_ORDER:
        cells = []
        for (y, m) in months:
            cells.append(" ✓   " if chan_month_rev.get((ch, y, m), 0) > 0 else " ·   ")
        print(f"  {ch:<14}" + "".join(cells))
    print("\n  (· = tidak ada transaksi channel itu di bulan tsb)")
    print("\nSelesai (read-only).")


if __name__ == "__main__":
    main()
