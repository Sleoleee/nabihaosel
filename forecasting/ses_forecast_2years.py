"""
Single Exponential Smoothing (SES) — Forecast 2 Tahun ke Depan
==============================================================
Meramalkan dataset Case 2 FACT selama 24 bulan (Jan 2025 - Des 2026)
menggunakan Single Exponential Smoothing.

Catatan: SES hanya menangkap komponen *level*, sehingga ramalan ke depan
berupa garis datar (konstan). Untuk memberi konteks ketidakpastian,
ditampilkan juga interval kepercayaan 95% (± 1.96 * sigma).

Output:
    - ses_forecast_2years.png  (chart: historis + ramalan + interval)
    - ses_forecast_2years.csv  (tabel ramalan 24 bulan)

Menjalankan:  python ses_forecast_2years.py
"""

import warnings
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
from statsmodels.tsa.holtwinters import SimpleExpSmoothing

warnings.filterwarnings("ignore")

DATA_PATH = "Case_2_FACT.xlsx"
FORECAST_HORIZON = 24   # 2 tahun = 24 bulan


def load_data(path: str) -> pd.Series:
    """Baca Excel -> deret bulanan teratur (gap diisi interpolasi linear)."""
    df = pd.read_excel(path, header=None, names=["date", "value"])
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").set_index("date")

    full_index = pd.date_range(df.index.min(), df.index.max(), freq="MS")
    series = df["value"].reindex(full_index)
    n_missing = int(series.isna().sum())
    if n_missing:
        print(f"[info] {n_missing} bulan hilang -> diisi interpolasi linear")
        series = series.interpolate(method="linear")
    series.index.freq = "MS"
    series.name = "value"
    return series


def mape(actual, predicted) -> float:
    actual, predicted = np.asarray(actual, float), np.asarray(predicted, float)
    mask = actual != 0
    return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100)


def thousands(x, _pos):
    return f"{x/1000:.0f}K"


def main():
    series = load_data(DATA_PATH)
    print(f"[info] observasi historis: {len(series)}  "
          f"({series.index.min():%b %Y} - {series.index.max():%b %Y})")

    # --- Fit SES ---
    model = SimpleExpSmoothing(series, initialization_method="estimated").fit()
    alpha = model.params["smoothing_level"]
    fitted = model.fittedvalues
    in_sample_mape = mape(series.values, fitted.values)

    # --- Forecast 24 bulan ---
    forecast = model.forecast(FORECAST_HORIZON)
    future_idx = pd.date_range(
        series.index[-1] + pd.offsets.MonthBegin(1),
        periods=FORECAST_HORIZON, freq="MS",
    )
    forecast.index = future_idx

    # --- Interval kepercayaan 95% ---
    # sigma dari residual in-sample; ketidakpastian SES tumbuh ~ sqrt(horizon)
    resid = series.values - fitted.values
    sigma = np.std(resid, ddof=1)
    steps = np.arange(1, FORECAST_HORIZON + 1)
    se = sigma * np.sqrt(1 + (steps - 1) * alpha**2)   # perkiraan SE bertahap
    lower = forecast.values - 1.96 * se
    upper = forecast.values + 1.96 * se

    print(f"[info] alpha (smoothing level) = {alpha:.4f}")
    print(f"[info] MAPE in-sample = {in_sample_mape:.2f}%")
    print(f"[info] level ramalan (konstan) = {forecast.values[0]:,.0f}\n")

    # --- Tabel output ---
    out = pd.DataFrame({
        "Bulan": future_idx.strftime("%b %Y"),
        "Forecast": np.round(forecast.values),
        "Lower 95%": np.round(np.clip(lower, 0, None)),
        "Upper 95%": np.round(upper),
    })
    print("RAMALAN SES — 24 BULAN KE DEPAN")
    print("=" * 55)
    print(out.to_string(index=False))
    out.to_csv("ses_forecast_2years.csv", index=False)
    print("\n[ok] tabel disimpan -> ses_forecast_2years.csv")

    # --- Chart ---
    fig, ax = plt.subplots(figsize=(13, 6.5))
    ax.plot(series.index, series.values, "o-", color="black", lw=2,
            markersize=5, label="Data Aktual (historis)", zorder=5)
    ax.plot(fitted.index, fitted.values, "--", color="#59a14f", lw=1.4,
            alpha=0.8, label=f"SES fitted (MAPE {in_sample_mape:.1f}%)")

    # sambungkan titik terakhir historis ke ramalan
    conn_x = [series.index[-1], future_idx[0]]
    conn_y = [series.values[-1], forecast.values[0]]
    ax.plot(conn_x, conn_y, ":", color="#4e79a7", lw=2, alpha=0.7)

    ax.plot(future_idx, forecast.values, ":", color="#4e79a7", lw=2.5,
            label=f"Forecast SES ({forecast.values[0]:,.0f})")
    ax.fill_between(future_idx, lower, upper, color="#4e79a7", alpha=0.15,
                    label="Interval 95%")

    ax.axvspan(future_idx[0], future_idx[-1], color="grey", alpha=0.06)
    ax.text(future_idx[len(future_idx)//2], ax.get_ylim()[1]*0.97,
            "Forecast 2 tahun", ha="center", va="top",
            fontsize=10, color="grey", style="italic")

    ax.set_title("Single Exponential Smoothing — Forecast 2 Tahun ke Depan "
                 f"(α = {alpha:.3f})", fontsize=13, fontweight="bold")
    ax.set_ylabel("Value")
    ax.set_xlabel("Bulan")
    ax.yaxis.set_major_formatter(FuncFormatter(thousands))
    ax.legend(loc="upper left", fontsize=9)
    ax.grid(True, alpha=0.25)

    plt.tight_layout()
    plt.savefig("ses_forecast_2years.png", dpi=130, bbox_inches="tight")
    print("[ok] chart disimpan -> ses_forecast_2years.png")


if __name__ == "__main__":
    main()
