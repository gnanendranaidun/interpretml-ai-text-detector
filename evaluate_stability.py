"""Repeat local explanations against the frozen model and saved RAID features."""

from itertools import combinations
import json
from pathlib import Path

import numpy as np
import pandas as pd
from interpret.blackbox import LimeTabular, ShapKernel
from scipy.stats import spearmanr

from src.explainability import ProbabilityAdapter
from src.feature_extraction import FEATURES
from src.model_loader import load_frozen_model

SEEDS = [42, 43, 44, 45, 46]


def summarize(runs):
    ranks, signs, overlaps = [], [], []
    for a, b in combinations(runs, 2):
        rank = spearmanr(abs(a), abs(b)).statistic
        ranks.append(float(rank) if np.isfinite(rank) else float(np.array_equal(a, b)))
        signs.append(float(np.mean(np.sign(a) == np.sign(b))))
        overlaps.append(len(set(np.argsort(-abs(a), kind="stable")[:3]) &
                            set(np.argsort(-abs(b), kind="stable")[:3])) / 3)
    metrics = [float(np.mean(values)) for values in (ranks, signs, overlaps)]
    badge = "Stable" if min(metrics) >= .8 else "Mixed" if min(metrics) >= .5 else "Unstable"
    return dict(zip(("rank_correlation", "sign_consistency", "top3_overlap", "badge"),
                    [*metrics, badge]))


def main():
    folder = Path(__file__).resolve().parent / "outputs/explanations"
    curves = json.loads((folder / "partial_dependence_global.json").read_text())
    sample = pd.DataFrame(dict(zip(FEATURES, (curve["values"] for curve in curves))))
    cases = json.loads((folder / "local_case_studies.json").read_text())
    inputs = pd.DataFrame([case["metadata"]["features"] for case in cases], columns=FEATURES)
    model, _ = load_frozen_model()
    adapter = ProbabilityAdapter(model)
    background = sample.sample(50, random_state=42)
    methods = {"LIME": [], "Kernel SHAP": []}
    probabilities = []
    for seed in SEEDS:
        np.random.seed(seed)
        lime = LimeTabular(adapter.predict_proba, background, feature_names=FEATURES,
                          random_state=seed)
        shap = ShapKernel(adapter.predict_proba, background, feature_names=FEATURES)
        probabilities.append(adapter.predict_proba(inputs)[:, 1])
        explanations = {
            "LIME": lime.explain_local(inputs, num_samples=3000),
            "Kernel SHAP": shap.explain_local(inputs, nsamples=128),
        }
        for name, explanation in explanations.items():
            values = []
            for index in range(len(inputs)):
                row = explanation.data(index)
                scores = dict(zip(row["names"], row["scores"]))
                values.append([scores[feature] for feature in FEATURES])
            methods[name].append(values)
    result = {
        "seeds": SEEDS,
        "background": "Fixed 50-row sample drawn from the saved 500-row PDP cohort",
        "lime_samples": 3000,
        "kernel_shap_samples": 128,
        "cases": {
            case["case"]: {
                "probability_range": float(np.ptp(np.array(probabilities)[:, index])),
                "methods": {name: summarize(np.array(runs)[:, index, :])
                            for name, runs in methods.items()},
            }
            for index, case in enumerate(cases)
        },
    }
    (folder / "local_stability.json").write_text(
        json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
