"""Render report calibration charts from the published aggregate audit."""
import json
from pathlib import Path

import matplotlib.pyplot as plt

folder = Path(__file__).resolve().parent
audit = json.loads((folder.parent / "outputs/metrics/audit.json").read_text())
bins = [entry for entry in audit["bins"] if entry["count"]]
figure, axes = plt.subplots(1, 2, figsize=(10, 4), layout="constrained")
axes[0].plot([0, 1], [0, 1], "--", color="gray")
axes[0].scatter([b["mean_score"] for b in bins], [b["observed_rate"] for b in bins])
axes[0].set(xlabel="Mean model AI score", ylabel="Observed AI fraction",
            xlim=(0, 1), ylim=(0, 1), title="Reliability")
for label, offset in (("human", .028), ("ai", .072)):
    axes[1].bar([b["lower"] + offset for b in bins], [b[label] for b in bins],
                width=.04, label=label.title())
axes[1].set(xlabel="Model AI score", ylabel="Records", title="Score distribution")
axes[1].legend()
figure.savefig(folder / "calibration.png", dpi=170)
