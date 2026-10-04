"""
AUDIT salesperson lintas tahun & channel — untuk merancang registry baru.
Jalankan dari backend/:  python audit_salespersons.py

Mencetak:
  1) Per tahun: jumlah SlpName unik & revenue per channel.
  2) Matriks kehadiran salesperson x tahun (apakah seseorang muncul di tahun tsb).
  3) Status match ke formasi K25 saat ini (sales_targets.py) + total revenue per channel.
Dari sini terlihat: apakah formasi K25 terlacak sejak 2022 atau hanya 2025+,
dan siapa saja yang datang/pergi antar tahun.
"""
import sys, os
from collections import defaultdict
from datetime import date
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
sys.path.insert(0, os.path.dirname(__file__))

from utils.db import get_client
import config
from sales_targets import match_salesperson


def main():
    db = get_client()
    cur = date.today().year
    years = list(range(2022, cur + 1))

    # Sumber: agg_salesperson_month (kecil, cepat) — bukan transaksi mentah.
    rows = db.table("agg_salesperson_month").select(
        "slp_name,tahun,channel,revenue").limit(1000000).execute().data or []

    # (slp, year) -> revenue ; (slp) -> {channel: revenue}
    rev_sy = defaultdict(float)
    rev_sc = defaultdict(lambda: defaultdict(float))
    rev_year_channel = defaultdict(lambda: defaultdict(float))
    slps = set()

    for r in rows:
        name = (r.get("slp_name") or "(kosong)").strip()
        y = int(r.get("tahun") or 0)
        ch = r.get("channel") or "OTHER CHANNEL"
        v = float(r.get("revenue") or 0)
        rev_sy[(name, y)] += v
        rev_sc[name][ch] += v
        rev_year_channel[y][ch] += v
        slps.add(name)
    years = [y for y in years if y in rev_year_channel]

    # 1) Ringkasan per tahun per channel
    print("\n===== REVENUE PER TAHUN x CHANNEL =====")
    chans = config.BRANCH_GROUP_ORDER
    hdr = f'{"Tahun":6} ' + " ".join(f'{c[:10]:>12}' for c in chans)
    print(hdr); print("-"*len(hdr))
    for y in years:
        if y not in rev_year_channel: continue
        line = f'{y:<6} ' + " ".join(f'{rev_year_channel[y].get(c,0):>12,.0f}' for c in chans)
        print(line)

    # 2) Matriks kehadiran salesperson x tahun (hanya yang total revenue signifikan)
    print("\n===== KEHADIRAN SALESPERSON x TAHUN (✓ = ada transaksi) =====")
    ranked = sorted(slps, key=lambda s: -sum(rev_sy[(s,y)] for y in years))
    print(f'{"SalpName":34} ' + " ".join(f'{y:>6}' for y in years) + "   ChannelUtama")
    print("-"*100)
    for s in ranked[:80]:
        cells = " ".join((f'{"✓":>6}' if rev_sy[(s,y)]>0 else f'{"·":>6}') for y in years)
        ch_top = max(rev_sc[s].items(), key=lambda x:-x[1])[0] if rev_sc[s] else "-"
        m = match_salesperson(s)
        tag = f'  K25:{m["name"]}/{m["group"]}' if m else ''
        print(f'{s[:34]:34} {cells}   {ch_top}{tag}')

    # 3) Khusus match formasi K25 saat ini: di tahun mana saja mereka ada
    print("\n===== FORMASI K25 SAAT INI: ketersediaan per tahun =====")
    k25 = [s for s in slps if match_salesperson(s)]
    for s in sorted(k25, key=lambda s:-sum(rev_sy[(s,y)] for y in years)):
        yrs_present = [y for y in years if rev_sy[(s,y)]>0]
        m = match_salesperson(s)
        print(f'  {m["name"]:14} ({m["group"]:16}) SlpName="{s}"  ada di: {yrs_present}')

    print(f"\nTotal SlpName unik 2022-{cur}: {len(slps)}")


if __name__ == "__main__":
    main()
