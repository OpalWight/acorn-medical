"""Time a small, participant-held-out sleep staging run from raw forehead EEG."""
import csv
import json
import time
from pathlib import Path
from statistics import median

import numpy as np
import pyedflib
import torch
from scipy import signal
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from torch import nn

ROOT = Path(__file__).parent
DATA = ROOT / "data"
RESULTS = ROOT / "results"
CLASSES = ["Wake", "N1", "N2", "N3", "REM"]
BATCH = 16
HISTORY = 21
STRIDE = 10
PASSES = 5
SAMPLE_HZ = 100
SAMPLES = 30 * SAMPLE_HZ
SEED = 20261115
BANDPASS = signal.firwin(1025, [0.5, 35], fs=256, pass_zero=False).astype("float32")
RESAMPLE = (25 * signal.firwin(1281, 1 / 64)).astype("float32")


def causal_eeg(recording):
    left, right = recording
    derived = np.stack((left - right, (left + right) / 2)).astype("float32")
    filtered = signal.oaconvolve(derived, BANDPASS[None], axes=-1)[..., :derived.shape[-1]]
    return signal.upfirdn(RESAMPLE, filtered, up=25, down=64, axis=-1)


def prepare(row):
    sub = row["subject"]
    stem = DATA / sub / "eeg" / f"{sub}_task-Sleep_acq-"
    band = Path(f"{stem}headband_eeg.edf")
    with band.open("rb") as raw:
        band_header = raw.read(256)
    psg_header = Path(f"{stem}psg_header.bin").read_bytes()
    if band_header[168:184] != psg_header[168:184]:
        raise ValueError(f"Headband and PSG EDF clocks disagree for {sub}")
    with pyedflib.EdfReader(str(band)) as edf:
        indices = [edf.getSignalLabels().index(label) for label in ("HB_1", "HB_2")]
        if any(edf.getSampleFrequency(index) != 256 for index in indices):
            raise ValueError(f"Unexpected EEG sample rate for {sub}")
        raw = np.stack([edf.readSignal(index).astype("float32") for index in indices])
    filtered = causal_eeg(raw)
    n = raw.shape[-1] // (30 * 256)
    x = filtered[..., :n * SAMPLES].reshape(2, n, SAMPLES).transpose(1, 0, 2).copy()
    y = np.full(n, -1, dtype=np.int64)
    with Path(f"{stem}psg_events.tsv").open() as labels:
        for event in csv.DictReader(labels, delimiter="\t"):
            onset = float(event["onset"])
            stage = int(float(event["stage_hum"]))
            if onset >= 0 and onset % 30 == 0 and onset / 30 < n and 0 <= stage < 5:
                y[int(onset / 30)] = stage
    valid = np.isfinite(x).all(axis=(1, 2)) & (np.ptp(x, axis=-1).min(axis=-1) > 0.1)
    y[~valid] = -1
    print(f"Prepared {sub}, {int((y >= 0).sum())} valid EEG epochs", flush=True)
    return x, y


def segments(y):
    indices = np.flatnonzero(y >= 0)
    return [part for part in np.split(indices, np.flatnonzero(np.diff(indices) != 1) + 1) if len(part)]


class Stager(nn.Module):
    def __init__(self):
        super().__init__()
        layers = []
        for i, (before, after) in enumerate(zip((2, 32, 48, 96), (32, 48, 96, 128))):
            kernel = 65 if i == 0 else 9
            layers += [
                nn.Conv1d(before, after, kernel, stride=8 if i == 0 else 1, padding=kernel // 2),
                nn.BatchNorm1d(after),
                nn.GELU(),
                nn.MaxPool1d(2),
                nn.Dropout(0.3),
            ]
        self.cnn = nn.Sequential(*layers)
        self.projection = nn.Linear(256, 128)
        self.lstm = nn.LSTM(128, 128, num_layers=2, batch_first=True)
        self.head = nn.Linear(128, 5)

    def encode(self, x):
        x = self.cnn(x)
        return self.projection(torch.cat((x.mean(dim=-1), x.amax(dim=-1)), dim=-1))

    def temporal(self, encoded):
        output, _ = self.lstm(encoded)
        return self.head(output)

    def forward(self, x):
        batch, length, channels, samples = x.shape
        return self.temporal(self.encode(x.reshape(-1, channels, samples)).reshape(batch, length, -1))


def make_optimizer(model):
    return torch.optim.AdamW(model.parameters(), lr=0.002, weight_decay=0.0001)


def synchronize(device):
    if device == "mps":
        torch.mps.synchronize()


def training_batch(model, optimizer, x, y, weights):
    optimizer.zero_grad(set_to_none=True)
    logits = model(x)
    loss = nn.functional.cross_entropy(logits.reshape(-1, 5), y.reshape(-1), weight=weights)
    loss.backward()
    nn.utils.clip_grad_norm_(model.parameters(), 5)
    optimizer.step()
    return loss


def throughput(device):
    model = Stager().to(device)
    optimizer = make_optimizer(model)
    x = torch.randn(BATCH, HISTORY, 2, SAMPLES, device=device)
    y = torch.randint(5, (BATCH, HISTORY), device=device)
    timings = []
    for index in range(12):
        start = time.perf_counter()
        training_batch(model, optimizer, x, y, None)
        synchronize(device)
        if index >= 3:
            timings.append(time.perf_counter() - start)
    value = median(timings)
    print(f"{device.upper()} synthetic training batch {value * 1000:.0f} ms median (batch {BATCH})", flush=True)
    return value


@torch.inference_mode()
def evaluate(model, nights, device):
    model.eval()
    expected, predicted = [], []
    for x, y in nights:
        for part in segments(y):
            encoded = torch.cat([
                model.encode(torch.from_numpy(x[indices]).to(device))
                for indices in np.array_split(part, (len(part) + 127) // 128)
            ])
            prefix = encoded[:HISTORY - 1]
            outputs = [model.temporal(prefix.unsqueeze(0))[0]]
            if len(encoded) >= HISTORY:
                windows = encoded.unfold(0, HISTORY, 1).transpose(1, 2).contiguous()
                for block in windows.split(128):
                    outputs.append(model.temporal(block)[:, -1])
            predicted.extend(torch.cat(outputs).argmax(dim=-1).cpu().tolist())
            expected.extend(y[part].tolist())
    return expected, predicted


def main():
    started = time.perf_counter()
    torch.set_num_threads(4)
    torch.manual_seed(SEED)
    rng = np.random.default_rng(SEED)
    manifest = json.loads((DATA / "manifest.json").read_text())
    rows = manifest["recordings"]
    assert len({row["pid"] for row in rows}) == len(rows) == 10
    prepare_start = time.perf_counter()

    # A prefix of the recording must produce the same already-available filter output.
    probe = rng.normal(size=(2, 6000)).astype("float32")
    prefix = causal_eeg(probe[:, :4000])
    first_available = (3999 * 25) // 64 + 1
    np.testing.assert_allclose(prefix[:, :first_available], causal_eeg(probe)[:, :first_available], atol=2e-6)
    nights = [prepare(row) for row in rows]
    train, validation, test = nights[:6], nights[6:8], nights[8:]
    normalization_sample = np.concatenate([x[(y >= 0)][::20, :, ::10] for x, y in train])
    quartiles = np.quantile(normalization_sample, [0.25, 0.5, 0.75], axis=(0, 2)).astype("float32")
    for x, _ in nights:
        x -= quartiles[1, :, None]
        x /= np.maximum(quartiles[2] - quartiles[0], 1e-3)[:, None]
        np.clip(x, -20, 20, out=x)
    prep_seconds = time.perf_counter() - prepare_start
    print(f"Preprocessing complete in {prep_seconds:.1f}s", flush=True)

    timings = {"cpu": throughput("cpu")}
    if torch.backends.mps.is_available():
        try:
            timings["mps"] = throughput("mps")
        except (RuntimeError, NotImplementedError) as error:
            print(f"MPS benchmark unavailable, using CPU. {str(error).splitlines()[0]}", flush=True)
    device = min(timings, key=timings.get)
    torch.manual_seed(SEED)
    model = Stager().to(device)
    optimizer = make_optimizer(model)
    train_counts = np.bincount(np.concatenate([y[y >= 0] for _, y in train]), minlength=5)
    weight = (1 / np.sqrt(np.maximum(train_counts, 1))).astype("float32")
    weights = torch.from_numpy(weight / weight.mean()).to(device)

    windows = []
    for night_index, (_, y) in enumerate(train):
        for part in segments(y):
            for offset in range(0, len(part) - HISTORY + 1, STRIDE):
                windows.append((night_index, int(part[offset])))

    batches = (len(windows) + BATCH - 1) // BATCH
    print(f"Training from scratch on {device.upper()}, {batches} batches per epoch, {PASSES} epochs", flush=True)
    records = []
    best_score = -1
    training_start = time.perf_counter()
    for index in range(PASSES):
        epoch_start = time.perf_counter()
        model.train()
        order = rng.permutation(len(windows))
        losses = []
        for chunk in np.array_split(order, batches):
            chosen = [windows[i] for i in chunk]
            x = np.stack([train[night][0][start:start + HISTORY] for night, start in chosen])
            y = np.stack([train[night][1][start:start + HISTORY] for night, start in chosen])
            loss = training_batch(model, optimizer, torch.from_numpy(x).to(device), torch.from_numpy(y).to(device), weights)
            losses.append(float(loss.detach().cpu()))
        fit_seconds = time.perf_counter() - epoch_start
        labels, predictions = evaluate(model, validation, device)
        score = f1_score(labels, predictions, labels=list(range(5)), average="macro", zero_division=0)
        if score > best_score:
            best_score = score
            best_epoch = index + 1
            best_weights = {key: tensor.detach().cpu().clone() for key, tensor in model.state_dict().items()}
        record = {
            "epoch": index + 1, "loss": float(np.mean(losses)), "validation_macro_f1": score,
            "fit_seconds": fit_seconds, "elapsed_seconds": time.perf_counter() - epoch_start,
        }
        records.append(record)
        print(f"Epoch {index + 1}/{PASSES}, training {fit_seconds:.1f}s, with validation {record['elapsed_seconds']:.1f}s, validation macro-F1 {score:.3f}", flush=True)
    train_seconds = time.perf_counter() - training_start
    model.load_state_dict(best_weights)
    test_start = time.perf_counter()
    truth, preds = evaluate(model, test, device)
    test_seconds = time.perf_counter() - test_start
    result = {
        "data_bytes": manifest["bytes"], "download_wall_seconds": manifest["wall_seconds"],
        "preprocessing_seconds": prep_seconds, "synthetic_median_seconds_per_batch": timings,
        "training_device": device, "batches_per_epoch": batches,
        "training_and_validation_seconds": train_seconds, "test_seconds": test_seconds,
        "pilot_wall_seconds": time.perf_counter() - started,
        "best_epoch": best_epoch, "test_count": len(truth),
        "test_accuracy": accuracy_score(truth, preds),
        "test_macro_f1": f1_score(truth, preds, labels=list(range(5)), average="macro", zero_division=0),
        "test_stage_report": classification_report(truth, preds, labels=list(range(5)), target_names=CLASSES, output_dict=True, zero_division=0),
        "test_confusion": confusion_matrix(truth, preds, labels=list(range(5))).tolist(),
        "split": {name: [row["subject"] for row in subset]
                  for name, subset in zip(("train", "validation", "test"), (rows[:6], rows[6:8], rows[8:]))},
        "train_stage_counts": dict(zip(CLASSES, train_counts.tolist())),
        "majority_stage_test_accuracy": float(np.mean(np.asarray(truth) == np.argmax(train_counts))),
        "epochs": records,
        "torch_version": torch.__version__,
        "torch_cpu_threads": torch.get_num_threads(),
        "parameters": sum(parameter.numel() for parameter in model.parameters()),
    }
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / "pilot.json").write_text(json.dumps(result, indent=2) + "\n")
    torch.save({"model": best_weights, "quartiles": torch.from_numpy(quartiles), "classes": CLASSES}, RESULTS / "stager.pt")
    print(f"Done. Test accuracy {result['test_accuracy']:.3f}, macro-F1 {result['test_macro_f1']:.3f}, total {result['pilot_wall_seconds']:.1f}s", flush=True)


if __name__ == "__main__":
    main()
