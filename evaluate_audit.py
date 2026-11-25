"""Export calibration and false-positive/negative summaries for GitHub Pages."""

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix
from interpret.blackbox import ShapKernel

from src.explainability import ProbabilityAdapter
from src.feature_extraction import FEATURES
from src.model_loader import load_frozen_model


def explain_slices(records, model, probability):
    """Compare attribution magnitude on seeded samples with one shared background."""
    background = records[FEATURES].sample(50, random_state=42)
    np.random.seed(42)
    explainer = ShapKernel(ProbabilityAdapter(model).predict_proba, background,
                           feature_names=FEATURES)
    groups = records.assign(
        label=records["y_true"].map({0: "Human", 1: "AI"}),
        attack_status=np.select(
            [records["y_true"] == 0, records["attack"].isna(), records["attack"] == "none"],
            ["Human baseline", "Unavailable", "No attack"], default="Attacked"),
    )
    # Reuse explanations when the deterministic samples share a record.
    scores = {}
    result = {}
    for field in ("label", "domain", "model", "attack_status", "decoding", "repetition_penalty"):
        result[field] = {}
        for name, group in groups.groupby(field, dropna=False):
            chosen = group.sample(min(24, len(group)), random_state=42)
            missing = chosen.loc[~chosen.index.isin(scores)]
            if not missing.empty:
                explanation = explainer.explain_local(missing[FEATURES], nsamples=128)
                for position, index in enumerate(missing.index):
                    data = explanation.data(position)
                    scores[index] = dict(zip(data["names"], data["scores"]))
            attributions = pd.DataFrame([scores[index] for index in chosen.index])
            result[field][str(name) if pd.notna(name) else "Unavailable"] = {
                "n": len(group),
                "explained": len(chosen),
                "average_ai_score": float(probability[group.index].mean()),
                "mean_absolute_shap": attributions.abs().mean().to_dict(),
            }
    return result


def main():
    root = Path(__file__).resolve().parent
    records = pd.read_json(root / "data/sampled_records.jsonl", lines=True)
    model, _ = load_frozen_model(cache_dir=root / "models/cache")
    inputs = records[FEATURES].to_numpy(dtype=float)
    truth = records["y_true"].to_numpy()
    probability = model.predict_proba(inputs)[:, 1]
    predicted = model.predict(inputs)
    matrix = confusion_matrix(truth, predicted, labels=[0, 1]).tolist()
    if matrix != [[2704, 2296], [1605, 3395]]:
        raise ValueError(f"Recovered run differs from the recorded evaluation: {matrix}")

    bin_index = np.minimum((probability * 10).astype(int), 9)
    bins = []
    for index in range(10):
        members = bin_index == index
        count = int(members.sum())
        bins.append({
            "lower": index / 10,
            "upper": (index + 1) / 10,
            "count": count,
            "human": int(np.sum(members & (truth == 0))),
            "ai": int(np.sum(members & (truth == 1))),
            "mean_score": float(probability[members].mean()) if count else None,
            "observed_rate": float(truth[members].mean()) if count else None,
        })

    thresholds = []
    for level in range(101):
        flags = probability > level / 100
        thresholds.append(confusion_matrix(truth, flags, labels=[0, 1]).tolist())

    errors = {}
    for name, mask in {
        "false_positives": (truth == 0) & (predicted == 1),
        "false_negatives": (truth == 1) & (predicted == 0),
    }.items():
        group = records.loc[mask]
        errors[name] = {
            "count": len(group),
            "mean_chars": float(group["char_count"].mean()),
            "feature_quantiles": group[FEATURES].quantile([0, .25, .5, .75, 1]).to_dict(),
            "breakdowns": {
                key: group[key].fillna("Unavailable").value_counts().to_dict()
                for key in ("domain", "model", "attack", "decoding", "repetition_penalty")
            },
        }

    result = {
        "n": len(records),
        "confusion": matrix,
        "brier": float(np.mean((probability - truth) ** 2)),
        "ece": sum(bin_data["count"] * abs(bin_data["mean_score"] -
                   bin_data["observed_rate"]) for bin_data in bins
                   if bin_data["count"]) / len(records),
        "bins": bins,
        "thresholds": thresholds,
        "threshold_rule": "P(AI) > threshold; equality is Human",
        "errors": errors,
        "slices": explain_slices(records, model, probability),
    }
    output = root / "outputs/metrics/audit.json"
    output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
