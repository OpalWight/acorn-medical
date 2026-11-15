"""Replay a local, frozen pilot checkpoint on the two held-out recordings."""
import json
import time

import numpy as np
import torch
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score

import pilot


def main():
    torch.set_num_threads(4)
    results = pilot.RESULTS / "accelerated"
    original = json.loads((results / "pilot.json").read_text())
    device = original["training_device"] if torch.backends.mps.is_available() else "cpu"
    checkpoint = torch.load(results / "stager.pt", map_location="cpu", weights_only=True)
    model = pilot.Stager().to(device)
    model.load_state_dict(checkpoint["model"])
    quartiles = checkpoint["quartiles"].numpy()
    manifest = json.loads((pilot.DATA / "manifest.json").read_text())
    test = set(original["split"]["test"])
    started = time.perf_counter()
    data = []
    for row in manifest["recordings"]:
        if row["subject"] in test:
            x, y = pilot.prepare(row)
            x -= quartiles[1, :, None]
            x /= np.maximum(quartiles[2] - quartiles[0], 1e-3)[:, None]
            np.clip(x, -20, 20, out=x)
            data.append((x, y))
    assert len(data) == len(test) == 2
    test_start = time.perf_counter()
    truth, predicted = pilot.evaluate(model, data, device)
    metrics = {
        "device": device,
        "epochs": len(truth),
        "accuracy": accuracy_score(truth, predicted),
        "macro_f1": f1_score(truth, predicted, labels=list(range(5)), average="macro"),
        "confusion": confusion_matrix(truth, predicted, labels=list(range(5))).tolist(),
        "inference_seconds": time.perf_counter() - test_start,
        "preprocess_and_inference_seconds": time.perf_counter() - started,
    }
    metrics["exact_confusion_match"] = metrics["confusion"] == original["test_confusion"]
    (results / "replay.json").write_text(json.dumps(metrics, indent=2) + "\n")
    print(json.dumps(metrics, indent=2), flush=True)


if __name__ == "__main__":
    main()
