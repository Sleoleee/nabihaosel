"""
Loader TERKONTROL: baca file target (Excel) -> isi mapping di Supabase:
  - map_c_salesperson : Kode C -> salesperson (effective-dated)
  - target_c          : target per Kode C per bulan (2026)
Hanya menulis Kode C yang cocok dg GroupName master (yang 'tercover'); sisanya dibiarkan.
TIDAK meng-embed isi Excel ke kode — murni baca file saat dijalankan.

  cd backend
  python load_c_salesperson_target.py ^
    --master "C:\\Users\\HP 14s\\Downloads\\Data TPF\\database customer TPF.xlsx" ^
    --janjul "C:\\Users\\HP 14s\\Downloads\\Target Revenue Each SP Part 1.xlsx" ^
    --agudes "C:\\Users\\HP 14s\\Downloads\\Data TPF\\Revisi ( IV) target Agustus - Dec 2026.xlsx" ^
    --dry        # tampilkan dulu, belum tulis

Buang --dry utk menulis. Butuh .env (SUPABASE_URL, SUPABASE_SERVICE_KEY).
"""
import sys, os, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except Exception:
    pass
import re
import openpyxl

YEAR = 2026


def norm(v):
    return str(v).strip().upper() if v is not None else ""


def clean_name(s):
    """Buang anotasi 'ex ...' (penanda menggantikan siapa). 'Marlina Ex.Alysia' -> 'Marlina'."""
    s = str(s or "").strip()
    s = re.split(r"\s+ex\b\.?\s*", s, maxsplit=1, flags=re.IGNORECASE)[0].strip()
    return s


def _num(v):
    if v is None:
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except ValueError:
        return None


def master_codes(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]; it = ws.iter_rows(values_only=True); header = next(it)
    gi = None
    for i, h in enumerate(header):
        if h and str(h).strip().lower().replace(" ", "") in ("groupname", "group"):
            gi = i
    codes = set()
    for r in it:
        if gi is not None and gi < len(r) and r[gi] is not None:
            g = norm(r[gi])
            if g:
                codes.add(g)
    wb.close()
    return codes


def parse(path, valid, start_month, n_months):
    """Per baris: temukan kode valid, nama = cell non-numerik berikutnya, lalu n angka berikutnya = target per bulan."""
    out = {}
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    for sn in wb.sheetnames:
        for row in wb[sn].iter_rows(values_only=True):
            cells = list(row)
            ci = next((i for i, c in enumerate(cells) if norm(c) in valid), None)
            if ci is None:
                continue
            kc = norm(cells[ci])
            # nama = cell non-numerik pertama setelah kode
            ni = None
            for j in range(ci + 1, len(cells)):
                if cells[j] is None:
                    continue
                if _num(cells[j]) is None:
                    ni = j; break
            name = clean_name(cells[ni]) if ni is not None else ""
            # angka setelah nama
            nums = [_num(cells[j]) for j in range((ni or ci) + 1, len(cells)) if _num(cells[j]) is not None]
            tgt = {start_month + k: nums[k] for k in range(min(n_months, len(nums)))}
            out.setdefault(kc, {"name": name, "tgt": {}})
            out[kc]["name"] = out[kc]["name"] or name
            out[kc]["tgt"].update(tgt)
    wb.close()
    return out


def _nn(s):
    return " ".join(str(s or "").strip().upper().split())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True)
    ap.add_argument("--janjul", required=True, help="file Jan-Jul (Part 1)")
    ap.add_argument("--agudes", required=True, help="file Agu-Des (Revisi IV)")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    valid = master_codes(args.master)
    a = parse(args.janjul, valid, 1, 7)    # Jan..Jul
    b = parse(args.agudes, valid, 8, 5)    # Agu..Des

    codes = sorted(set(a) | set(b))
    merged = {}; changes = []
    for kc in codes:
        njj = (a.get(kc, {}).get("name") or "").strip()
        nad = (b.get(kc, {}).get("name") or "").strip()
        if njj and nad and _nn(njj) != _nn(nad):
            periods = [(njj, "2026-01-01", "2026-07-31"), (nad, "2026-08-01", None)]
            changes.append((kc, njj, nad))
        elif njj:
            periods = [(njj, "2026-01-01", None)]
        elif nad:
            periods = [(nad, "2026-08-01", None)]   # hanya ada di Agu-Des
        else:
            periods = []
        tgt = {}; tgt.update(a.get(kc, {}).get("tgt", {})); tgt.update(b.get(kc, {}).get("tgt", {}))
        merged[kc] = {"periods": periods, "tgt": tgt}

    print(f"{len(merged)} Kode C tercover file target (periode mulai 2026; 2025 dibiarkan kosong):")
    for kc in codes:
        m = merged[kc]
        total = sum(v for v in m["tgt"].values() if v)
        who = " ; ".join(f"{nm}({vf[5:]}→{vt[5:] if vt else 'kini'})" for nm, vf, vt in m["periods"])
        print(f"  {kc:8} -> {who:48} | {len(m['tgt'])} bln | total {total:,.0f}")

    if changes:
        print(f"\n⚠ {len(changes)} Kode C GANTI salesperson antara Jan-Jul vs Agu-Des (dibuat 2 periode):")
        for kc, x, y in changes:
            print(f"    {kc:8} {x}  →  {y}")
    else:
        print("\n✓ Tidak ada Kode C yang berganti salesperson antara Jan-Jul dan Agu-Des.")

    if args.dry:
        print("\n[DRY] belum menulis ke DB. Buang --dry untuk menyimpan.")
        return

    from utils.db import get_client
    db = get_client()
    # bersihkan baris lama utk kode-kode ini (hindari periode dobel dari run sebelumnya)
    for kc in codes:
        db.table("map_c_salesperson").delete().eq("kode_c", kc).execute()
    sp_rows = [{"kode_c": kc, "slp_name": nm, "valid_from": vf, "valid_to": vt}
               for kc, m in merged.items() for (nm, vf, vt) in m["periods"]]
    for i in range(0, len(sp_rows), 500):
        db.table("map_c_salesperson").insert(sp_rows[i:i+500]).execute()
    tg_rows = [{"kode_c": kc, "tahun": YEAR, "bulan": b_, "target": v}
               for kc, m in merged.items() for b_, v in m["tgt"].items() if v]
    for i in range(0, len(tg_rows), 500):
        db.table("target_c").upsert(tg_rows[i:i+500], on_conflict="kode_c,tahun,bulan").execute()
    print(f"\n✓ Ditulis: {len(sp_rows)} baris C->salesperson ({len(changes)} dgn pergantian), "
          f"{len(tg_rows)} baris target_c (tahun {YEAR}).")


if __name__ == "__main__":
    main()
