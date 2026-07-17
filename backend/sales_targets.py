"""
Data target salesperson & SPV, hasil dari file:
  [SHARED] TPF - ALIGNMENT SALES & MARKETING (sheet "Salesperson & Target")

CATATAN SKALA:
  Nilai target dipakai APA ADANYA (TARGET_SCALE = 1.0). Setelah data penuh
  2022-2025 dimuat, revenue aktual berada pada skala miliar sehingga target
  asli (mis. 34.800.000.000 = 34,8 M untuk Sadarmawati) sudah setara. Tidak
  ada pembagian ÷1000.

CATATAN PENCOCOKAN NAMA:
  Revenue aktual per salesperson diambil dari kolom `SlpName` pada tabel
  transaksi (sesuai arahan). Nama pada file target sering memuat keterangan
  seperti "ex Abdul", "Ex.Alysia", "Canv", atau "Susi / Rizky" yang BUKAN
  bagian dari nama asli di SlpName. Karena itu setiap entri memiliki daftar
  `match` berupa nama-nama (huruf kecil) yang dicocokkan terhadap token
  pertama SlpName. Kasus khusus dari chat:
    - C6 "Susi / Rizky": Rizky sudah resign -> pakai "Susianty".
    - C1 "Michella": belum ditemukan di SlpName (kemungkinan typo di data).
      Tetap didaftarkan; compute_cache akan melaporkan bila tak ada match.
"""

TARGET_SCALE = 1.0   # pakai nilai target apa adanya (tanpa ÷1000)

# group, salesperson (mentah dari file), team/SPV, target mentah, match keys (token pertama SlpName, lowercase)
_RAW_TARGETS = [
    ("C5",   "Sadarmawati",       "SPV REGEN",       34_800_000_000, ["sadarmawati"]),
    ("C9",   "Ine",               "SPV REGEN",       22_800_000_000, ["ine"]),
    ("C2",   "Rachel",            "SPV REGEN",       21_000_000_000, ["rachel"]),
    ("C11",  "Rizal",             "SPV REGEN",       14_400_000_000, ["rizal"]),
    ("C8",   "Dina",              "SPV REGEN",       20_400_000_000, ["dina"]),
    ("C13",  "Indah",             "SPV REGEN",       11_600_000_000, ["indah"]),
    ("CS04", "Marlina Ex.Alysia", "SPV REGEN",        3_600_000_000, ["marlina"]),
    ("C1",   "Michella",          "SPV ARI",         26_400_000_000, ["michella"]),
    ("C4",   "Shifa",             "SPV ARI",         26_400_000_000, ["shifa"]),
    ("C6",   "Susi / Rizky",      "SPV ARI",         25_200_000_000, ["susianty"]),
    ("C3",   "Alysia ex Abdul",   "SPV ARI",         21_600_000_000, ["alysia"]),
    ("C7",   "Dinda",             "SPV ARI",         15_600_000_000, ["dinda"]),
    ("C10",  "Leppi",             "SPV ARI",         14_400_000_000, ["leppi"]),
    ("CS01", "Riska ex.Udin",     "SPV ARI",          3_600_000_000, ["riska"]),
    ("COG",  "Ribka ex Fajar",    "SPV ABDUL WAHID",  1_800_000_000, ["ribka"]),
    ("C19",  "Alim Ex Michella",  "SPV ABDUL WAHID",  3_600_000_000, ["alim"]),
    ("C16",  "Fajar ex alysia",   "SPV ABDUL WAHID",  7_010_000_000, ["fajar"]),
    ("C20",  "Achmad Canv",       "SPV ABDUL WAHID",  6_250_000_000, ["achmad"]),
]


def _clean_display_name(raw):
    """Nama tampil yang rapi: buang keterangan 'ex ...', 'Ex.X', 'Canv', ambil sebelum '/'."""
    name = raw.split("/")[0].strip()
    low = name.lower()
    for marker in [" ex.", " ex ", " ex", "ex.", "canv"]:
        idx = low.find(marker)
        if idx > 0:
            name = name[:idx].strip()
            break
    return name


# Struktur siap pakai
SALESPERSONS = []
for group, raw, team, target_raw, match in _RAW_TARGETS:
    match_l = [m.lower() for m in match]
    display = _clean_display_name(raw)
    # Bila nama bersih tak sesuai match key (mis. "Susi" -> match "susianty"),
    # pakai match key sebagai nama tampil agar konsisten dengan data transaksi.
    if display.strip().lower().split()[0] not in match_l:
        display = match_l[0].capitalize()
    SALESPERSONS.append({
        "group": group,
        "name": display,
        "raw_name": raw,
        "team": team,
        "target": round(target_raw * TARGET_SCALE),
        "match": match_l,
    })

# Daftar SPV unik (urut sesuai kemunculan)
TEAMS = []
for s in SALESPERSONS:
    if s["team"] not in TEAMS:
        TEAMS.append(s["team"])


def normalize_slpname(slpname):
    """Token pertama SlpName, huruf kecil, tanpa spasi berlebih."""
    if not slpname:
        return ""
    return str(slpname).strip().lower().split()[0] if str(slpname).strip() else ""


def match_salesperson(slpname):
    """
    Kembalikan entri salesperson yang cocok untuk sebuah SlpName, atau None.
    Pencocokan: token pertama SlpName sama dengan salah satu match key.
    """
    first = normalize_slpname(slpname)
    if not first:
        return None
    for s in SALESPERSONS:
        if first in s["match"]:
            return s
    return None
