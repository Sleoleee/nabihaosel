# BLOOMIE (Toko X) — Handoff Analisis

Dokumen serah-terima untuk melanjutkan analisis BLOOMIE di akun Claude lain.
Semua konteks, lokasi file, cara jalan, dan keputusan penting ada di sini.

> **Keamanan**: di semua output & percakapan, toko ini disebut **"Toko X"**, bukan nama
> aslinya. Nama customer hanya di kolom tampilan, identitas = `Customer/Vendor_Code`.

---

## 1. Konteks singkat

- Toko X (BLOOMIE) **reopening pada 19 Juli 2026**. Semua analisis membandingkan
  **PRA** (sebelum 19/07) vs **PASCA** (sejak 19/07).
- Bulan Juli dipecah: **Jul (1–18) = pra**, **Jul (19–akhir) = pasca**. Bulan lain utuh.
- Data BLOOMIE yang sudah masuk: **131.830 baris, Jan–Sep 2026** (terverifikasi).
- Aturan data mengikuti dashboard (CLAUDE.md):
  - **Revenue** = `New_Row_Total` (konstanta `config.REVENUE_COLUMN`).
  - **Kategori** = kolom `Kategori` (JANGAN `U_Kategori`).
  - **Identitas customer** = `Customer/Vendor_Code`.
  - **Quantity hanya dijumlah dalam satuan yang SAMA** (PCS/PAK/LSN/BOX/KG tidak boleh dicampur).
  - **SKU** = nilai unik `Item_No.` (`item_no`). Kategori ≠ SKU.

---

## 2. Arsitektur data (Option B)

Karena Supabase free-tier < 500MB dan data mentah ~2GB, dipakai **Option B**:

- **Data mentah TIDAK di Supabase** — disimpan lokal di **SQLite**:
  `data_local/transactions.db` (di-gitignore, hanya ada di komputer kamu, BUKAN di repo).
- Supabase hanya menyimpan **tabel agregat** (`agg_*`, `dim_*`, `settings_*`, dll).
- Semua skrip analisis BLOOMIE membaca langsung dari **SQLite lokal**, bukan Supabase.

**Helper pembaca lokal**: `backend/local_store.py`
- `connect()`, `ensure_schema()`, `iter_rows(conn, where, params)`, `channel_where("BLOOMIE")`.
- `channel_where` + filter `config.branch_group(branch) == "BLOOMIE"` = cara memilih channel BLOOMIE.

**Ingest data mentah (Excel → SQLite)**: `backend/local_ingest.py`
- Flag: `--reset`, `--branch`, `--only-year`, `--sheet <substring>`, `--months "1-5" / "6" / "7,8,9"`.
- Contoh sudah dipakai untuk memasukkan 3 file sumber BLOOMIE (Jan–Mei, Jun, Jul–Sep).

**Kelola data lokal**: `backend/local_manage.py`
- `--status` (lihat cakupan per channel), `--delete --channel/--all --year --from --to`.

> **PENTING saat pindah akun**: `data_local/transactions.db` TIDAK ada di repo.
> Di mesin baru kamu harus menjalankan ulang `local_ingest.py` dengan file Excel sumber
> sebelum skrip analisis bisa jalan. Kalau DB kosong, skrip akan bilang
> "Tidak ada data BLOOMIE. Jalankan local_ingest.py dulu."

---

## 3. File analisis (semua di `analysis/`, TERPISAH dari dashboard)

Output Excel ditulis ke **luar repo**: default `~/Bloomie_Analysis/`
(override dengan `--out "D:/Analisis"` atau folder lain).

| File | Output Excel | Isi |
|---|---|---|
| `_bloomie_common.py` | — | Helper bersama: `fetch_bloomie()`, pembagian periode pra/pasca, gaya Excel, `autosize`. Semua skrip lain mengimpor ini. |
| `bloomie_reopening.py` | `bloomie_reopening*.xlsx` | Perilaku customer pra vs pasca: 3 sheet (makro, same-customer, retensi pembeli baru). `--check` = cek cakupan tanggal. |
| `bloomie_category_trend.py` | `bloomie_trend_kategori_bulanan.xlsx` | 3 sheet: Trend revenue per kategori per bulan (+baris pemisah REOPENING), Pra vs Pasca per kategori, Avg Spending per Customer + AOV. |
| `bloomie_customer_composition.py` | `bloomie_komposisi_customer.xlsx` | Komposisi **Baru vs Retain** per bulan (jumlah + revenue + %). Baru = pembelian pertama jatuh di periode itu. |
| `bloomie_qty_category_unit.py` | `bloomie_qty_kategori_unit.xlsx` | 2 sheet: Quantity per **Kategori × Unit** per bulan (tak ada grand-total lintas satuan), dan Avg Qty per Order (total qty ÷ #nota). |
| `bloomie_behaviour_scorecard.py` | `bloomie_behaviour_scorecard.xlsx` | 4 sheet: scorecard pra vs pasca (metrik VOLUME **dinormalisasi per bulan**, metrik RASIO apa adanya), distribusi ukuran order, sinyal unit, verdict **retail vs grosir**. |
| `tokox_analisis_lanjutan.py` | workbook 15-sheet | Analisis lanjutan lengkap sesuai brief 1 (lihat §4). |
| `tokox_analisis_sku.py` | `TokoX_Analisis_SKU.xlsx` (13 sheet) | **Brief 2**: hitung ulang berbasis **SKU induk** (gabung kode warna) + klasifikasi grosir dari **qty per SKU induk per nota** (segmen S1–S5), bukan total qty/nota. Flag walk-in (JKT-00001/00002) & outlier (JKT-00238). |

### Cara menjalankan (dari root repo)
```bash
python analysis/bloomie_category_trend.py --reopen 2026-07-19 --out "D:/Analisis"
python analysis/bloomie_customer_composition.py
python analysis/bloomie_qty_category_unit.py
python analysis/bloomie_behaviour_scorecard.py
python analysis/tokox_analisis_lanjutan.py
```
Butuh `openpyxl` (`python -m pip install openpyxl`). `dotenv` opsional (sudah di-try/except).

---

## 4. `tokox_analisis_lanjutan.py` — workbook 15-sheet

Sesuai `Brief_ClaudeCode_Olah_Data_TokoX.md`. Machine-readable
(angka fraksi bukan string %, header di baris 1, nama kolom snake_case).

- Sheet: `00_README` … `13_Sensitivitas` (sheet 14 dilewati jika tak ada data tahun sebelumnya).
- **Normalisasi per-30-hari**: `per30 = total ÷ hari_aktual × 30` (adil karena jendela
  PRA ~6,6 bln vs PASCA ~2,4 bln).
- **Tier order** (jumlah item per nota): T1(1) / T2(2–5) / T3a(6–11) / T3b(12–20) / T4(21–50) / T5(>50).
- **grosir_lama** = pakai satuan bulk **ATAU** qty/nota ≥ 12.
- Performa: loop O(n²) sudah diganti **single-pass pre-aggregation** (RC/MC/CPK/MCUST) →
  131k baris jalan beberapa detik (dulu sempat hang).
- Saat jalan, mencetak blok **VALIDASI** + **UJI HIPOTESIS** (5 hipotesis) ke konsol.

---

## 5. Keputusan & temuan penting (jangan diulang dari nol)

1. **Normalisasi per bulan** wajib untuk metrik volume — kalau pakai angka mentah,
   PRA (jendela lebih panjang) selalu kelihatan lebih besar dari PASCA. Metrik rasio
   (AOV, qty/nota, % retain) tidak dinormalisasi.
2. **Retail vs grosir** diputuskan gabungan: pakai satuan bulk (LSN/BOX/PAK/KG dsb)
   **ATAU** qty/nota ≥ 12. Bukan hanya satu patokan.
3. **Jangan jumlahkan Quantity lintas satuan** — semua sheet qty dipecah per Unit,
   tidak ada baris/kolom grand-total campur satuan.
4. **SKU = `item_no`**, bukan deskripsi/kategori. Satu produk fisik dengan 2 `item_no`
   dihitung 2 SKU (tidak ada penggabungan otomatis).
5. Output selalu ke luar repo; tutup file Excel sebelum re-run (kalau terbuka →
   PermissionError saat save).

---

## 5b. HASIL RUN Brief 2 (SKU induk) — tervalidasi 21 Okt 2026

Dijalankan atas 131.830 baris BLOOMIE (Jan–Sep 2026). **Total rekonsiliasi dengan Brief 1.**

**Validasi (lolos):**
- PRA Rp9.339.437.720 / 10.860 nota / 984 customer
- PASCA Rp6.622.181.617 / 9.767 nota / 1.011 customer
- `01_SKU_Mapping` = 9.805 baris (= item_no unik); tiap nota tepat 1 segmen.

**Uji wajib:**
| Uji | Nilai |
|---|---|
| item_no → sku induk | 9.805 → 9.037 (1.216 item digabung sbg varian warna) |
| Pola suffix | standar 7.636 · huruf(warna) 1.487 · angka2digit 588 · huruf-nempel 94 |
| % nota pindah klasifikasi (grosir lama vs SKU) | **11,4%** |
| % nota walk-in yang grosir-by-SKU | **4,3%** |
| % revenue grosir-SKU PRA → PASCA | **75,5% → 69,1%** |
| item perlu_review | **859** (grup multi-varian/seri bernomor dgn deskripsi beda — perlu konfirmasi client) |

**Temuan yang BERUBAH vs analisis lama (total qty/nota):**
1. 11,4% nota pindah kelas — mayoritas "grosir palsu" (banyak produk @sedikit) kini benar jadi eceran.
2. Walk-in (kasir + MEMBER, ~72–79% nota) ternyata **hampir murni eceran** (4,3% grosir) — tak ada grosir tersembunyi signifikan.
3. Share revenue grosir **turun 75,5% → 69,1%** pasca reopening (geser ke eceran).

**Yang TETAP:** total identik; secara revenue toko tetap didominasi grosir (~70%); outlier JKT-00238 diisolasi.

**OPEN ITEM untuk client:** 859 item `perlu_review=TRUE` di `01_SKU_Mapping` — konfirmasi apakah tiap grup varian warna (gabung) atau beda ukuran/model (jangan gabung).

---

## 5c. HASIL RUN Brief 3 (`--v2`) — tervalidasi 21 Okt 2026

File: `~/Bloomie_Analysis/TokoX_Analisis_SKU_v2.xlsx` (7 sheet). Totals tetap sama.
Validasi winback DEFAULT tanpa Perbaikan 1 = **143 akun / Rp1.182.581.000** (persis target brief) ✓

| Metrik | Sebelum (Brief 2) | Sesudah Perbaikan 1 |
|---|---|---|
| % nota grosir WALK-IN (PRA) | 5,8% | **0,5%** |
| % revenue grosir PRA | 75,5% | 72,6% |
| % revenue grosir PASCA | 69,1% | 65,3% |
| Winback (akun / revenue) | 143 / Rp1,183 M | **119 / Rp1,143 M** |
| SKU induk DEFAULT vs GABUNG_SEMUA | — | 9.037 vs 8.492 |
| Share revenue SKU baru pasca — AKUN / WALK-IN | — | **66,3% / 58,6%** |

**Ringkasan §E (yang berubah / tidak berbalik):**
1. Walk-in kini praktis **nol grosir** (5,8% → 0,5%): teori "grosir tersembunyi di kasir" makin pasti terbantah.
2. Dominasi grosir **melunak** (revenue grosir −3 s/d −4 poin) tapi **arah tetap**: toko masih didominasi grosir & tetap bergeser ke eceran pasca-reopening. **Tidak ada kesimpulan yang berbalik.**
3. Winback menyusut 143 → 119 akun, tapi revenue hampir utuh (−3,3%): 24 akun yang gugur adalah "grosir palsu" kecil (gara-gara 1 BOX/PAK). **Daftar winback jadi lebih bersih & layak ditindak.**
4. GABUNG_SEMUA cuma memangkas 9.037 → 8.492 SKU (−6%): melumat semua varian **tidak** mengubah gambaran grosir secara material → aturan DEFAULT cukup kokoh.
5. **Temuan terkuat untuk storyline**: ~**66% revenue pasca (AKUN)** dan **59% (WALK-IN)** berasal dari **SKU baru** (pertama terjual ≥ 19 Jul) → reopening = refresh assortment besar, bukan sekadar buka pintu.

---

## 6. Status & langkah lanjut

- **Selesai**: 6 skrip analisis BLOOMIE + workbook 15-sheet (tervalidasi vs brief),
  data BLOOMIE Jan–Sep 2026 sudah di SQLite lokal.
- **Yang mungkin diminta berikutnya**: visualisasi revenue-trend bulanan per kategori
  dengan pembeda reopening (sudah sebagian di `bloomie_category_trend.py`) dan pendalaman
  customer behaviour pra/pasca.
- **Migrasi dashboard (Option B) masih berjalan di sisi user**: Supabase baru, env,
  schema, ingest channel lain + tahun 2023–2025, `build_analytics.py`, `build_territory.py`,
  seed, promote. Baru BLOOMIE yang ter-ingest.

---

## 7. Referensi file kunci (path relatif repo)

```
analysis/_bloomie_common.py
analysis/bloomie_reopening.py
analysis/bloomie_category_trend.py
analysis/bloomie_customer_composition.py
analysis/bloomie_qty_category_unit.py
analysis/bloomie_behaviour_scorecard.py
analysis/tokox_analisis_lanjutan.py
backend/local_store.py        # pembaca SQLite lokal
backend/local_ingest.py       # Excel -> SQLite
backend/local_manage.py       # status / delete lokal
backend/config.py             # REVENUE_COLUMN, branch_group(), channel_branch_patterns()
backend/build_analytics.py    # build agregat (baca lokal, dim_item TABLE, agg_sku_*)
CLAUDE.md                     # aturan data & metrik (single source of truth)
data_local/transactions.db    # RAW lokal — TIDAK di repo, harus re-ingest di mesin baru
~/Bloomie_Analysis/*.xlsx     # output Excel — di luar repo
```

Branch kerja: `claude/markdown-task-x5uxwr` (repo `sleoleee/nabihaosel`).
