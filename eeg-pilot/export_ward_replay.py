"""Replay selected BOAS HB_1 excerpts with the existing YASA weights."""
import json
from pathlib import Path

import mne
import numpy as np
import yasa

from pretrained_benchmark import DATA, RESULTS, read_headband, read_stages

# The first epoch in each excerpt ends at the fictional 5:50 AM shift start.
WINDOWS = {"th": ("sub-14", 176), "mr": ("sub-29", 114), "np": ("sub-94", 170),
           "er": ("sub-6", 130), "jw": ("sub-39", 302)}
OUTPUT = DATA.parent.parent / "wardround" / "lib" / "eeg-replay.ts"


def main():
    weights = Path(yasa.__file__).parent / "classifiers" / "clf_eeg_lgb_0.5.0.joblib"
    mne.set_log_level("ERROR")
    recordings = json.loads((DATA / "manifest.json").read_text())["recordings"]
    scores, truth = [], []
    excerpts = {}
    for row in recordings:
        subject = row["subject"]
        stem = DATA / subject / "eeg" / f"{subject}_task-Sleep_acq-"
        info = mne.create_info(["HB_1"], 256, ["eeg"])
        raw = mne.io.RawArray(read_headband(stem)[0:1], info, verbose="ERROR")
        probabilities = yasa.SleepStaging(raw, eeg_name="HB_1").predict(path_to_model=str(weights)).proba
        n3 = np.rint(probabilities["N3"].to_numpy() * 1000).astype(int)
        for second, stage in read_stages(Path(f"{stem}psg_events.tsv"), "stage_hum").items():
            if second // 30 < len(n3):
                scores.append(n3[second // 30])
                truth.append(stage == "N3")
        for patient, (recording, start) in WINDOWS.items():
            if recording == subject:
                best_other = probabilities.drop(columns="N3").idxmax(axis=1).map({"WAKE": 0, "N1": 1, "N2": 1, "REM": 2})
                samples = np.column_stack([n3, best_other])[start:start + 321:2]
                assert samples.shape == (161, 2) and np.isfinite(samples).all()
                excerpts[patient] = samples.tolist()
    assert set(excerpts) == set(WINDOWS)
    flag = np.asarray(scores) >= 250
    reference = np.asarray(truth)
    assert len(reference) == 9740 and reference.sum() == 404
    print(f"25% cutoff: TP {sum(reference & flag)}, FP {sum(~reference & flag)}, FN {sum(reference & ~flag)}")

    lines = [
        "// YASA 0.8.1 EEG-only classifier (clf_eeg_lgb_0.5.0.joblib) on BOAS ds005555 HB_1.",
        "// https://openneuro.org/datasets/ds005555 · Five excerpts aligned to the fictional shift.",
        "// Each minute stores the last complete 30-second epoch: N3 score × 1,000 and best other stage.",
        "type Epoch = readonly [number, 0 | 1 | 2];",
        "const EPOCHS: Record<string, readonly Epoch[]> = {",
    ]
    for patient in WINDOWS:
        samples = excerpts[patient]
        lines.append(f"  {patient}: [")
        for offset in range(0, len(samples), 10):
            lines.append("    " + ", ".join(f"[{score}, {other}]" for score, other in samples[offset:offset + 10]) + ",")
        lines.append("  ],")
    lines += [
        "};", "", 'const OTHER_STAGE = ["Awake", "Light sleep", "REM sleep"] as const;', "",
        "export function replayReading(patientId: string, minute: number) {",
        "  const [score, other] = EPOCHS[patientId][minute];",
        "  return { deepSleepScore: score / 10, otherStage: OTHER_STAGE[other] };",
        "}", "",
    ]
    OUTPUT.write_text("\n".join(lines))


if __name__ == "__main__":
    main()
