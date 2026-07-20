"""
Forecast Method Comparison - Case 2 FACT
=========================================
Membandingkan 4 metode forecasting pada data time series bulanan:
    1. Regression (Linear Trend / OLS)
    2. Single Exponential Smoothing (SES)
    3. Double Exponential Smoothing (Holt)
    4. Triple Exponential Smoothing (Holt-Winters, seasonal)

Evaluasi akurasi menggunakan MAPE (Mean Absolute Percentage Error).
Output: tabel perbandingan (CSV) + chart perbandingan (PNG).

Menjalankan:  python forecast_comparison.py
"""

import warnings
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

from sklearn.linear_model import LinearRegression
from statsmodels.tsa.holtwinters import (
    SimpleExpSmoothing,
    Holt,
    ExponentialSmoothing,
)

warnings.filterwarnings("ignore")

DATA_PATH = "Case_2_FACT.xlsx"
SEASONAL_PERIODS = 12   # data bulanan -> pola musiman tahunan
FORECAST_HORIZON = 6    # jumlah bulan yang diramalkan ke depan


# --------------------------------------------------------------------------- #
# 1. Load & siapkan data
# --------------------------------------------------------------------------- #
def load_data(path: str) -> pd.Series:
    """Baca Excel, jadikan deret waktu bulanan yang teratur.

    Dataset asli memiliki gap (Jan-Mar 2024 hilang). Agar deret menjadi
    time series bulanan yang teratur -- syarat untuk Holt-Winters seasonal --
    gap diisi dengan interpolasi linear.
    """
    df = pd.read_excel(path, header=None, names=["date", "value"])
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").set_index("date")

    # Buat index bulanan penuh dari awal sampai akhir (mengisi bulan yang hilang)
    full_index = pd.date_range(df.index.min(), df.index.max(), freq="MS")
    series = df["value"].reindex(full_index)

    n_missing = int(series.isna().sum())
    if n_missing:
        print(f"[info] {n_missing} bulan hilang -> diisi dengan interpolasi linear")
        series = series.interpolate(method="linear")

    series.index.freq = "MS"
    series.name = "value"
    return series


# --------------------------------------------------------------------------- #
# 2. Metrik evaluasi
# --------------------------------------------------------------------------- #
def mape(actual, predicted) -> float:
    """Mean Absolute Percentage Error (%)."""
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    mask = actual != 0
    return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100)


def mae(actual, predicted) -> float:
    return float(np.mean(np.abs(np.asarray(actual) - np.asarray(predicted))))


def rmse(actual, predicted) -> float:
    return float(np.sqrt(np.mean((np.asarray(actual) - np.asarray(predicted)) ** 2)))


# --------------------------------------------------------------------------- #
# 3. Metode forecasting
# --------------------------------------------------------------------------- #
def fit_regression(series: pd.Series, horizon: int):
    """Linear Regression terhadap indeks waktu (tren linier)."""
    y = series.values
    X = np.arange(len(y)).reshape(-1, 1)
    model = LinearRegression().fit(X, y)

    fitted = model.predict(X)
    future_X = np.arange(len(y), len(y) + horizon).reshape(-1, 1)
    forecast = model.predict(future_X)
    return pd.Series(fitted, index=series.index), forecast


def fit_ses(series: pd.Series, horizon: int):
    """Single Exponential Smoothing (level saja, tanpa tren/musiman)."""
    model = SimpleExpSmoothing(series, initialization_method="estimated").fit()
    return model.fittedvalues, model.forecast(horizon).values


def fit_holt(series: pd.Series, horizon: int):
    """Double Exponential Smoothing / Holt (level + tren)."""
    model = Holt(series, initialization_method="estimated").fit()
    return model.fittedvalues, model.forecast(horizon).values


def fit_holt_winters(series: pd.Series, horizon: int, periods: int):
    """Triple Exponential Smoothing / Holt-Winters (level + tren + musiman)."""
    model = ExponentialSmoothing(
        series,
        trend="add",
        seasonal="add",
        seasonal_periods=periods,
        initialization_method="estimated",
    ).fit()
    return model.fittedvalues, model.forecast(horizon).values


# --------------------------------------------------------------------------- #
# 4. Jalankan semua metode & evaluasi
# --------------------------------------------------------------------------- #
def run(series: pd.Series):
    methods = {
        "Regression (Linear)":      lambda: fit_regression(series, FORECAST_HORIZON),
        "Single Exp. Smoothing":    lambda: fit_ses(series, FORECAST_HORIZON),
        "Double Exp. Smoothing":    lambda: fit_holt(series, FORECAST_HORIZON),
        "Triple Exp. Smoothing":    lambda: fit_holt_winters(series, FORECAST_HORIZON, SEASONAL_PERIODS),
    }

    fitted_all, forecast_all, rows = {}, {}, []
    for name, fn in methods.items():
        try:
            fitted, forecast = fn()
            fitted = pd.Series(np.asarray(fitted), index=series.index)
            fitted_all[name] = fitted
            forecast_all[name] = forecast
            rows.append({
                "Metode": name,
                "MAPE (%)": round(mape(series.values, fitted.values), 2),
                "MAE":      round(mae(series.values, fitted.values), 1),
                "RMSE":     round(rmse(series.values, fitted.values), 1),
            })
        except Exception as e:   # noqa: BLE001
            print(f"[warn] {name} gagal: {e}")

    table = pd.DataFrame(rows).sort_values("MAPE (%)").reset_index(drop=True)
    return fitted_all, forecast_all, table


# --------------------------------------------------------------------------- #
# 5. Visualisasi
# --------------------------------------------------------------------------- #
def thousands(x, _pos):
    return f"{x/1000:.0f}K"


def make_chart(series, fitted_all, forecast_all, table, best, out="forecast_comparison.png"):
    future_idx = pd.date_range(
        series.index[-1] + pd.offsets.MonthBegin(1), periods=FORECAST_HORIZON, freq="MS"
    )
    colors = {
        "Regression (Linear)":   "#e15759",
        "Single Exp. Smoothing": "#59a14f",
        "Double Exp. Smoothing": "#f28e2b",
        "Triple Exp. Smoothing": "#4e79a7",
    }

    fig, axes = plt.subplots(2, 1, figsize=(13, 11),
                             gridspec_kw={"height_ratios": [3, 2]})

    # --- Panel atas: fitted vs actual + forecast ke depan ---
    ax = axes[0]
    ax.plot(series.index, series.values, "o-", color="black", lw=2.2,
            label="Data Aktual", zorder=5, markersize=5)

    for name, fitted in fitted_all.items():
        c = colors.get(name, None)
        ax.plot(fitted.index, fitted.values, "--", color=c, lw=1.6, alpha=0.9, label=name)
        fc = forecast_all[name]
        ax.plot(future_idx, fc, ":", color=c, lw=1.8, alpha=0.85)

    ax.axvspan(future_idx[0], future_idx[-1], color="grey", alpha=0.08)
    ax.text(future_idx[len(future_idx)//2], ax.get_ylim()[1]*0.97, "Forecast",
            ha="center", va="top", fontsize=9, color="grey", style="italic")
    ax.set_title("Perbandingan Metode Forecasting — Fitted vs Aktual  (+ ramalan 6 bulan)",
                 fontsize=13, fontweight="bold")
    ax.set_ylabel("Value")
    ax.yaxis.set_major_formatter(FuncFormatter(thousands))
    ax.legend(loc="upper left", fontsize=8, ncol=2)
    ax.grid(True, alpha=0.25)

    # --- Panel bawah: bar chart MAPE ---
    ax2 = axes[1]
    order = table.sort_values("MAPE (%)")
    bar_colors = [colors.get(m, "#888") for m in order["Metode"]]
    bars = ax2.barh(order["Metode"], order["MAPE (%)"], color=bar_colors, alpha=0.85)
    ax2.invert_yaxis()
    for bar, val in zip(bars, order["MAPE (%)"]):
        ax2.text(val + 0.3, bar.get_y() + bar.get_height()/2, f"{val:.2f}%",
                 va="center", fontsize=10, fontweight="bold")
    ax2.set_title(f"Evaluasi Akurasi — MAPE (semakin kecil semakin baik)  |  Terbaik: {best}",
                  fontsize=12, fontweight="bold")
    ax2.set_xlabel("MAPE (%)")
    ax2.grid(True, axis="x", alpha=0.25)

    plt.tight_layout()
    plt.savefig(out, dpi=130, bbox_inches="tight")
    print(f"[ok] chart disimpan -> {out}")


# --------------------------------------------------------------------------- #
# 6. Main
# --------------------------------------------------------------------------- #
def main():
    series = load_data(DATA_PATH)
    print(f"[info] jumlah observasi: {len(series)}  ({series.index.min():%b %Y} - {series.index.max():%b %Y})\n")

    fitted_all, forecast_all, table = run(series)

    best = table.iloc[0]["Metode"]
    best_mape = table.iloc[0]["MAPE (%)"]

    print("=" * 60)
    print("TABEL PERBANDINGAN AKURASI")
    print("=" * 60)
    print(table.to_string(index=False))
    print("=" * 60)
    print(f"\n>> Metode paling cocok: {best}  (MAPE = {best_mape:.2f}%)\n")

    # Tabel ramalan ke depan
    future_idx = pd.date_range(
        series.index[-1] + pd.offsets.MonthBegin(1), periods=FORECAST_HORIZON, freq="MS"
    )
    fc_df = pd.DataFrame(
        {name: np.round(fc) for name, fc in forecast_all.items()},
        index=future_idx.strftime("%b %Y"),
    )
    print("RAMALAN 6 BULAN KE DEPAN")
    print("-" * 60)
    print(fc_df.to_string())

    # Simpan output
    table.to_csv("mape_comparison.csv", index=False)
    fc_df.to_csv("forecast_next_6_months.csv")
    print("\n[ok] tabel disimpan -> mape_comparison.csv, forecast_next_6_months.csv")

    make_chart(series, fitted_all, forecast_all, table, best)


if __name__ == "__main__":
    main()
