"""Score the public frozen Bitbrain BOAS labels against the human consensus."""
import csv
import io
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from sklearn.metrics import accuracy_score, cohen_kappa_score, f1_score

ROOT = Path(__file__).parent
BASE = "https://s3.amazonaws.com/openneuro.org/ds005555/"
LABELS = set(range(5))


def load_events(path, field):
    destination = ROOT / "data" / path
    if destination.is_file():
        payload = destination.read_bytes()
        downloaded = 0
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(3):
            try:
                with urllib.request.urlopen(BASE + path, timeout=20) as source:
                    payload = source.read(200_000)
                if not payload or len(payload) == 200_000:
                    raise ValueError(f"Unexpected event TSV size for {path}")
                break
            except OSError:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
        destination.write_bytes(payload)
        downloaded = len(payload)
    result = {}
    for row in csv.DictReader(io.StringIO(payload.decode()), delimiter="\t"):
        stage = int(float(row[field]))
        if stage in LABELS:
            onset = float(row["onset"])
            if onset in result:
                raise ValueError(f"Repeated scored epoch at {onset} in {path}")
            result[onset] = stage
    return result, downloaded


def score(subject):
    stem = f"{subject}/eeg/{subject}_task-Sleep_acq-"
    truth, psg_bytes = load_events(stem + "psg_events.tsv", "stage_hum")
    prediction, band_bytes = load_events(stem + "headband_events.tsv", "stage_ai")
    times = sorted(truth.keys() & prediction.keys())
    if not times:
        raise ValueError(f"No common valid epochs for {subject}")
    return [truth[t] for t in times], [prediction[t] for t in times], len(truth), psg_bytes + band_bytes


def main():
    start = time.perf_counter()
    with (ROOT / "data" / "participants.tsv").open() as participants:
        subjects = [row["participant_id"] for row in csv.DictReader(participants, delimiter="\t")]
    print(f"Scoring saved Bitbrain outputs for {len(subjects)} recordings", flush=True)
    with ThreadPoolExecutor(max_workers=8) as pool:
        rows = []
        for index, row in enumerate(pool.map(score, subjects), start=1):
            rows.append(row)
            if index % 32 == 0:
                print(f"Scored {index}/{len(subjects)} recordings", flush=True)
    truth = [value for row in rows for value in row[0]]
    prediction = [value for row in rows for value in row[1]]
    result = {
        "dataset": BASE,
        "model": "Public Bitbrain BOAS headband stage_ai outputs",
        "recordings": len(rows),
        "human_valid_epochs": sum(row[2] for row in rows),
        "matched_valid_epochs": len(truth),
        "new_download_bytes": sum(row[3] for row in rows),
        "wall_seconds": time.perf_counter() - start,
        "pooled_accuracy": accuracy_score(truth, prediction),
        "mean_recording_accuracy": sum(accuracy_score(row[0], row[1]) for row in rows) / len(rows),
        "macro_f1": f1_score(truth, prediction, average="macro"),
        "kappa": cohen_kappa_score(truth, prediction),
        "source_reported_agreement": 0.8671,
    }
    (ROOT / "results" / "published_boas_score.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2), flush=True)


if __name__ == "__main__":
    main()
