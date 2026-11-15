"""Fetch the source and required public weights from one upstream revision."""
import hashlib
import json
import shutil
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

REVISION = "a744749b5dbb9d8ae94ff84ebfac43b3baa44291"
REPO = "https://github.com/dreamento/dreamento"
SCORER = "DreamentoScorer/"
ROOT = Path(__file__).parent / "models" / "dreamento"
REQUIRED = {
    "DreamentoScorer.py", "PooledData_Full_20percent_valid.sav",
    "StandardScaler_PooledDataset_Full_20percent_valid.sav",
    "Selected_Features_BoturaAfterTD=3_Bidirectional_Donders2022_19-04-2023.pickle",
}


def main():
    api = f"https://api.github.com/repos/dreamento/dreamento/git/trees/{REVISION}?recursive=1"
    with urlopen(api, timeout=30) as reply:
        entries = {item["path"]: item["size"] for item in json.load(reply)["tree"] if item["type"] == "blob"}
    paths = sorted({SCORER + name for name in REQUIRED} | {"LICENSE.md"} | {
        name for name in entries if name.startswith(SCORER + "entropy/") and name.endswith(".py")
    })
    files = {}
    for path in paths:
        size = entries[path]
        if size > 120_000_000:
            raise ValueError(f"Unexpected artifact size {size} for {path}")
        name = path.removeprefix(SCORER)
        target = ROOT / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.is_file() or target.stat().st_size != size:
            url = f"https://raw.githubusercontent.com/dreamento/dreamento/{REVISION}/" + quote(path)
            tmp = target.with_suffix(target.suffix + ".part")
            with urlopen(url, timeout=60) as reply, tmp.open("wb") as destination:
                shutil.copyfileobj(reply, destination, length=1024 * 1024)
            if tmp.stat().st_size != size:
                raise ValueError(f"Wrong byte count for {path}")
            tmp.replace(target)
        with target.open("rb") as source:
            files[name] = {"bytes": size, "sha256": hashlib.file_digest(source, "sha256").hexdigest()}
        print(f"{name}: {size:,} bytes", flush=True)
    (ROOT / "source.json").write_text(json.dumps({"repository": REPO, "revision": REVISION, "files": files}, indent=2) + "\n")


if __name__ == "__main__":
    main()
