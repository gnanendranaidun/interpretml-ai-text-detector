"""Check that the presentation's measured assets are complete and consistent."""

import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent


def read(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def main():
    papers = read("academic_report/presentation_references.json")
    assert len({paper["url"] for paper in papers}) >= 25
    assert all(paper["year"] > 2020 and paper["authors"] and paper["venue"] and
               paper["relevance"] for paper in papers)
    correlation = read("outputs/explanations/feature_correlation.json")
    matrix = np.asarray(correlation["matrix"])
    assert correlation["n"] == 500 and matrix.shape == (8, 8)
    np.testing.assert_allclose(matrix, matrix.T)
    np.testing.assert_allclose(matrix.diagonal(), 1)
    assert (ROOT / "outputs/figures/feature_correlation.png").read_bytes().startswith(b"\x89PNG")
    cases = read("outputs/explanations/local_case_studies.json")
    stability = read("outputs/explanations/local_stability.json")
    assert set(stability["cases"]) == {case["case"] for case in cases}
    assert len(stability["seeds"]) >= 5
    print("Literature, correlation, and stability assets passed.")

    audit = read("outputs/metrics/audit.json")
    assert audit["n"] == sum(entry["count"] for entry in audit["bins"]) == 10_000
    assert audit["thresholds"][50] == audit["confusion"] == [[2704, 2296], [1605, 3395]]
    assert all(sum(map(sum, threshold)) == audit["n"] for threshold in audit["thresholds"])
    assert audit["errors"]["false_positives"]["count"] == 2296
    assert audit["errors"]["false_negatives"]["count"] == 1605
    assert all(sum(group["n"] for group in groups.values()) == 10_000
               for groups in audit["slices"].values())
    print("Calibration, thresholds, errors, and slice totals passed.")


if __name__ == "__main__":
    main()
