"""
Single source of truth WILAYAH (PROMPT 8).
- 38 provinsi Indonesia versi pasca-2022 (kode BPS 2 digit = kunci join stabil).
- Normalisasi nama Wilayah dari master -> province_code (EKSPLISIT, tanpa fuzzy).
  Nilai tak dikenal HARUS menyebabkan kegagalan di script pemanggil, bukan tebak/buang.
- Pemetaan prefix cardcode -> provinsi (untuk uji silang salah-input, LAPOR saja).
- Aturan klasifikasi Trade vs Non-Trade.
"""

# province_code (BPS 2 digit) -> (nama resmi, region_pulau, geojson_id=nama uppercase)
PROVINCES = {
    "11": ("Aceh", "Sumatera"),
    "12": ("Sumatera Utara", "Sumatera"),
    "13": ("Sumatera Barat", "Sumatera"),
    "14": ("Riau", "Sumatera"),
    "15": ("Jambi", "Sumatera"),
    "16": ("Sumatera Selatan", "Sumatera"),
    "17": ("Bengkulu", "Sumatera"),
    "18": ("Lampung", "Sumatera"),
    "19": ("Kepulauan Bangka Belitung", "Sumatera"),
    "21": ("Kepulauan Riau", "Sumatera"),
    "31": ("DKI Jakarta", "Jawa"),
    "32": ("Jawa Barat", "Jawa"),
    "33": ("Jawa Tengah", "Jawa"),
    "34": ("DI Yogyakarta", "Jawa"),
    "35": ("Jawa Timur", "Jawa"),
    "36": ("Banten", "Jawa"),
    "51": ("Bali", "Bali & Nusa Tenggara"),
    "52": ("Nusa Tenggara Barat", "Bali & Nusa Tenggara"),
    "53": ("Nusa Tenggara Timur", "Bali & Nusa Tenggara"),
    "61": ("Kalimantan Barat", "Kalimantan"),
    "62": ("Kalimantan Tengah", "Kalimantan"),
    "63": ("Kalimantan Selatan", "Kalimantan"),
    "64": ("Kalimantan Timur", "Kalimantan"),
    "65": ("Kalimantan Utara", "Kalimantan"),
    "71": ("Sulawesi Utara", "Sulawesi"),
    "72": ("Sulawesi Tengah", "Sulawesi"),
    "73": ("Sulawesi Selatan", "Sulawesi"),
    "74": ("Sulawesi Tenggara", "Sulawesi"),
    "75": ("Gorontalo", "Sulawesi"),
    "76": ("Sulawesi Barat", "Sulawesi"),
    "81": ("Maluku", "Maluku"),
    "82": ("Maluku Utara", "Maluku"),
    "91": ("Papua", "Papua"),
    "92": ("Papua Barat", "Papua"),
    "93": ("Papua Selatan", "Papua"),
    "94": ("Papua Tengah", "Papua"),
    "95": ("Papua Pegunungan", "Papua"),
    "96": ("Papua Barat Daya", "Papua"),
}

REGION_ORDER = ["Sumatera", "Jawa", "Bali & Nusa Tenggara", "Kalimantan",
                "Sulawesi", "Maluku", "Papua"]


def _norm(s):
    """Uppercase, buang tanda baca ringan, rapatkan spasi."""
    import re
    s = str(s or "").upper().strip()
    s = s.replace(".", " ").replace("-", " ")
    s = re.sub(r"\s+", " ", s)
    return s


# Variasi penulisan Wilayah -> province_code. EKSPLISIT, tambahkan bila ketemu nilai baru.
_VARIANTS = {
    "ACEH": "11", "NANGGROE ACEH DARUSSALAM": "11", "NAD": "11",
    "SUMATERA UTARA": "12", "SUMATRA UTARA": "12", "SUMUT": "12",
    "SUMATERA BARAT": "13", "SUMATRA BARAT": "13", "SUMBAR": "13",
    "RIAU": "14",
    "JAMBI": "15",
    "SUMATERA SELATAN": "16", "SUMATRA SELATAN": "16", "SUMSEL": "16",
    "BENGKULU": "17",
    "LAMPUNG": "18",
    "KEPULAUAN BANGKA BELITUNG": "19", "BANGKA BELITUNG": "19", "BABEL": "19",
    "KEPULAUAN RIAU": "21", "KEP RIAU": "21", "KEPRI": "21",
    "DKI JAKARTA": "31", "JAKARTA": "31", "DKI": "31",
    "JAWA BARAT": "32", "JABAR": "32",
    "JAWA TENGAH": "33", "JATENG": "33",
    "DI YOGYAKARTA": "34", "DAERAH ISTIMEWA YOGYAKARTA": "34",
    "YOGYAKARTA": "34", "DIY": "34", "JOGJA": "34", "JOGJAKARTA": "34",
    "JAWA TIMUR": "35", "JATIM": "35",
    "BANTEN": "36",
    "BALI": "51",
    "NUSA TENGGARA BARAT": "52", "NTB": "52",
    "NUSA TENGGARA TIMUR": "53", "NTT": "53",
    "KALIMANTAN BARAT": "61", "KALBAR": "61",
    "KALIMANTAN TENGAH": "62", "KALTENG": "62",
    "KALIMANTAN SELATAN": "63", "KALSEL": "63",
    "KALIMANTAN TIMUR": "64", "KALTIM": "64",
    "KALIMANTAN UTARA": "65", "KALTARA": "65",
    "SULAWESI UTARA": "71", "SULUT": "71",
    "SULAWESI TENGAH": "72", "SULTENG": "72",
    "SULAWESI SELATAN": "73", "SULSEL": "73",
    "SULAWESI TENGGARA": "74", "SULTRA": "74",
    "GORONTALO": "75",
    "SULAWESI BARAT": "76", "SULBAR": "76",
    "MALUKU": "81",
    "MALUKU UTARA": "82", "MALUT": "82",
    "PAPUA": "91",
    "PAPUA BARAT": "92",
    "PAPUA SELATAN": "93",
    "PAPUA TENGAH": "94",
    "PAPUA PEGUNUNGAN": "95",
    "PAPUA BARAT DAYA": "96",
}


def normalize_wilayah(raw):
    """
    Kembalikan province_code utk nilai Wilayah master.
    - None/kosong -> None (customer tanpa wilayah = kandidat Non-Trade).
    - Dikenal -> kode.
    - TIDAK dikenal -> raise ValueError (pemanggil wajib GAGAL & laporkan).
    """
    if raw is None or str(raw).strip() == "":
        return None
    key = _norm(raw)
    if key in _VARIANTS:
        return _VARIANTS[key]
    raise ValueError(f"Wilayah tidak dikenal: {raw!r} (normalisasi: {key!r})")


# Prefix cardcode -> province_code (untuk UJI SILANG salah-input; hanya prefix geografis).
CARDCODE_PREFIX_PROVINCE = {
    "ACH": "11", "SMU": "12", "SMB": "13", "RIA": "14", "JMB": "15",
    "SSE": "16", "BKL": "17", "LPG": "18", "BBL": "19", "KRI": "21",
    "JKT": "31", "JBA": "32", "JTH": "33", "YOG": "34", "JTI": "35", "BTN": "36",
    "BAL": "51", "NTB": "52", "NTT": "53",
    "KBA": "61", "KTE": "62", "KSE": "63", "KTI": "64", "KUT": "65",
    "SLU": "71", "SLT": "73",
}

# Prefix cardcode yang JELAS bukan geografis (entitas internal).
INTERNAL_PREFIXES = {"AMK", "B", "V", "KYW", "C"}


def cardcode_prefix(code):
    """Ambil prefix huruf di awal cardcode (mis. 'JKT-00123' -> 'JKT', 'C0T-1' -> 'C')."""
    import re
    m = re.match(r"^([A-Za-z]+)", str(code or "").strip())
    return m.group(1).upper() if m else ""


# --- Klasifikasi Non-Trade type ---
_MARKETPLACE_HINT = ("TIKTOK", "SHOPEE", "TOKOPEDIA", "TOKPED", "LAZADA", "BLIBLI", "MARKETPLACE")
_TOKO_SENDIRI_HINT = ("TOKO ", "NAMI", "BLOOMIE", "MIMORI", "PAKUWON", "ASEMKA",
                      "DOMPET", "TENGSEK", "FANCY", "STATIONARY", "FAMILY")
_EVENT_HINT = ("EVENT", "BAZAR", "BAZZAR", "PAMERAN", "POP UP", "POPUP")


def classify_non_territory(card_name, group_name, prefix):
    """
    Untuk customer tanpa province_code, tentukan non_territory_type.
    Basis: prefix cardcode + GroupName + nama. Kembalikan salah satu:
    'Toko Sendiri' | 'Marketplace' | 'Event' | 'Karyawan' | 'Belum Terpetakan'
    """
    name = _norm(card_name)
    grp = _norm(group_name)
    pfx = (prefix or "").upper()

    if pfx == "KYW" or grp == "KYW" or "KARYAWAN" in name:
        return "Karyawan"
    if any(h in name for h in _MARKETPLACE_HINT):
        return "Marketplace"
    if any(h in name for h in _EVENT_HINT):
        return "Event"
    if pfx == "AMK" or grp == "ASEMKA" or any(h in name for h in _TOKO_SENDIRI_HINT):
        return "Toko Sendiri"
    return "Belum Terpetakan"


NON_TERRITORY_TYPES = ["Toko Sendiri", "Marketplace", "Event", "Karyawan", "Belum Terpetakan"]


def province_rows():
    """Baris untuk tabel dim_province."""
    out = []
    for code, (name, pulau) in PROVINCES.items():
        out.append({
            "province_code": code,
            "province_name": name,
            "region_pulau": pulau,
            "geojson_id": name.upper(),
        })
    return out
