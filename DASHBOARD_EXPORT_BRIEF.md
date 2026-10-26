# Briefing: Integrasi KPI Report & Fitur Export (Sales Analytics Dashboard)

Dokumen ini untuk dibawa ke Claude saat mendiskusikan fitur **"Manager pencet Export → keluar
report sesuai keinginan"** dan **integrasi KPI Report**. Isi = kondisi nyata dashboard saat ini.

---

## 1. Tujuan
1. **Export/extract report** dari tiap page: manager klik satu tombol → dapat output (Excel/CSV/PDF)
   berisi angka + tabel dari page itu, mengikuti filter yang sedang aktif.
2. **KPI Report**: laporan pencapaian target (achievement %, gap, growth) yang bisa diekspor rapi.

## 2. Arsitektur (ringkas)
- **Backend**: FastAPI (folder `backend/`), di-deploy di Vercel. Router di `backend/routers/`.
- **Frontend**: Vite + React (folder `frontend/`), react-router-dom, recharts, axios. Memanggil backend via `VITE_API_URL`.
- **Database**: Supabase (Postgres) — **HANYA menyimpan tabel agregat (cache)**. Data mentah TIDAK di Supabase.
- **Mesin agregasi**: `backend/build_analytics.py` (baca SQLite lokal → hitung semua agregat → push ke Supabase).
  Territory: `backend/build_territory.py`. **Semua metrik dihitung SEKALI di sini**, bukan di frontend.
- **Aturan emas**: dashboard & report **hanya baca tabel cache**, tidak query transaksi mentah.
  Kalau butuh angka baru untuk report, **tambahkan agregatnya di `build_analytics.py`**, jangan hitung di komponen.

## 3. Page aktif & "kepemilikan pertanyaan" (MECE)
| Page (file) | Dimensi | Pertanyaan yang dimiliki |
|---|---|---|
| Overview (`Overview.jsx`) | Waktu/perusahaan | Performa keseluruhan (headline + link, bukan analisis detail) |
| Sales Performance (`SalesPerformancePage.jsx`) | Siapa yang menjual | Seberapa baik tim menjual, siapa perlu ditindak |
| Customer Dashboard (`CustomerIntelligence.jsx`) | Siapa yang membeli | Siapa pelanggan, sehat/berisiko |
| Product Opportunity (`ProductOpportunityPage.jsx`) | Apa yang dijual | Produk mana tumbuh, peluang belum digarap |
| Territory (`TerritoryPage.jsx`) | Di mana | Sebaran wilayah/provinsi |
| Settings (`SettingsSalesPage.jsx`, `SettingsGroupsPage.jsx`, `SettingsTargetsPage.jsx`) | Konfigurasi | Grup SPV, target per tahun, registry salesperson |

## 4. Endpoint backend per page (sumber data report)
Prefix router (di `backend/main.py`):
`/api` (upload), `/api/overview`, `/api/customers`, `/api/products`, `/api/sales`,
`/api/discounts`, `/api/analytics`, `/api/settings`.

Endpoint utama (GET kecuali disebut):
- **Overview**: `/api/overview/overview`, `/kpi`, `/revenue-trend`, `/alerts`, `/summary`.
- **Sales Performance** (`/api/sales` & `/api/analytics`): `/sales-performance`, `/leaderboard`,
  `/sales-mix`, `/sales-trend`, `/sales-targets`, `/drilldown/{name}`, `/channels`.
- **Customer** (`/api/customers`): `/customer-analytics`, `/customer-list`, `/customer-detail`,
  `/customer-groups`, `/customer-cohort`, `/customer-lifecycle`, `/customer-bridge`, `/tiers`, `/recency`.
- **Product** (`/api/products`): `/top-products`, `/product-sku`, `/product-penetration`,
  `/kategori-growth`, `/kategori-trend`, `/product-pairing`, `/category-pairings`, `/distribution`.
- **Discounts** (`/api/discounts`): `/discount`, `/price-integrity`.
- **Territory** (`/api/analytics`): `/territory`, `/territory-detail`, `/territory-meta`, `/heatmap`.
- **Settings** (`/api/settings`): `/years`, `/groups` (GET/POST), `/targets` (GET/POST),
  `/registry` (GET/POST), `/channels`, `/filters`.
- **Filter global**: `/filters`, `/years` (tahun yang tersedia).

## 5. Tabel cache yang tersedia (bahan report)
Dimensi: `dim_customer`, `dim_salesperson`, `dim_item`, `dim_province`, `dim_province_stats`,
`customer_master`, `customer_group`.
Agregat: `agg_salesperson_month`, `agg_salesperson_category_month`, `agg_category_month`,
`agg_customer_month`, `agg_customer_category`, `agg_sku_month`, `agg_sku_year`,
`agg_category_pairing`, `agg_cohort_retention`, `agg_discount_category_month`,
`agg_province_month`, `agg_province_category`, `agg_province_salesperson`.
Settings: `settings_salesperson`, `settings_salesperson_group`, `settings_target`.
> Target & achievement untuk KPI Report ada di `settings_target` + `agg_salesperson_month` (dihitung di endpoint `/sales-performance`).

## 6. Export yang SUDAH ada (titik awal)
Sudah ada pola export CSV client-side di `SalesPerformancePage.jsx` & `TerritoryPage.jsx`:
fungsi `downloadCSV(rows, filename)` → bikin `Blob([csv], {type:'text/csv'})` → `a.download`.
Konvensi proyek (CLAUDE.md): **setiap tabel wajib** sortable, paginated, **dan tombol export CSV**.
Jadi fondasi "export per tabel" sudah ada; yang diminta manager = **naik level** ke report gabungan.

## 7. Kamus metrik / KPI (single source of truth — jangan hitung ulang di frontend)
- **Revenue** = Σ `new_row_total`. **Bills** = COUNT(DISTINCT document_number). **AOV** = Revenue ÷ Bills.
- **Kategori** = kolom `Kategori` (bukan `U_Kategori`). **Identitas customer** = `Customer/Vendor_Code`.
- **Quantity** tidak dijumlah lintas SKU/satuan (hanya dalam konteks 1 SKU).
- **Avg spending/month active**, **Customer Tier (13 tingkat)**, **Interval beli normal (median)**,
  **Recency/Frequency/Monetary**, **New/Repeat/Reactivated/Lost customer**, **Revenue at Risk**,
  **Growth YoY**, **Growth MoM** — definisi lengkap di `CLAUDE.md` bagian "KAMUS METRIK".
- **Status customer** (dashboard): AKTIF (≤90 hari) / TIDAK AKTIF (91–180) / HILANG (>180).
- Kategori non-produk: `MARKETPLACE`, `BIAYA PACKAGING`, `TAS PAPERBAG` (ada toggle "hanya produk inti").

## 8. Konvensi tampilan/format (ikuti di report)
- Bahasa UI: **Bahasa Indonesia**.
- Angka: Rupiah pemisah ribuan titik, singkatan **Jt / M**; persentase **1 desimal**.
- Tiap panel: judul + subjudul 1 kalimat cara baca + state kosong "Tidak ada data untuk filter ini".
- Semua panel reaktif terhadap filter page.

## 9. Realita data saat ini (penting untuk report)
- Cakupan: **2025 semua channel** + **2026 baru BLOOMIE** (channel lain 2026 belum di-ingest).
  → Report lintas-tahun/channel harus tahan terhadap cakupan tidak rata (jangan asumsikan semua channel ada di semua tahun).
- Channel: E-Commerce, SUKSES JAYA, NAMI, BLOOMIE, K25, OTHER CHANNEL (pemetaan dari `Branch` di `config.branch_group`).

## 10. Pertanyaan desain yang perlu diputuskan dengan Claude
1. **Format output**: Excel multi-sheet (1 sheet per page?) / CSV per tabel / PDF ringkas? (Excel paling fleksibel untuk manager.)
2. **Cakupan export**: per-page (tombol di tiap page) atau satu "Report Builder" terpusat yang manager pilih page + filter?
3. **Filter ikut**: export harus membawa filter aktif (tahun, channel, kategori, produk inti) + mencantumkannya di header report.
4. **KPI Report**: layout-nya seperti apa (per salesperson? per SPV? per channel?), kolom wajib (target, actual, %ach, gap, growth).
5. **Server-side vs client-side**: tabel besar sebaiknya di-generate di backend (endpoint `/export/...` kembalikan file) daripada client Blob.
6. **Scheduled vs on-demand**: cukup tombol klik, atau perlu report terjadwal (mingguan/bulanan)?
7. **Template**: apakah manager punya format baku yang harus ditiru? (kalau ada, bawa contohnya.)

---

## Cara mulai diskusi dengan Claude
Lampirkan dokumen ini + sebutkan: "Dashboard sudah jalan (lihat brief). Aku mau tambah fitur export
report & KPI Report. Bantu rancang: format output, arsitektur (endpoint `/export`), dan layout KPI."
