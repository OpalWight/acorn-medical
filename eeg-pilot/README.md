# BOAS forehead EEG pilot

This local benchmark trains a causal five-stage CNN-LSTM from scratch on a deterministic ten-person subset of BOAS. The downloader saves the public OpenNeuro object URLs, sizes, and checksums in `data/manifest.json`. It retrieves the wearable recordings and expert reference-event TSVs, plus the fixed PSG headers to verify shared recording starts.

```sh
uv venv --python 3.12
uv pip install -r requirements.lock
.venv/bin/python -u download.py
.venv/bin/python -u pilot.py
```

The run uses six people for training, two for validation and checkpoint selection, and two for the held-out test. It checks that the EEG filter's output is invariant to later samples, groups consecutive valid epochs, and normalizes using training participants' EEG. The model is paper-shaped, with a four-block 1D CNN and a two-layer causal LSTM over up to 21 EEG epochs. This timing pilot uses five training passes, a single participant split, and losses at each position of the training windows. It measures current-stage classification. For the published nested evaluation and forecasting criteria, see [Kang and Wang, 2026](https://www.mdpi.com/1424-8220/26/22/7144).

Outputs are `results/pilot.json` (timings, metrics, labels, and splits) and `results/stager.pt` (checkpoint with training normalization). Data and model artifacts stay local, separate from the Wardround site.

## Inference-only checks

```sh
.venv/bin/python -u score_published.py
.venv/bin/python -u replay_pilot.py
```

The first command compares BOAS's published headband `stage_ai` labels to consensus PSG `stage_hum` labels at matching onsets, using stage codes 0–4. Its output is `results/published_boas_score.json`. These are the dataset authors' saved predictions from their own model.

The second command loads the accelerated pilot checkpoint under `results/accelerated/`, evaluates its two held-out nights, and compares the confusion matrix to the first run. It writes `results/accelerated/replay.json`. Both checks use frozen predictions or weights.

## Public pretrained staging benchmark

The benchmark uses the same ten downloaded BOAS nights, compares 30-second predictions with matching human-consensus PSG onsets, and uses the frozen classifiers' default decisions. It excludes non-stage PSG labels. The results include an additional common-epoch comparison with the saved Bitbrain labels so abstentions do not obscure denominators.

- YASA uses its packaged EEG-only LightGBM weights, run independently on HB_1 and HB_2. The RawArray adapter converts EDF microvolts to volts and passes the forehead signals to the upstream preprocessing without extra filtering.
- DreamentoScorer uses its published ZMax forehead model, standardization and feature selection. The adapter uses HB_1 on the left and HB_2 on the right. It follows the published offline pipeline, including its default correction for REM before the first N2 epoch.

```sh
uv venv --python 3.12 .venv-pretrained
uv pip install --python .venv-pretrained/bin/python -r requirements-pretrained.lock
.venv-pretrained/bin/python -u pretrained_benchmark.py

uv venv --python 3.12 .venv-dreamento
uv pip install --python .venv-dreamento/bin/python -r requirements-dreamento.lock
.venv-dreamento/bin/python -u fetch_dreamento.py
.venv-dreamento/bin/python -u dreamento_benchmark.py
```

Full-night models can use future signal around the scored epoch. The JSON reports under `results/pretrained_*.json` include provenance, per-night metrics, and pooled confusion matrices. The accompanying epoch CSVs allow independent recounts against the reference labels. On macOS, LightGBM uses OpenMP. The installed environments preserve the earlier training environment.
