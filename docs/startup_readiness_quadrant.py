"""
Peta Kesiapan Startup x Kedekatan PLN ICE — quadrant map (landscape, Poppins).

Sumbu X : Kesiapan Startup  (kiri: Ideation -> kanan: Pre-Seed/Validation)
Sumbu Y : Kedekatan PLN ICE (bawah: rendah -> atas: tinggi; intent + awareness)
Bubble  : tiga cluster, luas bubble sebanding jumlah orang (luas sebanding n).

Run:
    python3 docs/startup_readiness_quadrant.py
Output:
    docs/startup_readiness_quadrant.png
"""

import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties

# ----------------------------------------------------------------------
# Font: Poppins (di-bundle di docs/fonts/) untuk SEMUA teks.
# Poppins memakai penamaan lama (tiap bobot = family sendiri), jadi kita
# rujuk langsung per file lewat FontProperties agar semua bobot tepat.
# ----------------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "fonts")
_WEIGHT_FILE = {
    400: "Poppins-Regular.ttf",
    500: "Poppins-Medium.ttf",
    600: "Poppins-SemiBold.ttf",
    700: "Poppins-Bold.ttf",
}

def pp(size, weight=400):
    """FontProperties Poppins pada ukuran & bobot tertentu."""
    return FontProperties(fname=os.path.join(FONT_DIR, _WEIGHT_FILE[weight]),
                          size=size)

plt.rcParams["axes.unicode_minus"] = False

# ----------------------------------------------------------------------
# Palette
# ----------------------------------------------------------------------
INK      = "#1f2227"
INK_SOFT = "#565b66"
MUTED    = "#8a909c"
BG       = "#ffffff"

A_CLR = "#2e9e6b"   # Ready Believers      - hijau
B_CLR = "#e2892f"   # Hesitant Idealists   - oranye
C_CLR = "#5f7d9c"   # Competition Hoppers  - slate blue

# ----------------------------------------------------------------------
# Data segmen (x, y skala 0-100; luas bubble sebanding jumlah orang)
# lab_dir: +1 = label di atas bubble, -1 = di bawah bubble
# ----------------------------------------------------------------------
segments = [
    dict(key="A", name="Ready Believers",    n=3, pct=30, x=68, y=78,
         color=A_CLR, label="Siap konversi, effort rendah",           lab_dir=+1),
    dict(key="B", name="Hesitant Idealists",  n=5, pct=50, x=24, y=50,
         color=B_CLR, label="Potensial terbesar, tetapi butuh confidence", lab_dir=-1),
    dict(key="C", name="Competition Hoppers", n=2, pct=20, x=82, y=22,
         color=C_CLR, label="Sudah punya rumah lain, butuh alasan pindah", lab_dir=+1),
]

AREA_PER_PERSON = 2600.0   # luas (points^2) per orang -> luas bubble sebanding n

# ----------------------------------------------------------------------
# Figure — landscape
# ----------------------------------------------------------------------
fig, ax = plt.subplots(figsize=(13.5, 7.6), dpi=150)
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)
ax.set_xlim(0, 100)
ax.set_ylim(0, 100)

# --- tint kuadran (halus) ---
ax.axhspan(50, 100, xmin=0.5, xmax=1.0, color=A_CLR, alpha=0.06, zorder=0)
ax.axhspan(0, 50,  xmin=0.0, xmax=0.5, color=B_CLR, alpha=0.05, zorder=0)
ax.axhspan(0, 50,  xmin=0.5, xmax=1.0, color=C_CLR, alpha=0.05, zorder=0)

# --- garis tengah kuadran (putus-putus, tipis) ---
ax.axvline(50, color=MUTED, lw=1.1, ls=(0, (5, 5)), alpha=0.55, zorder=1)
ax.axhline(50, color=MUTED, lw=1.1, ls=(0, (5, 5)), alpha=0.55, zorder=1)

# --- catatan zona kuadran (pojok) ---
ax.text(97, 96, "ZONA KONVERSI", ha="right", va="top", color=MUTED,
        fontproperties=pp(8.5, 600), zorder=2)
ax.text(3, 4, "ZONA NURTURE", ha="left", va="bottom", color=MUTED,
        fontproperties=pp(8.5, 600), zorder=2)
ax.text(97, 4, "ZONA REBUT", ha="right", va="bottom", color=MUTED,
        fontproperties=pp(8.5, 600), zorder=2)

# ----------------------------------------------------------------------
# Bubble + label (tanpa halo/lingkaran muda di luar bubble)
# ----------------------------------------------------------------------
fig.canvas.draw()   # agar transform data<->display akurat

def radius_data_units(area_pts2):
    r_pts = (area_pts2 / 3.14159) ** 0.5
    r_px = r_pts * fig.dpi / 72.0
    y0 = ax.transData.transform((0, 0))[1]
    y1 = ax.transData.transform((0, 1))[1]
    return r_px / abs(y1 - y0)

for s in segments:
    area = s["n"] * AREA_PER_PERSON
    # bubble tunggal — solid, tanpa halo
    ax.scatter(s["x"], s["y"], s=area, color=s["color"], alpha=0.92,
               edgecolors="white", linewidths=2.5, zorder=4)

    # huruf + n di dalam bubble
    ax.text(s["x"], s["y"] + 1.8, s["key"], ha="center", va="center",
            color="white", fontproperties=pp(18, 700), zorder=5)
    ax.text(s["x"], s["y"] - 3.6, f"n={s['n']} · {s['pct']}%", ha="center",
            va="center", color="white", fontproperties=pp(10, 500), zorder=5)

    # label di luar tepi bubble (radius + gap) -> tak pernah tabrakan
    r = radius_data_units(area)
    d = s["lab_dir"]
    name_y = s["y"] + d * (r + 2.8)
    sub_y  = s["y"] + d * (r + 6.2)
    va = "bottom" if d > 0 else "top"
    ax.text(s["x"], name_y, s["name"], ha="center", va=va, color=s["color"],
            fontproperties=pp(13, 600), zorder=5)
    ax.text(s["x"], sub_y, s["label"], ha="center", va=va, color=INK_SOFT,
            fontproperties=pp(10.5, 400), zorder=5)

# ----------------------------------------------------------------------
# Sumbu — label & penanda ujung (tanpa strip/panah karakter)
# ----------------------------------------------------------------------
ax.set_xlabel("Kesiapan Startup", color=INK, labelpad=14,
              fontproperties=pp(14, 600))
ax.set_ylabel("Kedekatan dengan PLN ICE", color=INK, labelpad=16,
              fontproperties=pp(14, 600))

ax.set_xticks([2, 98])
ax.set_xticklabels(["Ideation", "Pre-Seed / Validation"], color=MUTED)
ax.set_yticks([2, 98])
ax.set_yticklabels(["Rendah", "Tinggi"], color=MUTED, rotation=90, va="center")
ax.tick_params(length=0, pad=8)
for xt in ax.get_xticklabels():
    xt.set_fontproperties(pp(11, 500))
    xt.set_ha("left" if "Ideation" in xt.get_text() else "right")
for yt in ax.get_yticklabels():
    yt.set_fontproperties(pp(11, 500))

# panah arah (digambar, bukan karakter) — halus, di luar area plot
arrow = dict(arrowstyle="-|>", color=MUTED, lw=1.6, mutation_scale=13)
ax.annotate("", xy=(0.66, -0.105), xytext=(0.34, -0.105),
            xycoords="axes fraction", arrowprops=arrow)   # X: makin siap
ax.annotate("", xy=(-0.075, 0.66), xytext=(-0.075, 0.34),
            xycoords="axes fraction", arrowprops=arrow)   # Y: makin dekat

for side in ("top", "right"):
    ax.spines[side].set_visible(False)
for side in ("left", "bottom"):
    ax.spines[side].set_color(MUTED)
    ax.spines[side].set_linewidth(1.2)

# ----------------------------------------------------------------------
# Judul & catatan
# ----------------------------------------------------------------------
fig.suptitle("Peta Kesiapan Startup × Kedekatan dengan PLN ICE",
             x=0.065, ha="left", y=0.975, color=INK,
             fontproperties=pp(19, 700))
ax.set_title("Tiga cluster peserta · ukuran bubble sebanding jumlah orang · "
             "total n = 10", loc="left", color=INK_SOFT, pad=14,
             fontproperties=pp(12, 400))

note = ("Sumbu Y (kedekatan) = kombinasi intent + awareness level.\n"
        "B (n=5) terbesar · A (n=3) sedang · C (n=2) terkecil.")
ax.text(0.5, -0.19, note, transform=ax.transAxes, ha="center", va="top",
        color=MUTED, fontproperties=pp(10, 400))

plt.subplots_adjust(left=0.085, right=0.965, top=0.86, bottom=0.17)

out = os.path.join(HERE, "startup_readiness_quadrant.png")
fig.savefig(out, dpi=150, facecolor=BG, bbox_inches="tight", pad_inches=0.35)
print("saved:", out)
