# scripts/build-kbar-archive.py — aggregate pre-fetched 1-minute kbar CSVs into
# compact 60m / 1D JSON bundled with the app. Used as deep history for the long
# timeframes whose lookback exceeds the live kbars API's 30-day single-query
# limit (see src/lib/chart-data.ts).
#
# Source CSV schema: ts_ns,datetime_taipei,code,open,high,low,close,volume,amount
# We key on datetime_taipei (Taiwan wall-clock) encoded as UTC seconds so the
# bundled bars line up exactly with the app's wallClockToUtc()/aggregate() —
# letting live bars splice onto the archive seam without a jump.
#
# Run: uv run --no-project python3 scripts/build-kbar-archive.py
#      uv run --no-project python3 scripts/build-kbar-archive.py --symbols TMFR1,MXFR1

import argparse
import csv
import glob
import json
import os
from datetime import datetime, timezone

DEFAULT_SRC = "/Users/wico/GitHub/zeabur-py-silent-helm-v5/_dev"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT = os.path.join(ROOT, "src", "assets", "history")

# timeframes the app needs deep history for: (minutes, file key)
TIMEFRAMES = [(60, "60m"), (1440, "1d")]


def wallclock_to_epoch(s: str) -> int:
    # "2024-07-31 15:01:00" as a Taiwan wall clock encoded as UTC seconds —
    # mirrors the app's wallClockToUtc(): Date.UTC(y, mo-1, d, h, mi, s) / 1000
    dt = datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def num(x: str):
    f = float(x)
    return int(f) if f.is_integer() else round(f, 4)


def load_symbol_minutes(src: str, sym: str):
    # gather 1-min bars from the daily and monthly archives, deduped by
    # timestamp -> {ts: (open, high, low, close, volume)}
    patterns = [
        os.path.join(src, "history-kbar", f"kbars_*_{sym}.csv"),       # daily
        os.path.join(src, "history-kbar-long", f"kbars_{sym}_*.csv"),  # monthly
    ]
    files = []
    for p in patterns:
        files.extend(sorted(glob.glob(p)))
    bars = {}
    for fn in files:
        with open(fn, newline="") as fh:
            for row in csv.DictReader(fh):
                try:
                    t = wallclock_to_epoch(row["datetime_taipei"])
                    bars[t] = (
                        num(row["open"]),
                        num(row["high"]),
                        num(row["low"]),
                        num(row["close"]),
                        int(float(row["volume"])),
                    )
                except (KeyError, ValueError):
                    continue
    return bars, files


def aggregate(minute_bars: dict, sec: int):
    # bucket = floor(t / sec) * sec; OHLC merge — matches utils/kbars.ts
    out = {}
    for t in sorted(minute_bars):
        o, h, l, c, v = minute_bars[t]
        b = (t // sec) * sec
        cur = out.get(b)
        if cur is None:
            out[b] = [b, o, h, l, c, v]
        else:
            cur[2] = max(cur[2], h)  # high
            cur[3] = min(cur[3], l)  # low
            cur[4] = c               # close (last)
            cur[5] += v              # volume (sum)
    return [out[b] for b in sorted(out)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=DEFAULT_SRC, help="path to the _dev archive dir")
    ap.add_argument("--symbols", default="TMFR1", help="comma-separated symbols")
    ap.add_argument("--out", default=DEFAULT_OUT, help="output dir for JSON")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    for sym in [s.strip() for s in args.symbols.split(",") if s.strip()]:
        minute_bars, files = load_symbol_minutes(args.src, sym)
        if not minute_bars:
            print(f"[{sym}] no source bars under {args.src} — skipped")
            continue
        for minutes, key in TIMEFRAMES:
            bars = aggregate(minute_bars, minutes * 60)
            path = os.path.join(args.out, f"{sym}-{key}.json")
            with open(path, "w") as fh:
                json.dump(
                    {"code": sym, "tf": key, "count": len(bars), "bars": bars},
                    fh,
                    separators=(",", ":"),
                )
            print(f"[{sym}] {key}: {len(bars)} bars -> {os.path.relpath(path, ROOT)}")
        print(f"[{sym}] from {len(files)} files, {len(minute_bars)} 1-min bars")


if __name__ == "__main__":
    main()
