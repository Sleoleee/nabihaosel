import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib.patches import FancyArrowPatch, Rectangle
import os

# ---------- Fonts ----------
FONT_DIR = os.environ.get("FONT_DIR", "/home/claude/fonts")
for f in ["Poppins-Regular.ttf", "Poppins-Medium.ttf", "Poppins-SemiBold.ttf", "Poppins-Bold.ttf"]:
    fm.fontManager.addfont(os.path.join(FONT_DIR, f))
plt.rcParams["font.family"] = "Poppins"
plt.rcParams["axes.unicode_minus"] = False

def font(size, weight="Regular"):
    return fm.FontProperties(fname=os.path.join(FONT_DIR, f"Poppins-{weight}.ttf"), size=size)

# ---------- Palette ----------
RED_BRIGHT = "#fa0515"
ORANGE     = "#ff8b0d"
RED_TSEL   = "#ed1c24"
AMBER      = "#ffa709"
INK        = "#1a1a1a"
GRAY_TXT   = "#6b6b6b"
GRAY_MID   = "#b7b7b7"
GRAY_LT    = "#d9d9d9"
GRID       = "#ededed"

OUT = os.environ.get("OUT", "/mnt/user-data/outputs")
os.makedirs(OUT, exist_ok=True)

# ============================================================
# CHART 1 (1.2.1) — Market maturity S-curve: B2C vs B2B
# ============================================================
fig, ax = plt.subplots(figsize=(11, 6.6), dpi=200)
fig.patch.set_facecolor("white")
ax.set_facecolor("white")

# Smooth S-curves via logistic
x = np.linspace(0, 10, 400)
def logistic(x, x0, k, cap=100):
    return cap / (1 + np.exp(-k * (x - x0)))

b2c = logistic(x, 3.0, 1.15)          # matured, plateau high
b2b = logistic(x, 6.6, 0.95, cap=96)  # steep, still climbing

ax.plot(x, b2c, color=GRAY_MID, lw=3.2, zorder=3)
ax.plot(x, b2b, color=RED_TSEL, lw=3.6, zorder=4)

# "You are here" markers
b2c_here_x = 4.3; b2c_here_y = logistic(b2c_here_x, 3.0, 1.15)
b2b_here_x = 4.3; b2b_here_y = logistic(b2b_here_x, 6.6, 0.95, cap=96)
ax.scatter([b2c_here_x], [b2c_here_y], s=150, color=GRAY_MID, edgecolor="white", lw=2, zorder=5)
ax.scatter([b2b_here_x], [b2b_here_y], s=180, color=RED_BRIGHT, edgecolor="white", lw=2, zorder=6)

# Curve labels
ax.text(9.7, logistic(9.7,3.0,1.15)+1.5, "B2C  (Consumer)", color=GRAY_TXT,
        fontproperties=font(14, "SemiBold"), ha="right", va="bottom")
ax.text(9.7, logistic(9.7,6.6,0.95,96)-6.5, "B2B  (Enterprise)", color=RED_TSEL,
        fontproperties=font(14, "SemiBold"), ha="right", va="top")

# Annotation boxes \u2014 text placed in clear whitespace, connected to its marker
# by a thin leader line; a white halo behind each text keeps any residual
# line-crossing legible.
_HALO = dict(boxstyle="round,pad=0.28", facecolor="white", edgecolor="none", alpha=0.85)
def anno(mx, my, lx, ly, tx, ty, title, sub, color, ha="left"):
    # leader: marker -> block, in the de-emphasis gray, pulled clear of both ends
    ax.annotate("", xy=(mx, my), xytext=(lx, ly),
                arrowprops=dict(arrowstyle="-", color=GRAY_MID, lw=1.2, alpha=0.9,
                                shrinkA=7, shrinkB=3), zorder=4)
    ax.text(tx, ty, title, color=color, fontproperties=font(12.5, "SemiBold"),
            ha=ha, va="center", bbox=_HALO, zorder=8)
    ax.text(tx, ty-4.4, sub, color=GRAY_TXT, fontproperties=font(10.5),
            ha=ha, va="center", bbox=_HALO, zorder=8)

# B2C block -> upper-left whitespace (above the gray curve, clear of the y-axis label)
anno(b2c_here_x, b2c_here_y, 3.5, 86, 1.7, 90,
     "Saturation: diminishing returns",
     "Mobile ARPU Rp44,400  ( \u22126.6% YoY )", GRAY_TXT, "left")
# B2B block -> lower-right whitespace (below the red curve)
anno(b2b_here_x, b2b_here_y, 6.6, 24, 6.75, 26,
     "Steep growth: highest upside",
     "Data Center & Cloud  ( +24.6% YoY )", RED_BRIGHT, "left")

# Stage band labels along x — own row, clear of the axis title below
for xx, lab in [(1.2,"Emerging"),(5.0,"Growth"),(8.8,"Saturated")]:
    ax.text(xx, -6, lab, color=GRAY_MID, fontproperties=font(10.5, "Medium"), ha="center")

# Axes cosmetics (MBB minimal)
ax.set_xlim(0, 10); ax.set_ylim(0, 108)
ax.set_yticks([]); ax.set_xticks([])
for s in ["top","right","left"]:
    ax.spines[s].set_visible(False)
ax.spines["bottom"].set_color(GRAY_LT)
# axis arrow for maturity
ax.annotate("", xy=(10.15, 0), xytext=(0, 0),
            arrowprops=dict(arrowstyle="-|>", color=GRAY_MID, lw=1.4))
# axis title on its own row, centered under the x-axis, clear of stage labels
ax.text(5.0, -13, "Market maturity", color=GRAY_TXT, fontproperties=font(11, "Medium"),
        ha="center", va="center")
ax.text(-0.15, 104, "Adoption /\npenetration", color=GRAY_TXT, fontproperties=font(11, "Medium"),
        ha="left", va="top")

# Titles (action title, left aligned)
fig.text(0.055, 0.955, "B2C has matured into saturation; B2B is still on its steep growth curve",
         fontproperties=font(17.5, "Bold"), color=INK, ha="left", va="top")
fig.text(0.055, 0.905, "Market maturity of Telkomsel\u2019s consumer vs enterprise segments",
         fontproperties=font(12), color=GRAY_TXT, ha="left", va="top")
# top accent rule
fig.add_artist(plt.Line2D([0.055,0.945],[0.882,0.882], color=RED_TSEL, lw=2.4, transform=fig.transFigure))

fig.text(0.055, 0.028, "Source: PT Telkom Indonesia (2025); The Jakarta Post (2025). Curve shape illustrative; annotated figures are actual FY2024 data.",
         fontproperties=font(8.5), color=GRAY_MID, ha="left")

plt.subplots_adjust(left=0.055, right=0.945, top=0.85, bottom=0.16)
fig.savefig(f"{OUT}/1_2_1_market_maturity_b2c_vs_b2b.png", dpi=200, facecolor="white")
plt.close(fig)
print("chart 1 done")

# ============================================================
# CHART 2 (1.2.2) — Prioritization bubble matrix
# ============================================================
fig, ax = plt.subplots(figsize=(11, 7.4), dpi=200)
fig.patch.set_facecolor("white")
ax.set_facecolor("white")

# data: (name, x=5G fit, y=revenue, size=scalability, category)
items = [
    ("CPaaS",                4, 5, 9, "gray"),
    ("Cloud",                5, 7, 8, "gray"),
    ("IoT",                  7, 6, 8, "gray"),
    ("Industry 4.0\nsolutions", 8, 7, 6, "near"),
    ("Private 5G\nNetwork",  9, 8, 6, "win"),
    ("5G + MEC",            10, 9, 7, "win"),
]

xmid, ymid = 6.5, 6.5
# target quadrant shading (top-right)
ax.add_patch(Rectangle((xmid, ymid), 11-xmid, 11-ymid, facecolor=RED_TSEL, alpha=0.06, zorder=0))
ax.text(10.75, 10.72, "TARGET ZONE", color=RED_TSEL, fontproperties=font(10.5, "SemiBold"),
        ha="right", va="top", alpha=0.85)

# quadrant divider lines
ax.axvline(xmid, color=GRID, lw=1.4, zorder=1)
ax.axhline(ymid, color=GRID, lw=1.4, zorder=1)

color_map = {"gray": GRAY_MID, "near": ORANGE, "win": RED_TSEL}
edge_map  = {"gray": "#9a9a9a", "near": "#d9740a", "win": "#b3141b"}

def bsize(s):  # scalability -> area
    return (s ** 2) * 46

for name, xf, yr, sc, cat in items:
    col = color_map[cat]
    ax.scatter([xf],[yr], s=bsize(sc), color=col, alpha=0.9,
               edgecolor=edge_map[cat], lw=1.6, zorder=5)
    # 5G+MEC special: bright red core ring
    if name == "5G + MEC":
        ax.scatter([xf],[yr], s=bsize(sc)*0.30, color=RED_BRIGHT, edgecolor="white", lw=1.2, zorder=6)
    txt_col = "white" if cat in ("win","near") else INK
    ax.text(xf, yr, name, color=txt_col, fontproperties=font(10.5, "SemiBold"),
            ha="center", va="center", zorder=7, linespacing=1.0)

# axis labels
ax.set_xlabel("Strategic fit with 5G", fontproperties=font(12.5, "SemiBold"), color=INK, labelpad=10)
ax.set_ylabel("Revenue potential", fontproperties=font(12.5, "SemiBold"), color=INK, labelpad=10)
ax.set_xlim(2.5, 11); ax.set_ylim(3.2, 11)
ax.set_xticks([]); ax.set_yticks([])
# direction cues: small arrowheads at the high end of each axis (no → glyphs)
ax.annotate("", xy=(11.0, 3.2), xytext=(10.5, 3.2),
            arrowprops=dict(arrowstyle="-|>", color=GRAY_MID, lw=1.4), zorder=2, clip_on=False)
ax.annotate("", xy=(2.5, 11.0), xytext=(2.5, 10.5),
            arrowprops=dict(arrowstyle="-|>", color=GRAY_MID, lw=1.4), zorder=2, clip_on=False)
# low/high corner cues (slightly larger + semibold for legibility)
ax.text(2.72, 3.34, "Low", color=GRAY_TXT, fontproperties=font(10.5, "SemiBold"), ha="left", va="bottom")
ax.text(10.85, 3.34, "High", color=GRAY_TXT, fontproperties=font(10.5, "SemiBold"), ha="right", va="bottom")
ax.text(2.68, 10.85, "High", color=GRAY_TXT, fontproperties=font(10.5, "SemiBold"), ha="left", va="top", rotation=90)

for s in ["top","right"]:
    ax.spines[s].set_visible(False)
for s in ["left","bottom"]:
    ax.spines[s].set_color(GRAY_LT)

# bubble-size legend — with explicit Low/Med/High value tags beneath each sample
lx, ly = 3.35, 9.7
for i,(s,lab) in enumerate([(6,"Low"),(8,"Med"),(9,"High")]):
    bx = lx + i*0.72
    ax.scatter([bx],[ly], s=bsize(s)*0.5, color=GRAY_LT, edgecolor="#9a9a9a", lw=1, zorder=3)
    ax.text(bx, ly-0.62, lab, color=GRAY_TXT, fontproperties=font(8.5, "Medium"),
            ha="center", va="top", zorder=3)
ax.text(lx-0.15, ly+0.78, "Bubble size = Scalability", color=GRAY_TXT,
        fontproperties=font(9.5, "SemiBold"), ha="left")

# Titles
fig.text(0.055, 0.955, "5G + MEC and Private 5G occupy the high-value, high-fit quadrant",
         fontproperties=font(17.5, "Bold"), color=INK, ha="left", va="top")
fig.text(0.055, 0.905, "B2B technology opportunities scored on revenue potential vs strategic fit with 5G",
         fontproperties=font(12), color=GRAY_TXT, ha="left", va="top")
fig.add_artist(plt.Line2D([0.055,0.945],[0.882,0.882], color=RED_TSEL, lw=2.4, transform=fig.transFigure))

fig.text(0.055, 0.030, "Source: Team assessment (1\u201310 scale), aligned with the FMEA strategic-value scoring in Appendix A. Market context: MarketsandMarkets (2025); Mordor Intelligence (2025).",
         fontproperties=font(8), color=GRAY_MID, ha="left")

plt.subplots_adjust(left=0.075, right=0.945, top=0.85, bottom=0.12)
fig.savefig(f"{OUT}/1_2_2_technology_prioritization_matrix.png", dpi=200, facecolor="white")
plt.close(fig)
print("chart 2 done")
