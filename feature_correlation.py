"""Generate Pearson correlations from the notebook's aligned PDP sample."""

import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parent / "outputs"
SOURCE = ROOT / "explanations" / "partial_dependence_global.json"
FEATURES = json.loads((SOURCE.parent / "morris_global.json").read_text())["names"]
curves = json.loads(SOURCE.read_text())
sample = np.column_stack([curve["values"] for curve in curves])
assert sample.shape == (500, len(FEATURES)) and np.isfinite(sample).all()
matrix = np.corrcoef(sample, rowvar=False)
assert np.isfinite(matrix).all()
(SOURCE.parent / "feature_correlation.json").write_text(json.dumps({
    "method": "Pearson",
    "source": SOURCE.name,
    "n": len(sample),
    "features": FEATURES,
    "matrix": matrix.tolist(),
}, indent=2) + "\n", encoding="utf-8")

fig, ax = plt.subplots(figsize=(11, 8), layout="constrained")
heatmap = ax.imshow(matrix, cmap="RdBu_r", vmin=-1, vmax=1)
ax.set_xticks(range(len(FEATURES)), FEATURES, rotation=40, ha="right")
ax.set_yticks(range(len(FEATURES)), FEATURES)
ax.set_title("Feature correlations · 500 RAID rows used for PDP", pad=16)
for row, col in np.ndindex(matrix.shape):
    value = matrix[row, col]
    ax.text(col, row, f"{value:.2f}", ha="center", va="center",
            color="white" if abs(value) > .62 else "black")
fig.colorbar(heatmap, ax=ax, label="Pearson r")
fig.savefig(ROOT / "figures" / "feature_correlation.png", dpi=160)
