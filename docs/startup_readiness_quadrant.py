"""
Peta Kesiapan Startup x Kedekatan PLN ICE — quadrant map (landscape).

Sumbu X : Kesiapan Startup  (kiri: Ideation -> kanan: Pre-Seed/Validation)
Sumbu Y : Kedekatan PLN ICE (bawah: rendah -> atas: tinggi; intent + awareness)
Bubble  : tiga cluster, luas area sebanding jumlah orang (area proporsional n).

Run:
    python3 docs/startup_readiness_quadrant.py
Output:
    docs/startup_readiness_quadrant.png
"""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

# ----------------------------------------------------------------------
# Palette (kalibrasi kontras terang; label teks pakai tinta, bukan warna seri)
# ----------------------------------------------------------------------
INK      = "#1f2227"
INK_SOFT = "#565b66"
MUTED    = "#8a909c"
BG       = "#ffffff"
PANEL    = "#faf8f4"
GRID     = "#e3dfd8"

A_CLR = "#2e9e6b"   # Ready Believers      - hijau
B_CLR = "#e2892f"   # Hesitant Idealists   - oranye
C_CLR = "#5f7d9c"   # Competition Hoppers  - slate blue

# ----------------------------------------------------------------------
# Data segmen: (x, y) pada skala 0-100, jumlah orang, warna, dst.
# ----------------------------------------------------------------------
segments = [
    # lab_dir: +1 = label di atas bubble, -1 = di bawah bubble
    dict(key="A", name="Ready Believers",     n=3, pct=30, x=68, y=78,
         color=A_CLR, label="Siap konversi — effort rendah",       lab_dir=+1),
    dict(key="B", name="Hesitant Idealists",   n=5, pct=50, x=24, y=50,
         color=B_CLR, label="Potensial terbesar — butuh confidence", lab_dir=-1),
    dict(key="C", name="Competition Hoppers",  n=2, pct=20, x=82, y=22,
         color=C_CLR, label="Sudah punya rumah lain — butuh alasan pindah", lab_dir=+1),
]

# luas bubble (points^2) sebanding jumlah orang  ->  area ~ n
AREA_PER_PERSON = 2200.0

# ----------------------------------------------------------------------
# Figure — landscape
# ----------------------------------------------------------------------
fig, ax = plt.subplots(figsize=(13.5, 7.6), dpi=150)
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)

ax.set_xlim(0, 100)
ax.set_ylim(0, 100)

# --- tint kuadran (halus) ---
ax.axhspan(50, 100, xmin=0.5, xmax=1.0, color=A_CLR, alpha=0.06, zorder=0)  # kanan-atas: konversi
ax.axhspan(0, 50,  xmin=0.0, xmax=0.5, color=B_CLR, alpha=0.05, zorder=0)   # kiri-bawah: nurture
ax.axhspan(0, 50,  xmin=0.5, xmax=1.0, color=C_CLR, alpha=0.05, zorder=0)   # kanan-bawah: rebut

# --- garis tengah kuadran (putus-putus, tipis, tidak dominan) ---
ax.axvline(50, color=MUTED, lw=1.1, ls=(0, (5, 5)), alpha=0.55, zorder=1)
ax.axhline(50, color=MUTED, lw=1.1, ls=(0, (5, 5)), alpha=0.55, zorder=1)

# --- catatan zona kuadran (pojok, kecil, tidak menutup bubble) ---
ax.text(97, 96, "ZONA KONVERSI", ha="right", va="top", fontsize=8.5,
        color=MUTED, fontweight="bold", zorder=2)
ax.text(3, 4, "ZONA NURTURE", ha="left", va="bottom", fontsize=8.5,
        color=MUTED, fontweight="bold", zorder=2)
ax.text(97, 4, "ZONA REBUT", ha="right", va="bottom", fontsize=8.5,
        color=MUTED, fontweight="bold", zorder=2)

# ----------------------------------------------------------------------
# Bubble + label
# ----------------------------------------------------------------------
# perlu render sekali agar transform data<->display akurat untuk hitung radius
fig.canvas.draw()

def radius_data_units(area_pts2):
    """radius bubble (points^2 area) dikonversi ke satuan-data sumbu-y."""
    r_pts = (area_pts2 / 3.14159) ** 0.5
    r_px = r_pts * fig.dpi / 72.0
    # tinggi 1 unit-data pada sumbu-y, dalam piksel
    y0 = ax.transData.transform((0, 0))[1]
    y1 = ax.transData.transform((0, 1))[1]
    px_per_unit = abs(y1 - y0)
    return r_px / px_per_unit

for s in segments:
    area = s["n"] * AREA_PER_PERSON
    # halo lembut
    ax.scatter(s["x"], s["y"], s=area * 1.5, color=s["color"], alpha=0.14,
               edgecolors="none", zorder=3)
    # bubble utama
    ax.scatter(s["x"], s["y"], s=area, color=s["color"], alpha=0.9,
               edgecolors="white", linewidths=2, zorder=4)

    # huruf + n di dalam bubble
    ax.text(s["x"], s["y"] + 1.6, s["key"], ha="center", va="center",
            fontsize=17, fontweight="bold", color="white", zorder=5)
    ax.text(s["x"], s["y"] - 3.4, f"n={s['n']} · {s['pct']}%", ha="center",
            va="center", fontsize=9.5, color="white", fontweight="bold", zorder=5)

    # label DITEMPATKAN di luar tepi bubble (radius + gap) -> tak pernah tabrakan
    r = radius_data_units(area)
    gap = 2.6
    d = s["lab_dir"]
    name_y = s["y"] + d * (r + gap)              # nama: tepat di luar tepi bubble
    sub_y  = s["y"] + d * (r + gap + 3.2)        # deskripsi: lebih jauh lagi
    va = "bottom" if d > 0 else "top"
    ax.text(s["x"], name_y, s["name"], ha="center", va=va, fontsize=12.5,
            fontweight="bold", color=s["color"], zorder=5)
    ax.text(s["x"], sub_y, s["label"], ha="center", va=va, fontsize=10,
            color=INK_SOFT, zorder=5)

# ----------------------------------------------------------------------
# Sumbu — label & arah (tanpa strip panjang, teks ringkas di ujung)
# ----------------------------------------------------------------------
ax.set_xlabel("Kesiapan Startup  →", fontsize=13.5, fontweight="bold",
              color=INK, labelpad=12)
ax.set_ylabel("Kedekatan dengan PLN ICE  →", fontsize=13.5, fontweight="bold",
              color=INK, labelpad=12)

# ticks jadi penanda ujung (bukan skala numerik)
ax.set_xticks([2, 98])
ax.set_xticklabels(["◂ Ideation", "Pre-Seed / Validation ▸"], fontsize=10.5,
                   color=MUTED, fontweight="bold")
ax.set_yticks([2, 98])
ax.set_yticklabels(["◂ Rendah", "Tinggi ▸"], fontsize=10.5, color=MUTED,
                   fontweight="bold", rotation=90, va="center")
ax.tick_params(length=0, pad=8)
for xt in ax.get_xticklabels():
    xt.set_ha("left" if "Ideation" in xt.get_text() else "right")

# frame ringan hanya kiri & bawah
for side in ("top", "right"):
    ax.spines[side].set_visible(False)
for side in ("left", "bottom"):
    ax.spines[side].set_color(MUTED)
    ax.spines[side].set_linewidth(1.2)

# ----------------------------------------------------------------------
# Judul
# ----------------------------------------------------------------------
fig.suptitle("Peta Kesiapan Startup × Kedekatan dengan PLN ICE",
             x=0.06, ha="left", y=0.975, fontsize=19, fontweight="bold",
             color=INK)
ax.set_title("Tiga cluster peserta · ukuran bubble sebanding jumlah orang "
             "(area ∝ n) · total n = 10",
             loc="left", fontsize=11.5, color=INK_SOFT, pad=14)

# ----------------------------------------------------------------------
# Legenda ukuran bubble (panel kanan-bawah, tak menutup data)
# ----------------------------------------------------------------------
note = ("Sumbu Y (kedekatan) = kombinasi intent + awareness level.\n"
        "B (n=5) terbesar · A (n=3) sedang · C (n=2) terkecil.")
ax.text(0.5, -0.16, note, transform=ax.transAxes, ha="center", va="top",
        fontsize=9.5, color=MUTED)

plt.subplots_adjust(left=0.075, right=0.965, top=0.86, bottom=0.16)

out = "docs/startup_readiness_quadrant.png"
fig.savefig(out, dpi=150, facecolor=BG, bbox_inches="tight", pad_inches=0.3)
print("saved:", out)
