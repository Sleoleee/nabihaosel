"""
Enam grafik per sel (pure chart, tanpa headline/insight) — Poppins, tema hijau.
Setiap sel = horizontal bar chart proporsi responden (skala total = 10 orang).

Run:
    python3 docs/cells_charts.py
Output:
    docs/cells/sel1_bidang_studi.png ... sel6_lokasi_kampus.png
"""

import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.font_manager import FontProperties
from matplotlib.colors import LinearSegmentedColormap

# ----------------------------------------------------------------------
# Poppins (bundled)
# ----------------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "fonts")
_WF = {400: "Poppins-Regular.ttf", 500: "Poppins-Medium.ttf",
       600: "Poppins-SemiBold.ttf", 700: "Poppins-Bold.ttf"}

def pp(size, weight=400):
    return FontProperties(fname=os.path.join(FONT_DIR, _WF[weight]), size=size)

# ----------------------------------------------------------------------
# Tema hijau
# ----------------------------------------------------------------------
INK        = "#1d2b23"
MUTED      = "#6f8377"
TRACK      = "#ecf5ef"
HILITE_BG  = "#dcefe2"
DEEP       = "#0e5c34"
BG         = "#ffffff"
GCMAP = LinearSegmentedColormap.from_list("green", ["#bfe6cd", "#54b985", "#126b3d"])

TOTAL = 10  # skala sumbu = total responden

# ----------------------------------------------------------------------
# Data tiap sel: (label, count, pct, highlight)
# ----------------------------------------------------------------------
CELLS = [
    ("sel1_bidang_studi", [
        ("Teknik Mesin / Energi", 4, 40, False),
        ("Teknik Elektro / Sistem Tenaga", 2, 20, False),
        ("Teknik Informatika / Ilmu Komputer", 2, 20, False),
        ("Teknik Instrumentasi", 1, 10, False),
        ("Teknik Kimia", 1, 10, False),
    ]),
    ("sel2_tahap_startup", [
        ("Ideation", 7, 70, True),
        ("Pre-Seed", 2, 20, False),
        ("Validation", 1, 10, False),
    ]),
    ("sel3_ukuran_tim", [
        ("4+ orang", 5, 50, False),
        ("2 orang", 3, 30, False),
        ("3 orang", 1, 10, False),
        ("Solo", 1, 10, False),
    ]),
    ("sel4_pengalaman_kompetisi", [
        ("Belum pernah", 7, 70, True),
        ("Lebih dari 2 kali", 2, 20, False),
        ("1–2 kali", 1, 10, False),
    ]),
    ("sel5_status_pendanaan", [
        ("Belum pernah", 7, 70, True),
        ("Rp5–9,9 juta", 2, 20, False),
        ("Rp10–49,9 juta", 2, 20, False),
    ]),
    ("sel6_lokasi_kampus", [
        ("ITS", 8, 80, False),
        ("PENS", 2, 20, False),
    ]),
]

OUT_DIR = os.path.join(HERE, "cells")
os.makedirs(OUT_DIR, exist_ok=True)

BAR_LW = 26        # tebal bar (points)


def draw_cell(fname, rows):
    rows = sorted(rows, key=lambda r: -r[1])         # terbesar di atas
    n = len(rows)
    vmax = max(r[1] for r in rows)

    fig_h = 1.05 + n * 0.92                            # landscape (lebar tetap)
    fig, ax = plt.subplots(figsize=(11, fig_h), dpi=150)
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)

    ax.set_xlim(0, TOTAL)
    ax.set_ylim(0.3, n + 0.9)

    for i, (label, count, pct, hi) in enumerate(rows):
        y = n - i                                     # baris teratas = nilai tertinggi

        # band highlight (pengganti "kotak highlight", tanpa strip/teks)
        if hi:
            ax.axhspan(y - 0.44, y + 0.62, color=HILITE_BG, zorder=0)

        # track penuh (0..total) — konteks proporsi
        ax.add_line(Line2D([0.05, TOTAL], [y, y], lw=BAR_LW, color=TRACK,
                    solid_capstyle="round", zorder=1))

        # bar nilai
        t = 0.30 + 0.70 * (count / vmax)
        color = DEEP if hi else GCMAP(min(t, 0.82))
        ax.add_line(Line2D([0.05, count], [y, y], lw=BAR_LW, color=color,
                    solid_capstyle="round", zorder=2))

        # label kategori DI ATAS bar (aman untuk teks panjang)
        ax.text(0.08, y + 0.40, label, ha="left", va="bottom",
                color=DEEP if hi else INK,
                fontproperties=pp(13.5, 600 if hi else 500), zorder=3)

        # nilai di ujung kanan bar
        ax.text(count + 0.22, y, f"{count} orang ({pct}%)", ha="left",
                va="center", color=DEEP if hi else INK,
                fontproperties=pp(12.5, 600), zorder=3)

    # bersihkan sumbu — pure grafik
    for sp in ax.spines.values():
        sp.set_visible(False)
    ax.set_xticks([])
    ax.set_yticks([])

    fig.subplots_adjust(left=0.02, right=0.985, top=0.97, bottom=0.05)
    out = os.path.join(OUT_DIR, fname + ".png")
    fig.savefig(out, dpi=150, facecolor=BG, bbox_inches="tight", pad_inches=0.3)
    plt.close(fig)
    print("saved:", out)


for fname, rows in CELLS:
    draw_cell(fname, rows)
