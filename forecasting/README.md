# Forecast Method Comparison — Case 2 FACT

Analisis perbandingan 4 metode forecasting untuk data time series bulanan
(Jan 2023 – Des 2024), dievaluasi dengan **MAPE**.

## Metode yang dibandingkan
| Metode | Menangkap | Library |
|--------|-----------|---------|
| Regression (Linear / OLS) | Tren linier | scikit-learn |
| Single Exponential Smoothing (SES) | Level | statsmodels |
| Double Exponential Smoothing (Holt) | Level + tren | statsmodels |
| Triple Exponential Smoothing (Holt-Winters) | Level + tren + musiman (12 bln) | statsmodels |

## Cara menjalankan
```bash
pip install openpyxl pandas numpy matplotlib scikit-learn statsmodels
python forecast_comparison.py
```

## Catatan data
- Data asli punya 21 titik dengan **gap Jan–Mar 2024**. Gap diisi dengan
  interpolasi linear agar menjadi deret bulanan teratur 24 titik — syarat
  Holt-Winters seasonal (butuh ≥ 2 siklus × 12 bulan).

## Hasil (MAPE — semakin kecil semakin baik)
| Metode | MAPE (%) |
|--------|---------|
| **Single Exp. Smoothing** | **16.50** ✅ terbaik |
| Triple Exp. Smoothing | 17.36 |
| Double Exp. Smoothing | 17.55 |
| Regression (Linear) | 19.30 |

## Kesimpulan
**Single Exponential Smoothing paling cocok** untuk dataset ini. Datanya
sangat fluktuatif (mis. anjlok ke ~23K pada Jun–Jul 2024) tanpa tren atau
musiman yang stabil, sehingga model sederhana yang hanya mengikuti *level*
justru paling akurat. Model dengan komponen tren/musiman malah *overfit*
pada guncangan sesaat — terlihat dari ramalan Triple Smoothing yang anjlok
ke ~20K karena mengira penurunan Jun–Jul adalah pola musiman.

> ⚠️ MAPE ±16–19% tergolong sedang; volatilitas tinggi + data pendek (24 bln)
> membatasi akurasi. Menambah data historis akan sangat membantu.

## Output
- `forecast_comparison.png` — chart fitted vs aktual + ramalan 6 bulan + bar MAPE
- `mape_comparison.csv` — tabel perbandingan akurasi
- `forecast_next_6_months.csv` — ramalan tiap metode 6 bulan ke depan
