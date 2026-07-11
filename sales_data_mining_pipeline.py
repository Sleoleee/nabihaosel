"""
Data Mining Pipeline — Sales Data
Menjalankan seluruh proses: generate data, EDA, preprocessing, clustering,
klasifikasi, dan evaluasi dalam satu script berurutan.
"""

import os
import warnings

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.cluster import KMeans
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.naive_bayes import GaussianNB
from sklearn.tree import DecisionTreeClassifier
from sklearn.svm import SVC
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
    confusion_matrix,
)

warnings.filterwarnings("ignore")

# ----------------------------------------------------------------------
# TEMA WARNA
# ----------------------------------------------------------------------
primary = "#6f2dbd"
secondary = "#b298dc"
accent1 = "#b8d0eb"
accent2 = "#b9faf8"
cmap_list = ["#6f2dbd", "#b298dc", "#b8d0eb", "#b9faf8"]

OUTDIR = "/mnt/user-data/outputs"
os.makedirs(OUTDIR, exist_ok=True)


def header(step, title):
    print("=" * 50 + f"\n STEP {step} — {title}\n" + "=" * 50)


# ======================================================================
# STEP 0 — GENERATE DATA DUMMY (1000 BARIS)
# ======================================================================
header(0, "GENERATE DATA DUMMY (1000 BARIS)")

np.random.seed(42)
n = 1000

# --- 1. Kategori ---
kategori_labels = [
    "AKSESORIS RAMBUT", "AKSESORIS", "ALAT MAKE UP", "TAS & DOMPET",
    "ROCHE", "AKSESORIS RAMBUT KAMINO", "STATIONERY", "TAS KARUNG",
    "TAS PAPERBAG", "MASKER",
]
kategori_probs = [0.26, 0.18, 0.14, 0.12, 0.08, 0.07, 0.06, 0.05, 0.02, 0.02]
Kategori = np.random.choice(kategori_labels, size=n, p=kategori_probs)

# --- 2. SlpName ---
slp_labels = ["Rosida", "Hani", "Regen", "Ipat", "Ine", "Febiola", "Riven", "Albert"]
slp_probs = [0.22, 0.17, 0.15, 0.14, 0.10, 0.09, 0.07, 0.06]
SlpName = np.random.choice(slp_labels, size=n, p=slp_probs)

# --- 3. Customer/Vendor_Name (25 toko, 5 dominan = 30% transaksi) ---
toko_names = [f"TOKO {chr(c)}" for c in range(ord("A"), ord("A") + 25)]  # TOKO A..TOKO Y
dominant_stores = toko_names[:5]
other_stores = toko_names[5:]
# 5 dominan berbagi 30%, 20 lainnya berbagi 70%
dom_prob_each = 0.30 / len(dominant_stores)
oth_prob_each = 0.70 / len(other_stores)
store_probs = [dom_prob_each] * len(dominant_stores) + [oth_prob_each] * len(other_stores)
store_probs = np.array(store_probs)
store_probs = store_probs / store_probs.sum()  # normalisasi presisi float
Customer_Name = np.random.choice(toko_names, size=n, p=store_probs)

# --- 4. Quantity (log-normal) ---
Quantity = np.random.lognormal(mean=1.8, sigma=1.0, size=n)
Quantity = np.clip(Quantity, 1, 200).astype(int)

# --- 5. harga_awal ---
def gen_harga_awal(size):
    buckets = np.random.choice(
        ["a", "b", "c", "d"], size=size, p=[0.40, 0.35, 0.20, 0.05]
    )
    vals = np.empty(size)
    for i, b in enumerate(buckets):
        if b == "a":
            vals[i] = np.random.randint(10000, 50000)
        elif b == "b":
            vals[i] = np.random.randint(50000, 100000)
        elif b == "c":
            vals[i] = np.random.randint(100000, 300000)
        else:
            vals[i] = np.random.randint(300000, 600001)
    # bulatkan ke kelipatan 500
    vals = (np.round(vals / 500) * 500).astype(int)
    return vals

harga_awal = gen_harga_awal(n)

# --- 6. Disc_pct_row ---
Disc_pct_row = np.where(
    np.random.random(n) < 0.70,
    0.0,
    np.round(np.random.uniform(5.0, 30.0, size=n), 1),
)

# --- 7. harga_jual ---
harga_jual = np.round(harga_awal * (1 - Disc_pct_row / 100)).astype(int)

# --- 8. Disc_pct_doc ---
Disc_pct_doc = np.where(
    np.random.random(n) < 0.85,
    0.0,
    np.round(np.random.uniform(2.0, 15.0, size=n), 1),
)

# --- 9. Row_Total ---
Row_Total = np.round(Quantity * harga_jual * (1 - Disc_pct_doc / 100)).astype(int)

# --- 10. revenue_per_unit ---
revenue_per_unit = Row_Total / Quantity

# --- 11. discount_flag ---
discount_flag = ((Disc_pct_row > 0) | (Disc_pct_doc > 0)).astype(int)

# --- 12. Status_payment (target, dengan korelasi lemah) ---
p_late = np.full(n, 0.58)  # baseline Late 58%
p_late = np.where(Row_Total > 1_000_000, 0.70, p_late)
p_late = np.where(Disc_pct_row > 15, 0.65, p_late)
p_late = np.where(np.isin(SlpName, ["Riven", "Albert"]), 0.40, p_late)
p_late = np.where(np.isin(Kategori, ["MASKER", "STATIONERY"]), 0.45, p_late)
p_late = np.clip(p_late, 0.0, 1.0)

late_binom = np.random.binomial(1, p_late)
Status_payment = np.where(late_binom == 1, "Late", "On Time")

# --- 13. delay_days ---
delay_days = np.where(
    Status_payment == "On Time",
    np.random.randint(0, 4, size=n),
    np.random.randint(4, 46, size=n),
)

df = pd.DataFrame(
    {
        "Kategori": Kategori,
        "SlpName": SlpName,
        "Customer_Name": Customer_Name,
        "Quantity": Quantity,
        "harga_awal": harga_awal,
        "Disc_pct_row": Disc_pct_row,
        "harga_jual": harga_jual,
        "Disc_pct_doc": Disc_pct_doc,
        "Row_Total": Row_Total,
        "revenue_per_unit": revenue_per_unit,
        "discount_flag": discount_flag,
        "delay_days": delay_days,
        "Status_payment": Status_payment,
    }
)

df.to_csv(os.path.join(OUTDIR, "dummy_sales.csv"), index=False)

print("df.shape:", df.shape)
print("\ndf.dtypes:\n", df.dtypes)
print("\nStatus_payment value_counts:\n", df["Status_payment"].value_counts())
print("\ndf.describe():\n", df.describe())


# ======================================================================
# STEP 1 — MEMAHAMI DATA (EDA)
# ======================================================================
header(1, "MEMAHAMI DATA (EDA)")

fig, axes = plt.subplots(2, 2, figsize=(15, 11))
fig.patch.set_facecolor("white")

# Plot 1 (top-left): Bar horizontal distribusi Kategori
kat_counts = df["Kategori"].value_counts()
bar_colors1 = [cmap_list[i % len(cmap_list)] for i in range(len(kat_counts))]
axes[0, 0].barh(kat_counts.index[::-1], kat_counts.values[::-1], color=bar_colors1[::-1])
axes[0, 0].set_title("Distribusi Kategori Produk", fontweight="bold")
axes[0, 0].set_xlabel("Jumlah Transaksi")

# Plot 2 (top-right): Pie Status_payment
status_counts = df["Status_payment"].value_counts()
# pastikan urutan Late, On Time konsisten dengan warna
order = ["Late", "On Time"]
status_vals = [status_counts.get(o, 0) for o in order]
axes[0, 1].pie(
    status_vals, labels=order, colors=["#6f2dbd", "#b9faf8"],
    autopct="%1.1f%%", startangle=90,
)
axes[0, 1].set_title("Proporsi Status Pembayaran", fontweight="bold")

# Plot 3 (bottom-left): Bar top 8 SlpName by total Row_Total
slp_sales = df.groupby("SlpName")["Row_Total"].sum().sort_values(ascending=False).head(8)
bar_colors3 = [cmap_list[i % len(cmap_list)] for i in range(len(slp_sales))]
axes[1, 0].bar(slp_sales.index, slp_sales.values, color=bar_colors3)
axes[1, 0].set_title("Total Penjualan per Salesperson", fontweight="bold")
axes[1, 0].set_ylabel("Total Row_Total")
axes[1, 0].tick_params(axis="x", rotation=45)

# Plot 4 (bottom-right): Histogram Row_Total
axes[1, 1].hist(df["Row_Total"], bins=30, color="#b298dc", edgecolor="#6f2dbd")
axes[1, 1].set_title("Distribusi Nilai Transaksi (Row Total)", fontweight="bold")
axes[1, 1].set_xlabel("Row_Total")
axes[1, 1].set_ylabel("Frekuensi")

plt.tight_layout()
fig.savefig(os.path.join(OUTDIR, "step1_eda.png"), dpi=150, facecolor="white")
plt.close(fig)
print("Saved step1_eda.png")


# ======================================================================
# STEP 2 — DATA PREPROCESSING
# ======================================================================
header(2, "DATA PREPROCESSING")

le_kat = LabelEncoder()
le_slp = LabelEncoder()
le_cust = LabelEncoder()

df["Kategori_enc"] = le_kat.fit_transform(df["Kategori"])
df["SlpName_enc"] = le_slp.fit_transform(df["SlpName"])
df["Customer_enc"] = le_cust.fit_transform(df["Customer_Name"])

# Target: On Time=0, Late=1
df["Status_enc"] = df["Status_payment"].map({"On Time": 0, "Late": 1})

feature_cols = [
    "Kategori_enc", "SlpName_enc", "Customer_enc", "Quantity",
    "harga_awal", "harga_jual", "Disc_pct_row", "Disc_pct_doc",
    "Row_Total", "delay_days", "discount_flag", "revenue_per_unit",
]
X = df[feature_cols].copy()
y = df["Status_enc"].copy()

scaler = StandardScaler()
X_scaled = pd.DataFrame(scaler.fit_transform(X), columns=feature_cols, index=X.index)

print("X_scaled shape:", X_scaled.shape)
print("\nDistribusi y (Status_enc):\n", y.value_counts())
print("  0 = On Time, 1 = Late")


# ======================================================================
# STEP 3 — CLUSTERING dengan K-Means
# ======================================================================
header(3, "CLUSTERING dengan K-Means")

# 3a. Elbow Method
inertias = []
k_range = range(2, 10)
for k in k_range:
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    km.fit(X_scaled)
    inertias.append(km.inertia_)
    print(f"k={k} -> inertia (WSS)= {km.inertia_:.2f}")

fig, ax = plt.subplots(figsize=(9, 6))
fig.patch.set_facecolor("white")
ax.plot(list(k_range), inertias, color="#6f2dbd", marker="o",
        markerfacecolor="#b298dc", markersize=10, linewidth=2)
ax.set_title("Elbow Method — WSS per Jumlah Cluster", fontweight="bold")
ax.set_xlabel("Jumlah Cluster (k)")
ax.set_ylabel("WSS (Inertia)")
ax.grid(True, alpha=0.3)
plt.tight_layout()
fig.savefig(os.path.join(OUTDIR, "step3_elbow.png"), dpi=150, facecolor="white")
plt.close(fig)
print("Saved step3_elbow.png")

# 3b. Fit KMeans k=3
kmeans = KMeans(n_clusters=3, random_state=42, n_init=10)
df["Cluster"] = kmeans.fit_predict(X_scaled)

# 3c. Profil cluster
profil = df.groupby("Cluster")[
    ["Quantity", "harga_jual", "Row_Total", "Disc_pct_row", "delay_days"]
].mean()
print("\nProfil Cluster (mean):\n", profil.round(2))

cluster_names = {
    0: "Transaksi Kecil Reguler",
    1: "Transaksi Besar Premium",
    2: "Transaksi Diskon Tinggi",
}
# Penamaan otomatis berdasarkan profil: Row_Total tertinggi = Premium,
# Disc_pct_row tertinggi = Diskon Tinggi, sisanya = Kecil Reguler
premium_cluster = profil["Row_Total"].idxmax()
disc_cluster = profil["Disc_pct_row"].idxmax()
if disc_cluster == premium_cluster:
    # jika bertabrakan, pilih diskon tertinggi kedua
    disc_cluster = profil["Disc_pct_row"].drop(premium_cluster).idxmax()
reguler_cluster = [c for c in profil.index if c not in (premium_cluster, disc_cluster)][0]
cluster_names = {
    reguler_cluster: "Transaksi Kecil Reguler",
    premium_cluster: "Transaksi Besar Premium",
    disc_cluster: "Transaksi Diskon Tinggi",
}
print("\nPenamaan cluster (berdasarkan profil):")
for c in sorted(cluster_names):
    print(f"  Cluster {c} = {cluster_names[c]}")

# 3d. Scatter plot cluster
cluster_colors = {0: "#6f2dbd", 1: "#b298dc", 2: "#b9faf8"}
fig, ax = plt.subplots(figsize=(10, 7))
fig.patch.set_facecolor("white")
for c in sorted(df["Cluster"].unique()):
    sub = df[df["Cluster"] == c]
    ax.scatter(
        sub["harga_jual"], sub["Row_Total"],
        c=cluster_colors[c], alpha=0.6, edgecolor="white", linewidth=0.3,
        label=f"Cluster {c}: {cluster_names[c]}",
    )
ax.set_title("Cluster Transaksi: harga_jual vs Row_Total", fontweight="bold")
ax.set_xlabel("harga_jual")
ax.set_ylabel("Row_Total")
ax.legend()
plt.tight_layout()
fig.savefig(os.path.join(OUTDIR, "step3_scatter.png"), dpi=150, facecolor="white")
plt.close(fig)
print("Saved step3_scatter.png")


# ======================================================================
# STEP 4 — KLASIFIKASI: PREDIKSI Status_payment
# ======================================================================
header(4, "KLASIFIKASI: PREDIKSI Status_payment")

X_final = X_scaled.copy()
X_final["Cluster"] = df["Cluster"].values

X_train, X_test, y_train, y_test = train_test_split(
    X_final, y, test_size=0.2, random_state=42, stratify=y
)

target_names = ["On Time", "Late"]
results = {}
predictions = {}


def evaluate_model(name, model):
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    results[name] = {
        "Accuracy": accuracy_score(y_test, y_pred),
        "Precision": precision_score(y_test, y_pred, average="macro", zero_division=0),
        "Recall": recall_score(y_test, y_pred, average="macro", zero_division=0),
        "F1-Score": f1_score(y_test, y_pred, average="macro", zero_division=0),
    }
    predictions[name] = y_pred
    print(f"\n--- {name} ---")
    print(classification_report(y_test, y_pred, target_names=target_names, zero_division=0))
    return model


# 4a. KNN
evaluate_model("KNN", KNeighborsClassifier(n_neighbors=5))

# 4b. LDA
evaluate_model("LDA", LinearDiscriminantAnalysis())

# 4c. Naive Bayes
evaluate_model("Naive Bayes", GaussianNB())

# 4d. Decision Tree
dt_model = evaluate_model(
    "Decision Tree", DecisionTreeClassifier(max_depth=5, random_state=42)
)

# Feature importance Decision Tree (top 10)
importances = pd.Series(dt_model.feature_importances_, index=X_final.columns)
top10 = importances.sort_values(ascending=False).head(10)
fig, ax = plt.subplots(figsize=(9, 6))
fig.patch.set_facecolor("white")
ax.barh(top10.index[::-1], top10.values[::-1], color="#6f2dbd")
ax.set_title("Top 10 Feature Importance — Decision Tree", fontweight="bold")
ax.set_xlabel("Importance")
plt.tight_layout()
fig.savefig(os.path.join(OUTDIR, "step4_dt_importance.png"), dpi=150, facecolor="white")
plt.close(fig)
print("Saved step4_dt_importance.png")

# 4e. SVM
evaluate_model("SVM", SVC(kernel="rbf", C=1.0, random_state=42))

# Confusion Matrix — satu subplot per model
cm_cmap = LinearSegmentedColormap.from_list("bp", ["#ffffff", "#6f2dbd"])
model_order = ["KNN", "LDA", "Naive Bayes", "Decision Tree", "SVM"]
fig, axes = plt.subplots(1, 5, figsize=(24, 5))
fig.patch.set_facecolor("white")
for ax, name in zip(axes, model_order):
    cm = confusion_matrix(y_test, predictions[name])
    im = ax.imshow(cm, cmap=cm_cmap)
    ax.set_title(name, fontweight="bold")
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_xticks([0, 1])
    ax.set_yticks([0, 1])
    ax.set_xticklabels(["On Time", "Late"])
    ax.set_yticklabels(["On Time", "Late"])
    thresh = cm.max() / 2.0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(
                j, i, format(cm[i, j], "d"), ha="center", va="center",
                color="white" if cm[i, j] > thresh else "black",
            )
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
plt.tight_layout()
fig.savefig(os.path.join(OUTDIR, "step4_confusion_matrices.png"), dpi=150, facecolor="white")
plt.close(fig)
print("Saved step4_confusion_matrices.png")


# ======================================================================
# STEP 5 — PERBANDINGAN & EVALUASI
# ======================================================================
header(5, "PERBANDINGAN & EVALUASI")

# 5a. Tabel ringkasan
summary = pd.DataFrame(results).T[["Accuracy", "Precision", "Recall", "F1-Score"]]
summary = summary.loc[model_order]
print("\nTabel Ringkasan Metrik:\n", summary.round(4))

# 5b. Bar chart perbandingan (grouped)
metrics = ["Accuracy", "Precision", "Recall", "F1-Score"]
metric_colors = ["#6f2dbd", "#b298dc", "#b8d0eb", "#b9faf8"]
x = np.arange(len(model_order))
width = 0.2

fig, ax = plt.subplots(figsize=(12, 7))
fig.patch.set_facecolor("white")
for i, m in enumerate(metrics):
    vals = [results[name][m] for name in model_order]
    ax.bar(x + (i - 1.5) * width, vals, width, label=m, color=metric_colors[i])
ax.set_title("Perbandingan Metrik antar Model", fontweight="bold")
ax.set_xticks(x)
ax.set_xticklabels(model_order)
ax.set_ylim(0.0, 1.0)
ax.set_ylabel("Skor")
ax.legend(loc="upper right")
ax.grid(axis="y", alpha=0.3, linewidth=0.5)
plt.tight_layout()
fig.savefig(os.path.join(OUTDIR, "step5_comparison.png"), dpi=150, facecolor="white")
plt.close(fig)
print("Saved step5_comparison.png")

# 5c. Kesimpulan otomatis
best_f1_model = summary["F1-Score"].idxmax()
best_f1_val = summary["F1-Score"].max()
best_recall_model = summary["Recall"].idxmax()
best_recall_val = summary["Recall"].max()

print(f"\nModel terbaik: {best_f1_model} dengan F1-Score {best_f1_val:.4f}")
print(
    f"Model terbaik untuk deteksi Late: {best_recall_model} "
    f"dengan Recall {best_recall_val:.4f}"
)

print(
    "\nInterpretasi Bisnis:\n"
    "Dalam kasus prediksi keterlambatan pembayaran, Recall lebih penting "
    "daripada Accuracy. Accuracy dapat menyesatkan karena kelas data tidak "
    "seimbang — model yang hanya menebak mayoritas bisa terlihat 'akurat' "
    "tetapi gagal menangkap transaksi yang benar-benar terlambat. Recall pada "
    "kelas 'Late' mengukur seberapa banyak transaksi terlambat yang berhasil "
    "terdeteksi. Melewatkan pelanggan yang akan terlambat membayar (false "
    "negative) berbiaya besar: arus kas terganggu dan tindakan penagihan "
    "preventif tidak dilakukan. Sebaliknya, false positive (menandai tepat "
    "waktu sebagai terlambat) hanya menimbulkan pengingat tambahan yang murah. "
    "Karena itu, memaksimalkan Recall untuk kelas Late lebih selaras dengan "
    "tujuan bisnis manajemen risiko kredit dan arus kas."
)

print("\n" + "=" * 50)
print(" PIPELINE SELESAI — semua output tersimpan di", OUTDIR)
print("=" * 50)
