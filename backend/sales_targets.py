"""
Data target salesperson & SPV, hasil dari file:
  [SHARED] TPF - ALIGNMENT SALES & MARKETING (sheet "Salesperson & Target")

RUANG LINGKUP:
  Ke-18 salesperson ini adalah TIM INTI cabang 1.K25 (CORE_BRANCH). Attribution
  revenue hanya dihitung dari transaksi di cabang tsb; salesperson di luar
  daftar/di luar K25 sengaja tidak masuk dashboard ini.

CATATAN SKALA:
  Nilai target dipakai APA ADANYA (TARGET_SCALE = 1.0). Revenue aktual pada
  skala miliar sudah setara dengan target asli (mis. Sadarmawati 34,8 M).

CATATAN PENCOCOKAN NAMA (dikonfirmasi pemilik data):
  Beberapa nama di file target berbeda dengan `SlpName` di data transaksi.
  Kunci `match` memakai nama LENGKAP persis di database; label tampilan `name`
  tetap nama pendek dari file target.
    - Rizal    -> "Ahmad Rizal"
    - Michella -> "Marissa Michelle Rorencia"
    - Fajar    -> "Muhammad Fajar"
    - Alim     -> "Zaid Ahmad Alimmy"
    - Susianty -> "Susianty" (C6; Rizky sudah resign)
    - Ribka    -> staf baru 2026 (pengganti Fajar); tidak ada histori -> Rp 0.
"""

TARGET_SCALE = 1.0            # pakai nilai target apa adanya (tanpa ÷1000)
CORE_BRANCH = "1.K25"         # attribution target hanya untuk cabang ini

# group, display, team/SPV, target, match keys (nama di SlpName; 1 kata = cocok token pertama, banyak kata = nama penuh)
_RAW_TARGETS = [
    ("C5",   "Sadarmawati", "SPV REGEN",       34_800_000_000, ["sadarmawati"]),
    ("C9",   "Ine",         "SPV REGEN",       22_800_000_000, ["ine"]),
    ("C2",   "Rachel",      "SPV REGEN",       21_000_000_000, ["rachel"]),
    ("C11",  "Rizal",       "SPV REGEN",       14_400_000_000, ["ahmad rizal"]),
    ("C8",   "Dina",        "SPV REGEN",       20_400_000_000, ["dina"]),
    ("C13",  "Indah",       "SPV REGEN",       11_600_000_000, ["indah"]),
    ("CS04", "Marlina",     "SPV REGEN",        3_600_000_000, ["marlina"]),
    ("C1",   "Michella",    "SPV ARI",         26_400_000_000, ["marissa michelle rorencia"]),
    ("C4",   "Shifa",       "SPV ARI",         26_400_000_000, ["shifa"]),
    ("C6",   "Susianty",    "SPV ARI",         25_200_000_000, ["susianty"]),
    ("C3",   "Alysia",      "SPV ARI",         21_600_000_000, ["alysia"]),
    ("C7",   "Dinda",       "SPV ARI",         15_600_000_000, ["dinda"]),
    ("C10",  "Leppi",       "SPV ARI",         14_400_000_000, ["leppi"]),
    ("CS01", "Riska",       "SPV ARI",          3_600_000_000, ["riska"]),
    ("COG",  "Ribka",       "SPV ABDUL WAHID",  1_800_000_000, []),   # staf baru 2026, tanpa histori
    ("C19",  "Alim",        "SPV ABDUL WAHID",  3_600_000_000, ["zaid ahmad alimmy"]),
    ("C16",  "Fajar",       "SPV ABDUL WAHID",  7_010_000_000, ["muhammad fajar"]),
    ("C20",  "Achmad",      "SPV ABDUL WAHID",  6_250_000_000, ["achmad"]),
]

SALESPERSONS = []
for group, display, team, target_raw, match in _RAW_TARGETS:
    SALESPERSONS.append({
        "group": group,
        "name": display,
        "team": team,
        "target": round(target_raw * TARGET_SCALE),
        "match": [m.lower() for m in match],
    })

# Daftar SPV unik (urut sesuai kemunculan)
TEAMS = []
for s in SALESPERSONS:
    if s["team"] not in TEAMS:
        TEAMS.append(s["team"])


def _norm(slpname):
    """SlpName jadi huruf kecil, spasi dirapikan."""
    return " ".join(str(slpname).strip().lower().split()) if slpname else ""


def match_salesperson(slpname):
    """
    Kembalikan entri salesperson yang cocok untuk sebuah SlpName, atau None.
    - Kunci 1 kata  : cocok bila = token pertama SlpName (mis. "alysia").
    - Kunci >1 kata : cocok bila SlpName = kunci atau diawali kunci
                      (mis. "muhammad fajar").
    """
    norm = _norm(slpname)
    if not norm:
        return None
    first = norm.split()[0]
    for s in SALESPERSONS:
        for key in s["match"]:
            if " " in key:
                if norm == key or norm.startswith(key + " "):
                    return s
            elif first == key:
                return s
    return None
