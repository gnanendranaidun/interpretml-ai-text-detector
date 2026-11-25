"""Recover the exact published RAID sample by ID from the pinned split."""

import csv
import json
from pathlib import Path

from datasets import load_dataset

from src.dataset_loader import RAID_REPO, RAID_REVISION, _label, _public_record
from src.feature_extraction import extract_stylometric_features


def main():
    data = Path(__file__).resolve().parent / "data"
    with (data / "sampled_record_ids.csv").open(newline="", encoding="utf-8") as handle:
        manifest = list(csv.DictReader(handle))
    pending = {row["id"] for row in manifest}
    if len(pending) != len(manifest) or len(pending) != 10_000:
        raise ValueError("Expected 10,000 distinct sample IDs")
    found = {}
    source = load_dataset(RAID_REPO, name="raid", split="train",
                          revision=RAID_REVISION, streaming=True)
    for index, row in enumerate(source, 1):
        record_id = row["id"]
        if record_id in pending:
            features = extract_stylometric_features(row["generation"])
            found[record_id] = _public_record(row, _label(row), features)
            pending.remove(record_id)
        if index % 500_000 == 0:
            print(f"Scanned {index:,}; recovered {len(found):,}", flush=True)
        if not pending:
            break
    if pending:
        raise ValueError(f"Missing {len(pending):,} published IDs from the pinned split")
    destination = data / "sampled_records.jsonl"
    staging = destination.with_suffix(".jsonl.part")
    with staging.open("w", encoding="utf-8") as handle:
        for entry in manifest:
            handle.write(json.dumps(found[entry["id"]], ensure_ascii=False) + "\n")
    staging.replace(destination)
    print(f"Recovered {len(found):,} rows", flush=True)


if __name__ == "__main__":
    main()
