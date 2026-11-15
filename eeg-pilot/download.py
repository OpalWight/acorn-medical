"""Download a small BOAS subset from OpenNeuro's public bucket."""
import csv
import hashlib
import io
import json
import random
import shutil
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "data"
BUCKET = "https://s3.amazonaws.com/openneuro.org"
PREFIX = "ds005555/"
NIGHTS = 10


def get_bytes(url, **headers):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=40) as response:
        return response.read()


def objects():
    query = {"list-type": "2", "prefix": PREFIX}
    files = {}
    while True:
        payload = get_bytes(BUCKET + "?" + urllib.parse.urlencode(query))
        tree = ET.fromstring(payload)
        for item in tree.findall("{*}Contents"):
            name = item.findtext("{*}Key").removeprefix(PREFIX)
            files[name] = (int(item.findtext("{*}Size")), item.findtext("{*}ETag"))
        token = tree.findtext("{*}NextContinuationToken")
        if token is None:
            return files
        query["continuation-token"] = token


def fetch(path, size):
    target = DATA / path
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists() or target.stat().st_size != size:
        partial = target.with_suffix(target.suffix + ".part")
        for attempt in range(3):
            try:
                with urllib.request.urlopen(f"{BUCKET}/{PREFIX}{path}", timeout=60) as source, partial.open("wb") as destination:
                    shutil.copyfileobj(source, destination, length=1024 * 1024)
                if partial.stat().st_size != size:
                    raise IOError(f"Unexpected byte count for {path}")
                partial.replace(target)
                break
            except (OSError, TimeoutError):
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
    with target.open("rb") as recording:
        return hashlib.file_digest(recording, "sha256").hexdigest()


def main():
    started = time.perf_counter()
    DATA.mkdir(exist_ok=True)
    index = objects()
    participants = "participants.tsv"
    participants_hash = fetch(participants, index[participants][0])
    people = {}
    for row in csv.DictReader(io.StringIO((DATA / participants).read_text()), delimiter="\t"):
        people.setdefault(row["pid"], row["participant_id"])
    rng = random.Random(20261115)
    selected = rng.sample(sorted(people), NIGHTS)

    def recording(pid):
        sub = people[pid]
        stem = f"{sub}/eeg/{sub}_task-Sleep_acq-"
        files = [stem + suffix for suffix in (
            "headband_eeg.edf", "headband_channels.tsv", "headband_eeg.json", "psg_events.tsv",
        )]
        checksums = {}
        for path in files:
            checksums[path] = fetch(path, index[path][0])
        psg_path = stem + "psg_eeg.edf"
        header = get_bytes(f"{BUCKET}/{PREFIX}{psg_path}", Range="bytes=0-255")
        if len(header) != 256:
            raise ValueError(f"Expected a 256-byte PSG header for {sub}")
        (DATA / (stem + "psg_header.bin")).write_bytes(header)
        size = sum(index[path][0] for path in files) + len(header)
        print(f"Downloaded {sub} (participant {pid}), {size / 1e6:.1f} MB", flush=True)
        return {"subject": sub, "pid": pid, "bytes": size, "files": [
            {"path": path, "bytes": index[path][0], "etag": index[path][1], "sha256": checksums[path]}
            for path in files
        ], "psg_header_sha256": hashlib.sha256(header).hexdigest()}

    print(f"Fetching {NIGHTS} headband nights from {NIGHTS} unique participants", flush=True)
    with ThreadPoolExecutor(max_workers=4) as workers:
        rows = list(workers.map(recording, selected))
    manifest = {
        "dataset": BUCKET + "/" + PREFIX,
        "participants_sha256": participants_hash,
        "recordings": rows,
        "bytes": sum(row["bytes"] for row in rows) + index[participants][0],
        "wall_seconds": time.perf_counter() - started,
    }
    (DATA / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Download complete in {manifest['wall_seconds']:.1f} s, {manifest['bytes'] / 1e9:.2f} GB", flush=True)


if __name__ == "__main__":
    main()
