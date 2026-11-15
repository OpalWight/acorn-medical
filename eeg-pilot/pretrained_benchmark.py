"""Benchmark public sleep-stage weights against the existing BOAS pilot labels."""
import csv
import hashlib
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import pyedflib
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

ROOT = Path(__file__).parent
DATA = ROOT / "data"
RESULTS = ROOT / "results"
STAGES = ["W", "N1", "N2", "N3", "R"]


def read_stages(path, column):
    result = {}
    with path.open() as file:
        for row in csv.DictReader(file, delimiter="\t"):
            code = int(float(row[column]))
            if 0 <= code < len(STAGES):
                second = float(row["onset"])
                if second % 30 != 0 or second < 0 or int(second) in result:
                    raise ValueError(f"Unexpected scoring grid in {path.name}: {second}")
                result[int(second)] = STAGES[code]
    return result


def read_headband(stem):
    headband = Path(f"{stem}headband_eeg.edf")
    with headband.open("rb") as file:
        header = file.read(256)
    if header[168:184] != Path(f"{stem}psg_header.bin").read_bytes()[168:184]:
        raise ValueError(f"Headband and PSG start times differ for {stem.name}")
    with pyedflib.EdfReader(str(headband)) as recording:
        voltages = []
        for channel in ("HB_1", "HB_2"):
            index = recording.getSignalLabels().index(channel)
            unit = recording.getPhysicalDimension(index)
            if unit not in {"uV", "µV", "μV"} or recording.getSampleFrequency(index) != 256:
                raise ValueError(f"Unexpected sample rate or units for {channel}: {unit}")
            voltages.append(recording.readSignal(index) * 1e-6)
    samples = min(map(len, voltages))
    samples -= samples % (30 * 256)
    return np.stack([channel[:samples] for channel in voltages])


def metrics(truth, predictions):
    true_n3 = np.asarray(truth) == "N3"
    pred_n3 = np.asarray(predictions) == "N3"
    tn, fp, fn, tp = confusion_matrix(true_n3, pred_n3, labels=[False, True]).ravel().tolist()
    classifier = classification_report(truth, predictions, labels=STAGES, output_dict=True, zero_division=0)
    assert tp + fp + fn + tn == len(truth)
    return {
        "epochs": len(truth),
        "accuracy": accuracy_score(truth, predictions),
        "macro_f1": f1_score(truth, predictions, labels=STAGES, average="macro", zero_division=0),
        "n3": {
            "precision": tp / (tp + fp) if tp + fp else None,
            "recall": tp / (tp + fn) if tp + fn else None,
            "specificity": tn / (tn + fp) if tn + fp else None,
            "f1": classifier["N3"]["f1-score"] if tp + fn else None,
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        },
        "confusion": confusion_matrix(truth, predictions, labels=STAGES).tolist(),
        "class_report": {stage: classifier[stage] for stage in STAGES},
    }


def file_sha256(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def yasa_predictor():
    import mne
    import yasa

    mne.set_log_level("ERROR")
    classifier_dir = Path(yasa.__file__).parent / "classifiers"
    weights = sorted(classifier_dir.glob("clf_eeg_lgb_*.joblib"))[-1]

    def predict(signals):
        output = {}
        for index, channel in enumerate(("HB_1", "HB_2")):
            info = mne.create_info([channel], sfreq=256, ch_types=["eeg"])
            raw = mne.io.RawArray(signals[index:index + 1], info, verbose="ERROR")
            prediction = yasa.SleepStaging(raw, eeg_name=channel).predict(path_to_model=str(weights))
            labels = {"WAKE": "W", "REM": "R"}
            output[f"YASA {channel}"] = [labels.get(stage, stage) for stage in prediction.hypno]
        return output

    return predict, {"package_version": yasa.__version__, "weight": weights.name, "sha256": file_sha256(weights)}


def run(predict, metadata, model):
    started = time.perf_counter()
    recordings = json.loads((DATA / "manifest.json").read_text())["recordings"]
    assert len({row["pid"] for row in recordings}) == len(recordings) == 10
    all_episodes = defaultdict(list)
    night_reports = []
    epoch_rows = []
    for row in recordings:
        subject = row["subject"]
        stem = DATA / subject / "eeg" / f"{subject}_task-Sleep_acq-"
        truth = read_stages(Path(f"{stem}psg_events.tsv"), "stage_hum")
        bitbrain = read_stages(Path(f"{stem}headband_events.tsv"), "stage_ai")
        seconds = time.perf_counter()
        signals = read_headband(stem)
        predictions = predict(signals)
        assert all(set(stages).issubset(STAGES) for stages in predictions.values())
        usable = min(len(stages) for stages in predictions.values())
        onsets = sorted(time for time in truth if time // 30 < usable)
        assert onsets
        truth_values = [truth[time] for time in onsets]
        night = {"subject": subject, "seconds": time.perf_counter() - seconds, "models": {}}
        for name, stages in predictions.items():
            sequence = [stages[time // 30] for time in onsets]
            night["models"][name] = metrics(truth_values, sequence)
            all_episodes[name].extend(zip(truth_values, sequence, strict=True))
            all_episodes[name + " (common Bitbrain epochs)"].extend(
                (truth[time], stages[time // 30]) for time in onsets if time in bitbrain
            )
        all_episodes["Bitbrain saved labels (common epochs)"].extend(
            (truth[time], bitbrain[time]) for time in onsets if time in bitbrain
        )
        for timecode in onsets:
            epoch_rows.append({"night": subject, "onset_seconds": timecode, "psg_stage": truth[timecode],
                               **{name: stages[timecode // 30] for name, stages in predictions.items()},
                               "Bitbrain saved label": bitbrain.get(timecode, "")})
        night_reports.append(night)
        print(f"{subject}: {len(onsets)} matched epochs · {night['seconds']:.1f} s", flush=True)

    summaries = {name: metrics(*zip(*pairs)) for name, pairs in all_episodes.items()}
    report = {
        "model_source": metadata,
        "recordings": len(recordings),
        "stage_order": STAGES,
        "wall_seconds": time.perf_counter() - started,
        "models": summaries,
        "per_night": night_reports,
    }
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / f"pretrained_{model}.json").write_text(json.dumps(report, indent=2) + "\n")
    with (RESULTS / f"pretrained_{model}_epochs.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(epoch_rows[0]))
        writer.writeheader()
        writer.writerows(epoch_rows)
    for name, result in summaries.items():
        n3 = result["n3"]
        print(f"{name}: {result['epochs']} epochs · accuracy {result['accuracy']:.3f} · macro-F1 {result['macro_f1']:.3f}"
              f" · N3 precision {n3['precision'] if n3['precision'] is not None else 'undefined'}"
              f" · N3 recall {n3['recall']:.3f} (TP {n3['tp']}, FP {n3['fp']}, FN {n3['fn']})", flush=True)
    print(f"Total evaluation: {report['wall_seconds']:.1f} s", flush=True)


if __name__ == "__main__":
    predictor, source = yasa_predictor()
    run(predictor, source, "yasa")
