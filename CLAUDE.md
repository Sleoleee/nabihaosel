# CLAUDE.md — Konteks Proyek Sales Analytics Dashboard

## Tentang proyek
Dashboard analitik penjualan berbasis web untuk perusahaan distribusi aksesoris & fashion.
- Database: Supabase (PostgreSQL), tabel transaksi level line-item
- Mesin agregasi: script Python `compute_cache.py` — membaca transaksi, menghitung agregasi, menulis ke tabel cache
- Frontend & backend: Vercel
- Dashboard HANYA membaca tabel cache, TIDAK PERNAH query tabel transaksi mentah secara langsung
- Cakupan tahun: 2023–2026 (data 2022 diabaikan)

## Struktur kolom tabel transaksi (line-item)
Document Status, Canceled, Document Number, Posting Date, Due_Date, Customer/Vendor_Code,
Customer/Vendor_Name, Item_No., Item/Service_Description, Kategori, U_Kategori, Warehouse Code,
Quantity, Unit, harga_awal, Disc % Per Row, harga_jual, Row Total, Disc % For Document,
SlpCode, U_POS_DOCNUM, Payment_Terms_Code, New_Due_Date, Reconciliation_Date, Status_payment,
New_Row_Total, Branch, SlpName

## ATURAN DATA — WAJIB DIPATUHI DI SELURUH APLIKASI

1. **Revenue** = `SUM(New_Row_Total)`. Simpan sebagai konstanta `REVENUE_COLUMN` di satu file config
   agar mudah diganti ke `Row Total` bila nanti dibutuhkan. Jangan hardcode tersebar.
2. **Kategori resmi** = kolom `Kategori`. **JANGAN PERNAH gunakan `U_Kategori`** di manapun.
   (Kedua kolom berbeda di ±7% baris — pemakaian campur akan membuat angka tidak rekonsiliasi.)
3. **Identitas customer** = `Customer/Vendor_Code`, BUKAN nama. Nama hanya untuk ditampilkan.
   (Nama mengandung duplikat dan typo.)
4. **Baris dikecualikan**: `Canceled = 'Y'`. Baris `Document Status = 'O'` tetap dihitung,
   tapi sediakan flag config `INCLUDE_OPEN_DOCS = True`.
5. **Quantity TIDAK BOLEH dijumlahkan lintas SKU** — satuan bercampur (LSN, BOX, PAK, PCS, KG, dll).
   Semua perbandingan antar produk/kategori/orang/daerah memakai revenue.
   Quantity hanya boleh muncul dalam konteks satu SKU yang sama.
6. **Bills** = `COUNT(DISTINCT "Document Number")`.
7. **AOV** = Revenue ÷ Bills.
8. **Kategori non-produk**: `MARKETPLACE`, `BIAYA PACKAGING`, `TAS PAPERBAG` adalah biaya/pelengkap.
   Sediakan toggle global `hanya produk inti` yang membuang ketiganya. Default: OFF (semua dihitung),
   kecuali pada page Product Opportunity di mana default ON.

## KAMUS METRIK (single source of truth — dihitung SEKALI di compute_cache.py)

| Metrik | Definisi |
|---|---|
| Bulan aktif | Bulan dengan ≥1 transaksi untuk customer tsb |
| Avg spending / month active | Revenue customer ÷ jumlah bulan aktif |
| Customer Tier | 13 tingkat, berdasarkan avg spending / month active (logika existing, jangan diubah) |
| Interval beli normal | **Median** jeda hari antar-nota per customer (median, bukan mean — tahan outlier) |
| Overdue | hari sejak nota terakhir > interval beli normal |
| Recency ratio (R) | hari sejak nota terakhir ÷ interval beli normal. >1 = overdue |
| Frequency (F) | jumlah bills ÷ jumlah bulan aktif |
| Monetary (M) | avg spending / month active — **rumus yang SAMA PERSIS dengan Customer Tier** |
| Segmen RFM | Champions, Loyal, Promising, Need Attention, At Risk, Lost |
| New customer | transaksi pertama sepanjang sejarah jatuh di periode ini |
| Repeat customer | ada transaksi di periode ini DAN di periode sebelumnya |
| Reactivated customer | sempat tidak aktif ≥2× interval normal, lalu bertransaksi lagi di periode ini |
| Lost customer | tidak bertransaksi ≥3× interval normal (konstanta config `LOST_MULTIPLIER = 3`) |
| Revenue at Risk | Σ (avg spending/month active) dari customer berstatus overdue |
| Growth YoY | (periode ini − periode sama tahun lalu) ÷ periode sama tahun lalu |
| Growth MoM | (bulan ini − bulan lalu) ÷ bulan lalu |

Rumus di atas **dihitung di compute_cache.py saja**. Frontend tidak boleh menghitung ulang
salah satu rumus ini secara lokal. Kalau butuh angka baru, tambahkan di cache — jangan hitung di komponen.

## ARSITEKTUR INFORMASI — ATURAN MECE

Navigasi punya 4 page aktif (Territory menyusul nanti, JANGAN dibuat sekarang):

| Page | Dimensi utama | Pertanyaan yang dimiliki |
|---|---|---|
| Overview | Waktu / perusahaan | "Bagaimana performa kita keseluruhan?" |
| Sales Performance | Siapa yang menjual | "Seberapa baik tim menjual, siapa yang perlu ditindak?" |
| Customer Dashboard | Siapa yang membeli | "Siapa pelanggan kita, sehat atau berisiko?" |
| Product Opportunity | Apa yang dijual | "Produk mana tumbuh, peluang apa yang belum digarap?" |

Aturan:
1. Satu pertanyaan bisnis hanya boleh punya SATU rumah (satu page). Dilarang menduplikasi panel analisis.
2. **Overview dikecualikan** — Overview adalah lapisan ringkas. Boleh menampilkan headline dari page lain,
   tapi hanya sebagai angka + link, tidak boleh ada analisis/tabel detail di sana.
3. Panel analisis silang diletakkan di page milik objek yang SEDANG DINILAI, bukan objek pendukung.
   Contoh: "mix kategori per salesperson" menilai salesperson → Sales Performance.
   "penetrasi kategori per segmen customer" menilai kategori → Product Opportunity.

## KONVENSI TEKNIS
- Bahasa UI: Bahasa Indonesia.
- Format angka: Rupiah dengan pemisah ribuan titik, singkatan Jt / M untuk angka besar. Persentase 1 desimal.
- Setiap panel wajib punya: judul, subjudul 1 kalimat yang menjelaskan cara membacanya, dan state kosong
  ("Tidak ada data untuk filter ini") — jangan tampilkan chart kosong tanpa keterangan.
- Setiap tabel: sortable, paginated, dan punya tombol export CSV.
- Semua panel harus reaktif terhadap filter yang berlaku di page-nya.
- Jangan memakai data dummy/mockup di page baru kecuali diminta eksplisit. Kalau data belum ada di cache,
  tambahkan agregasinya di compute_cache.py, jangan bikin angka palsu.
