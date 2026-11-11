"""
AUDIT read-only: kesehatan pencocokan Customer <-> Salesperson (Kode C) <-> Master.
TIDAK menyentuh database. Hanya membaca 2 file Excel dan mencetak laporan janggal.

Tujuan: mengukur SEBELUM membangun mapping berbasis Kode C, di mana saja bocornya:
  - customer di transaksi yang TIDAK ada di master (tak bisa dapat Kode C),
  - master tanpa GroupName (Kode C) kosong,
  - ketidakstabilan SlpName (1 customer banyak SlpName) -> alasan atribusi lama berisik,
  - masalah format kunci join (spasi/kapital) yang bikin "seolah tak ketemu",
  - cakupan % revenue yang bisa terpetakan.

Pakai:
  python analysis/audit_customer_sp_mapping.py ^
    --tx "C:\\...\\20261002 AR Jul sd Sep 2026 SJ Bloomie.xlsx" --sheet SJ ^
    --master "C:\\...\\database customer TPF.xlsx"

(--sheet opsional; mis. 'SJ' untuk memproses sheet SJ saja.)
"""
import sys, os, io, argparse
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
import openpyxl
from utils.parser import parse_excel


def norm_code(v):
    return str(v).strip().upper() if v is not None else ""


def load_master(path):
    """Baca master: cardcode -> {group (C), wilayah, name}. Deteksi header fleksibel."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    it = ws.iter_rows(values_only=True)
    header = next(it)
    idx = {}
    for i, h in enumerate(header):
        if h is None:
            continue
        k = str(h).strip().lower().replace(" ", "").replace("/", "").replace("_", "")
        if k in ("cardcode", "customervendorcode", "customercode"): idx["code"] = i
        elif k in ("groupname", "group"): idx["group"] = i
        elif k == "wilayah": idx["wilayah"] = i
        elif k in ("cardname", "customervendorname", "customername"): idx["name"] = i
    if "code" not in idx:
        raise SystemExit(f"Kolom CardCode tidak ketemu. Header: {header}")
    master = {}
    raw_codes = []
    for r in it:
        code = r[idx["code"]] if idx["code"] < len(r) else None
        if code is None or str(code).strip() == "":
            continue
        raw = str(code).strip()
        raw_codes.append(raw)
        master[norm_code(code)] = {
            "group": (str(r[idx["group"]]).strip() if "group" in idx and r[idx["group"]] is not None else ""),
            "wilayah": (str(r[idx["wilayah"]]).strip() if "wilayah" in idx and r[idx["wilayah"]] is not None else ""),
            "name": (str(r[idx["name"]]).strip() if "name" in idx and r[idx["name"]] is not None else ""),
            "raw": raw,
        }
    wb.close()
    return master, raw_codes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tx", required=True, help="file transaksi (.xlsx)")
    ap.add_argument("--sheet", default=None, help="hanya sheet yang namanya memuat teks ini (mis. SJ)")
    ap.add_argument("--master", required=True, help="database customer TPF.xlsx")
    args = ap.parse_args()

    print("Membaca transaksi...", args.tx, f"[sheet~{args.sheet}]" if args.sheet else "")
    with open(args.tx, "rb") as f:
        by_year = parse_excel(io.BytesIO(f.read()), only_sheet=args.sheet)
    # gabung semua tahun
    recs = [r for (recs_, _sk) in by_year.values() for r in recs_]
    print(f"  {len(recs):,} baris transaksi.")

    print("Membaca master...", args.master)
    master, raw_codes = load_master(args.master)
    print(f"  {len(master):,} customer di master (unik by code).")

    # agregasi per customer dari transaksi
    cust = defaultdict(lambda: {"rev": 0.0, "slp": set(), "months": set(), "branch": set()})
    total_rev = 0.0
    for r in recs:
        code = norm_code(r.get("customer_code"))
        rev = float(r.get("new_row_total") or 0)
        total_rev += rev
        c = cust[code]
        c["rev"] += rev
        if r.get("slp_name"): c["slp"].add(str(r["slp_name"]).strip())
        pd_ = str(r.get("posting_date") or "")
        if len(pd_) >= 7: c["months"].add(pd_[:7])
        if r.get("branch"): c["branch"].add(str(r["branch"]).strip())

    n_cust = len(cust)
    # ---- A. coverage join ke master ----
    found = [k for k in cust if k in master]
    missing = [k for k in cust if k not in master]
    rev_found = sum(cust[k]["rev"] for k in found)
    rev_missing = sum(cust[k]["rev"] for k in missing)

    # ---- B. Kode C (GroupName) coverage pada yang ketemu ----
    with_c = [k for k in found if master[k]["group"]]
    no_c = [k for k in found if not master[k]["group"]]
    c_hold = defaultdict(lambda: {"n": 0, "rev": 0.0})
    for k in with_c:
        g = master[k]["group"]; c_hold[g]["n"] += 1; c_hold[g]["rev"] += cust[k]["rev"]

    # ---- C. ketidakstabilan SlpName ----
    multi_slp = [(k, cust[k]) for k in cust if len(cust[k]["slp"]) > 1]
    multi_slp.sort(key=lambda x: -x[1]["rev"])

    # ---- E. masalah format kunci (ketemu hanya setelah dinormalisasi) ----
    raw_set = set(raw_codes)
    norm_raw = {norm_code(c) for c in raw_codes}
    # customer transaksi yang hanya cocok setelah strip/upper (indikasi beda format)
    fuzzy_key = [k for k in missing if k in norm_raw]

    def pct(a, b): return f"{a/b*100:.1f}%" if b else "-"

    L = []
    L.append("=" * 64)
    L.append("LAPORAN AUDIT: Customer <-> Kode C <-> Master  (read-only)")
    L.append("=" * 64)
    L.append(f"Total revenue transaksi      : {total_rev:,.0f}")
    L.append(f"Customer unik di transaksi   : {n_cust:,}")
    L.append("")
    L.append("[A] JOIN transaksi -> master (by Customer/Vendor_Code)")
    L.append(f"    ketemu di master         : {len(found):,}  ({pct(len(found), n_cust)}) | revenue {pct(rev_found, total_rev)}")
    L.append(f"    TIDAK ada di master      : {len(missing):,}  ({pct(len(missing), n_cust)}) | revenue {pct(rev_missing, total_rev)}  <- tak bisa dapat Kode C")
    if fuzzy_key:
        L.append(f"    (dari yg 'tak ada', {len(fuzzy_key)} sebenarnya cocok setelah strip/UPPER -> masalah FORMAT, bukan hilang)")
    L.append("")
    L.append("[B] Kode C (GroupName) pada customer yang KETEMU di master")
    L.append(f"    punya Kode C             : {len(with_c):,}  ({pct(len(with_c), len(found))})")
    L.append(f"    Kode C KOSONG            : {len(no_c):,}  <- pemegang tak jelas")
    L.append(f"    jumlah Kode C berbeda    : {len(c_hold):,}")
    top_c = sorted(c_hold.items(), key=lambda x: -x[1]["rev"])[:15]
    L.append("    Top Kode C (by revenue): " + ", ".join(f"{g}({v['n']}cust)" for g, v in top_c))
    L.append("")
    L.append("[C] Ketidakstabilan SlpName (alasan atribusi lama berisik)")
    L.append(f"    customer dgn >1 SlpName  : {len(multi_slp):,}  ({pct(len(multi_slp), n_cust)})")
    for k, c in multi_slp[:8]:
        nm = master.get(k, {}).get("name", "") or (k)
        L.append(f"      - {nm[:28]:28} rev {c['rev']:>14,.0f} | SlpName: {sorted(c['slp'])[:4]}")
    L.append("")
    L.append("[D] Contoh customer TIDAK ADA di master (sample 10, by revenue)")
    for k in sorted(missing, key=lambda x: -cust[x]["rev"])[:10]:
        L.append(f"      - {k:16} rev {cust[k]['rev']:>14,.0f} | SlpName {sorted(cust[k]['slp'])[:3]}")
    L.append("")
    L.append("Catatan: Kode C -> NAMA salesperson per bulan BELUM ada sebagai file.")
    L.append("Itu tabel yang perlu kamu siapkan (per customer per bulan).")
    L.append("=" * 64)
    print("\n".join(L))


if __name__ == "__main__":
    main()
