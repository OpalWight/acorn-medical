"""Run the frozen ZMax DreamentoScorer pipeline on the local BOAS nights."""
import json
import pickle
import sys
import time
from pathlib import Path

import joblib
import numpy as np

from pretrained_benchmark import STAGES, file_sha256, run

UPSTREAM = Path(__file__).parent / "models" / "dreamento"
MODEL = "PooledData_Full_20percent_valid.sav"
SCALER = "StandardScaler_PooledDataset_Full_20percent_valid.sav"
SELECTED = "Selected_Features_BoturaAfterTD=3_Bidirectional_Donders2022_19-04-2023.pickle"


def dreamento_predictor():
    source = json.loads((UPSTREAM / "source.json").read_text())
    for name, item in source["files"].items():
        if file_sha256(UPSTREAM / name) != item["sha256"]:
            raise ValueError(f"Dreamento artifact checksum mismatch: {name}")
    sys.path[:0] = [str(UPSTREAM), str(UPSTREAM / "entropy")]
    from DreamentoScorer import DreamentoScorer

    scorer = DreamentoScorer(filename="", channel="", fs=256, T=30)
    scaler = joblib.load(UPSTREAM / SCALER)
    with (UPSTREAM / SELECTED).open("rb") as handle:
        selected_features = pickle.load(handle)
    model = joblib.load(UPSTREAM / MODEL)
    print(f"Loaded frozen DreamentoScorer from {source['revision'][:12]}", flush=True)

    def predict(signals):
        started = time.perf_counter()
        features = []
        for channel in signals:
            filtered = scorer.butter_bandpass_filter(channel, lowcut=0.3, highcut=30, fs=256, order=2)
            features.append(scorer.FeatureExtraction_per_subject(filtered.reshape(-1, 30 * 256).T, fs=256))
        combined = np.column_stack(features)
        combined = scorer.replace_NaN_with_mean(combined)
        combined = scorer.replace_inf_with_mean(combined)
        scaled = scaler.transform(combined)
        context = scorer.add_time_dependence_bidirectional(scaled, n_time_dependence=3, padding_type="sequential")
        probabilities = model._Booster.predict(context[:, selected_features], num_threads=4)
        assert probabilities.shape == (signals.shape[-1] // (30 * 256), 5)
        codes = np.asarray(model.classes_, dtype=int)[probabilities.argmax(axis=1)]
        # Apply the same early-REM correction as upstream's default offline scorer.
        first_n2 = np.flatnonzero(codes == 2)
        if first_n2.size:
            before_n2 = np.arange(len(codes)) < first_n2[0]
            codes[before_n2 & (codes == 4)] = 1
        print(f"Dreamento extracted and scored {len(codes)} epochs in {time.perf_counter() - started:.1f}s", flush=True)
        return {"Dreamento HB_1 + HB_2": np.asarray(STAGES)[codes]}

    return predict, {**source, "weight": MODEL, "scaler": SCALER, "selected_features": SELECTED}


if __name__ == "__main__":
    scorer, provenance = dreamento_predictor()
    run(scorer, provenance, "dreamento")
