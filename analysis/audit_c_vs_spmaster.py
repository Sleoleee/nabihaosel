"""
AUDIT read-only: apakah Kode C di customer master (GroupName) nyambung ke sp_master.kode_sp?
Mengukur seberapa besar 'Kode C -> Salesperson' sudah tercakup sp_master, dan mana yang orphan.

  python analysis/audit_c_vs_spmaster.py --master "C:\\...\\database customer TPF.xlsx" --spmaster "C:\\...\\sp_master.xlsx"

Tidak menyentuh DB. Hanya baca 2 file Excel.
"""
import sys, os, argparse
from collections import Counter
import openpyxl


def read_cols(path, want):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    it = ws.iter_rows(values_only=True)
    header = next(it)
    idx = {}
    for i, h in enumerate(header):
        if h is None:
            continue
        k = str(h).strip().lower().replace(" ", "").replace("/", "").replace("_", "")
        for key, names in want.items():
            if k in names and key not in idx:
                idx[key] = i
    rows = []
    for r in it:
        rows.append({key: (str(r[i]).strip() if i < len(r) and r[i] is not None else "") for key, i in idx.items()})
    wb.close()
    return rows, idx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True, help="database customer TPF.xlsx (GroupName)")
    ap.add_argument("--spmaster", required=True, help="sp_master.xlsx (kode_sp, slp_name)")
    args = ap.parse_args()

    cust, ci = read_cols(args.master, {"group": {"groupname", "group"}, "code": {"cardcode", "customercode", "customervendorcode"}})
    if "group" not in ci:
        raise SystemExit("Kolom GroupName tak ketemu di master customer.")
    spm, si = read_cols(args.spmaster, {"kode": {"kodesp", "kode", "kodec"}, "nama": {"slpname", "namasalesperson", "nama", "salesperson"}})
    if "kode" not in si:
        raise SystemExit(f"Kolom kode_sp tak ketemu di sp_master. Kolom kebaca: {list(si)}")

    # kode_sp -> salesperson (bisa >1 nama per kode)
    kode2sp = {}
    for r in spm:
        k = r.get("kode", "").upper()
        if k:
            kode2sp.setdefault(k, set()).add(r.get("nama", ""))

    # sebaran Kode C di customer + jumlah
    dist = Counter(r["group"].upper() for r in cust if r.get("group"))
    total_cust = sum(dist.values())

    matched, orphan = [], []
    for kc, n in dist.items():
        if kc in kode2sp:
            matched.append((kc, n, sorted(x for x in kode2sp[kc] if x)))
        else:
            orphan.append((kc, n))
    matched.sort(key=lambda x: -x[1]); orphan.sort(key=lambda x: -x[1])
    n_match_cust = sum(n for _, n, _ in matched)
    n_orphan_cust = sum(n for _, n in orphan)

    def pct(a): return f"{a/total_cust*100:.1f}%" if total_cust else "-"

    print("=" * 64)
    print("AUDIT: Kode C (customer GroupName)  vs  sp_master.kode_sp")
    print("=" * 64)
    print(f"Total customer ber-Kode C : {total_cust:,}")
    print(f"Kode C unik di customer    : {len(dist)}")
    print(f"kode_sp unik di sp_master  : {len(kode2sp)}")
    print()
    print(f"[NYAMBUNG]  {len(matched)} Kode C -> ada salesperson di sp_master | {n_match_cust:,} customer ({pct(n_match_cust)})")
    print(f"[ORPHAN]    {len(orphan)} Kode C -> TIDAK ada di sp_master        | {n_orphan_cust:,} customer ({pct(n_orphan_cust)})")
    print()
    print("ORPHAN (Kode C tanpa salesperson di sp_master), urut jumlah customer:")
    for kc, n in orphan[:30]:
        print(f"    {kc:14} {n:>6,} customer")
    print()
    print("Contoh NYAMBUNG (Kode C -> salesperson):")
    for kc, n, nm in matched[:15]:
        print(f"    {kc:10} {n:>6,} cust -> {', '.join(nm) or '(nama kosong)'}")
    print("=" * 64)


if __name__ == "__main__":
    main()
