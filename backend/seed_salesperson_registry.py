"""
Seed awal registry salesperson (settings_salesperson) + target (settings_target)
dari data agg_salesperson_month + formasi K25 saat ini.

Aturan seed (sesuai temuan audit):
  - channel : 'K25' bila nama cocok formasi K25; selain itu channel transaksi DOMINAN
              (ini cuma TEBAKAN AWAL untuk dikoreksi di halaman Setting).
  - spv     : tim K25 (REGEN/ARI/ABDUL WAHID) HANYA untuk tahun >= 2025
              (2023-2024 = Tanpa SPV, tidak dipaksakan). Non-K25 = Tanpa SPV.
  - aktif   : TRUE bila ada transaksi di tahun tsb.
  - target  : dari sales_targets (match) HANYA untuk 2025 & 2026.

Idempotent (upsert). Jalankan sekali, lalu rapikan lewat halaman Setting.
  python seed_salesperson_registry.py          # tulis
  python seed_salesperson_registry.py --dry     # lihat ringkasan saja
"""
import sys, os
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
sys.path.insert(0, os.path.dirname(__file__))

import config
from sales_targets import match_salesperson

SPV_SINCE_YEAR = 2025      # SPV historis tak dipaksakan sebelum tahun ini
TARGET_YEARS = {2025, 2026}


def main():
    from utils.db import get_client
    db = get_client()
    rows = db.table("agg_salesperson_month").select(
        "slp_name,tahun,channel,revenue").limit(1000000).execute().data or []

    rev = defaultdict(lambda: defaultdict(float))   # (slp,year) -> {channel: rev}
    present = set()
    for r in rows:
        slp = (r.get("slp_name") or "").strip()
        if not slp:
            continue
        y = int(r.get("tahun") or 0)
        rev[(slp, y)][r.get("channel") or "OTHER CHANNEL"] += float(r.get("revenue") or 0)
        present.add((slp, y))

    reg_rows, tgt_rows = [], []
    collisions = defaultdict(set)   # (team) group -> set of slp names matched
    for (slp, y) in sorted(present):
        m = match_salesperson(slp)
        dominant = max(rev[(slp, y)].items(), key=lambda x: x[1])[0] if rev[(slp, y)] else "OTHER CHANNEL"
        channel = "K25" if m else dominant
        spv = (m["team"] if (m and y >= SPV_SINCE_YEAR) else None)
        if m:
            collisions[(m["name"], m["group"])].add(slp)
        reg_rows.append({"slp_name": slp, "tahun": y, "channel": channel,
                         "spv": spv, "aktif": True})
        if m and y in TARGET_YEARS:
            tgt_rows.append({"slp_name": slp, "tahun": y, "target": float(m["target"] or 0)})

    # ringkasan
    by_year_channel = defaultdict(lambda: defaultdict(int))
    for r in reg_rows:
        by_year_channel[r["tahun"]][r["channel"]] += 1
    print(f"Registry: {len(reg_rows)} baris (slp x tahun). Target: {len(tgt_rows)} baris.")
    for y in sorted(by_year_channel):
        print(f"  {y}: " + ", ".join(f"{c}={n}" for c, n in sorted(by_year_channel[y].items())))

    dup = {k: v for k, v in collisions.items() if len(v) > 1}
    if dup:
        print("\n⚠ Nama berbeda yang cocok ke formasi K25 yang SAMA (periksa target & SPV-nya):")
        for (name, grp), names in dup.items():
            print(f"   {name} ({grp}): {sorted(names)}")

    if "--dry" in sys.argv:
        print("\n(--dry) tidak menulis.")
        return
    for i in range(0, len(reg_rows), 500):
        db.table("settings_salesperson").upsert(reg_rows[i:i+500], on_conflict="slp_name,tahun").execute()
    for i in range(0, len(tgt_rows), 500):
        db.table("settings_target").upsert(tgt_rows[i:i+500], on_conflict="slp_name,tahun").execute()
    print("\n✓ settings_salesperson & settings_target terisi. Rapikan di halaman Setting.")


if __name__ == "__main__":
    main()
