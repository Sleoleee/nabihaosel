"""
SCAN coverage: berapa Kode C (yang memegang customer) yang TERCOVER oleh file target,
dipecah per CHANNEL. Read-only; TIDAK menulis DB, TIDAK meng-embed Excel ke kode.

  python analysis/scan_c_target_coverage.py ^
    --master "C:\\Users\\HP 14s\\Downloads\\Data TPF\\database customer TPF.xlsx" ^
    --target "C:\\Users\\HP 14s\\Downloads\\Data TPF\\Target Revenue Each SP Part 1.xlsx" ^
    --target "C:\\Users\\HP 14s\\Downloads\\Data TPF\\Revisi ( IV) target Agustus - Dec 2026.xlsx"

Kode C diambil dari GroupName master; 'tercover' = kode itu muncul di file target.
Channel per customer dihitung dari transaksi (SQLite lokal, 2025-2026).
"""
import sys, os, argparse
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
import local_store
import config
import openpyxl

REV = "new_row_total"


def norm(v):
    return str(v).strip().upper() if v is not None else ""


def load_master_group(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    it = ws.iter_rows(values_only=True); header = next(it)
    idx = {}
    for i, h in enumerate(header):
        if h is None: continue
        k = str(h).strip().lower().replace(" ", "").replace("/", "").replace("_", "")
        if k in ("cardcode", "customercode", "customervendorcode"): idx["code"] = i
        elif k in ("groupname", "group"): idx["group"] = i
    code2c = {}
    for r in it:
        c = norm(r[idx["code"]]) if idx["code"] < len(r) else ""
        g = norm(r[idx["group"]]) if idx["group"] < len(r) and r[idx["group"]] is not None else ""
        if c and g:
            code2c[c] = g
    wb.close()
    return code2c


def parse_target(path, valid_codes):
    """Kembalikan {kode_c: nama} utk cell yg cocok dg kode valid; nama = cell kanan non-numerik."""
    found = {}
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    for sn in wb.sheetnames:
        for row in wb[sn].iter_rows(values_only=True):
            cells = list(row)
            for i, cell in enumerate(cells):
                kc = norm(cell)
                if kc in valid_codes:
                    nm = ""
                    for j in range(i + 1, min(i + 3, len(cells))):
                        v = cells[j]
                        if v is None: continue
                        s = str(v).strip()
                        try:
                            float(s.replace(",", "")); continue   # angka -> lewati
                        except ValueError:
                            nm = s; break
                    found.setdefault(kc, nm)
    wb.close()
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True)
    ap.add_argument("--target", action="append", required=True)
    args = ap.parse_args()

    code2c = load_master_group(args.master)
    valid_c = set(code2c.values())

    covered = {}
    for t in args.target:
        for kc, nm in parse_target(t, valid_c).items():
            covered.setdefault(kc, nm)

    # channel + revenue per customer dari SQLite
    conn = local_store.connect(); local_store.ensure_schema(conn)
    cust_ch_rev = defaultdict(lambda: defaultdict(float))
    for r in local_store.iter_rows(conn, cols=["customer_code", "branch", REV, "year", "posting_date"]):
        d = r.get("posting_date") or ""; y = str(r.get("year") or "")
        if (y[:4] or d[:4]) not in ("2025", "2026"): continue
        code = norm(r.get("customer_code"))
        if not code: continue
        cust_ch_rev[code][config.branch_group(r.get("branch"))] += float(r.get(REV) or 0)
    conn.close()

    # agregasi per channel: total vs tercover
    ch = defaultdict(lambda: {"cust": 0, "rev": 0.0, "cov_cust": 0, "cov_rev": 0.0, "noc_cust": 0, "noc_rev": 0.0})
    for code, chrev in cust_ch_rev.items():
        dom = max(chrev.items(), key=lambda x: x[1])[0] if chrev else "OTHER CHANNEL"
        rev = sum(chrev.values())
        kc = code2c.get(code)
        e = ch[dom]; e["cust"] += 1; e["rev"] += rev
        if not kc:
            e["noc_cust"] += 1; e["noc_rev"] += rev
        elif kc in covered:
            e["cov_cust"] += 1; e["cov_rev"] += rev

    print("=" * 74)
    print("COVERAGE Kode C oleh FILE TARGET — per channel")
    print("=" * 74)
    print(f"Kode C tercover file target : {len(covered)} dari {len(valid_c)} kode di master")
    print(f"  -> {sorted(covered.keys())}")
    print()
    hdr = f'{"Channel":16}{"Cust":>7}{"%cover(cust)":>14}{"Revenue":>18}{"%cover(rev)":>14}'
    print(hdr); print("-" * len(hdr))
    tot = defaultdict(float)
    for c in config.BRANCH_GROUP_ORDER:
        e = ch.get(c)
        if not e: continue
        pc = e["cov_cust"] / e["cust"] * 100 if e["cust"] else 0
        pr = e["cov_rev"] / e["rev"] * 100 if e["rev"] else 0
        print(f'{c:16}{e["cust"]:>7}{pc:>13.1f}%{e["rev"]:>18,.0f}{pr:>13.1f}%')
        for k in ("cust", "rev", "cov_cust", "cov_rev"):
            tot[k] += e[k]
    pc = tot["cov_cust"] / tot["cust"] * 100 if tot["cust"] else 0
    pr = tot["cov_rev"] / tot["rev"] * 100 if tot["rev"] else 0
    print("-" * len(hdr))
    print(f'{"TOTAL":16}{int(tot["cust"]):>7}{pc:>13.1f}%{tot["rev"]:>18,.0f}{pr:>13.1f}%')
    print()
    print("Kode C (punya customer) yang BELUM tercover file target, urut revenue:")
    c_rev = defaultdict(float); c_n = defaultdict(int)
    for code, chrev in cust_ch_rev.items():
        kc = code2c.get(code)
        if kc and kc not in covered:
            c_rev[kc] += sum(chrev.values()); c_n[kc] += 1
    for kc in sorted(c_rev, key=lambda k: -c_rev[k])[:25]:
        print(f'  {kc:12} {c_n[kc]:>5} cust | rev {c_rev[kc]:>16,.0f}')
    print("\n(Scan saja — belum ada yang ditulis ke mapping.)")


if __name__ == "__main__":
    main()
