"""
Loader TERKONTROL: baca file target -> isi map_c_spv (SPV -> Kode C, effective-dated).
SPV diambil dari header seksi ('SPV REGEN', 'SPV ARI', ...) di atas tiap grup Kode C.
Jan-Jul dari Part 1, Agu-Des dari Revisi IV; kalau SPV sebuah Kode C beda -> 2 periode.
TIDAK meng-embed Excel ke kode.

  cd backend
  python load_c_spv.py --master "...database customer TPF.xlsx" ^
    --janjul "...Target Revenue Each SP Part 1.xlsx" ^
    --agudes "...Revisi ( IV) target Agustus - Dec 2026.xlsx" --dry
"""
import sys, os, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except Exception:
    pass
import openpyxl


def norm(v):
    return str(v).strip().upper() if v is not None else ""


def master_codes(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]; it = ws.iter_rows(values_only=True); header = next(it)
    gi = next((i for i, h in enumerate(header)
               if h and str(h).strip().lower().replace(" ", "") in ("groupname", "group")), None)
    codes = set()
    for r in it:
        if gi is not None and gi < len(r) and r[gi] is not None:
            g = norm(r[gi])
            if g:
                codes.add(g)
    wb.close()
    return codes


def match_code(cell, valid):
    """cocokkan cell ke kode valid: persis, atau ganti huruf O->0 (typo 'COG' vs 'C0G')."""
    k = norm(cell)
    if k in valid:
        return k
    k2 = k.replace("O", "0")
    return k2 if k2 in valid else None


def parse(path, valid):
    """{kode_c: spv} berdasar header seksi 'SPV ...' terakhir sebelum baris kode."""
    out = {}
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    for sn in wb.sheetnames:
        cur_spv = None
        for row in wb[sn].iter_rows(values_only=True):
            cells = list(row)
            # deteksi header SPV
            for c in cells:
                s = norm(c)
                if s.startswith("SPV"):
                    cur_spv = str(c).strip()
                    break
            # deteksi kode
            for c in cells:
                kc = match_code(c, valid)
                if kc:
                    if cur_spv:
                        out.setdefault(kc, cur_spv)
                    break
    wb.close()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True)
    ap.add_argument("--janjul", required=True)
    ap.add_argument("--agudes", required=True)
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    valid = master_codes(args.master)
    a = parse(args.janjul, valid); b = parse(args.agudes, valid)
    codes = sorted(set(a) | set(b))

    plan = {}; changes = []
    for kc in codes:
        sa, sb = a.get(kc), b.get(kc)
        if sa and sb and sa.upper() != sb.upper():
            plan[kc] = [(sa, "2026-01-01", "2026-07-31"), (sb, "2026-08-01", None)]
            changes.append((kc, sa, sb))
        elif sa:
            plan[kc] = [(sa, "2026-01-01", None)]
        elif sb:
            plan[kc] = [(sb, "2026-08-01", None)]

    print(f"{len(plan)} Kode C -> SPV:")
    for kc in codes:
        who = " ; ".join(f"{s}({vf[5:]}→{vt[5:] if vt else 'kini'})" for s, vf, vt in plan[kc])
        print(f"  {kc:8} -> {who}")
    if changes:
        print(f"\n⚠ {len(changes)} Kode C PINDAH SPV antara Jan-Jul vs Agu-Des:")
        for kc, x, y in changes:
            print(f"    {kc:8} {x}  →  {y}")
    else:
        print("\n✓ Tidak ada Kode C yang pindah SPV.")

    if args.dry:
        print("\n[DRY] belum menulis. Buang --dry untuk menyimpan.")
        return

    from utils.db import get_client
    db = get_client()
    for kc in plan:
        db.table("map_c_spv").delete().eq("kode_c", kc).execute()
    rows = [{"kode_c": kc, "spv": s, "valid_from": vf, "valid_to": vt}
            for kc, per in plan.items() for (s, vf, vt) in per]
    for i in range(0, len(rows), 500):
        db.table("map_c_spv").insert(rows[i:i+500]).execute()
    print(f"\n✓ Ditulis {len(rows)} baris map_c_spv ({len(changes)} dgn perpindahan).")


if __name__ == "__main__":
    main()
