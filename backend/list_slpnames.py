"""
Bantu pemetaan salesperson: cetak SEMUA nilai SlpName di transaksi (>= MIN_YEAR)
beserta total revenue dan apakah sudah cocok ke salah satu target.

Jalankan dari folder backend/:
    python list_slpnames.py

Pakai hasilnya untuk mengisi daftar `match` di sales_targets.py bagi nama
yang masih "BELUM cocok".
"""
import sys, os
from collections import defaultdict
from datetime import date
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
sys.path.insert(0, os.path.dirname(__file__))

from utils.db import get_client
from compute_cache import fetch_year, MIN_YEAR
from sales_targets import match_salesperson, SALESPERSONS


def main():
    db = get_client()
    cur = date.today().year
    rev = defaultdict(float)
    for y in range(MIN_YEAR, cur + 2):
        rows = fetch_year(db, y, "slp_name,new_row_total")
        for r in rows:
            name = r.get("slp_name") or "(kosong)"
            rev[name] += float(r.get("new_row_total") or 0)

    ranked = sorted(rev.items(), key=lambda x: -x[1])
    print(f"\nTotal {len(ranked)} SlpName unik.\n")
    print(f'{"SlpName":42} {"Revenue":>18}  Status')
    print("-" * 90)
    for name, v in ranked:
        m = match_salesperson(name)
        tag = f'-> {m["name"]} ({m["group"]})' if m else 'BELUM cocok'
        print(f'{name[:42]:42} {v:>18,.0f}  {tag}')

    unmatched_targets = [s["name"] for s in SALESPERSONS
                         if not any(match_salesperson(n) and match_salesperson(n)["group"] == s["group"]
                                    for n in rev)]
    print("\nTarget salesperson yang BELUM punya SlpName cocok:")
    for n in unmatched_targets:
        print(f"  - {n}")


if __name__ == "__main__":
    main()
