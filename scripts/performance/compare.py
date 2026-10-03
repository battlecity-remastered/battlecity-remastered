"""Compare fixed-state captures; save numeric metrics and an amplified diff.

Usage: .venv/bin/python scripts/performance/compare.py baseline.png current.png output
Requires Pillow (provided by this repository's asset venv).
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

baseline, current, destination = sys.argv[1:]
output = Path(destination)
output.mkdir(parents=True, exist_ok=True)
a = Image.open(baseline).convert("RGB")
b = Image.open(current).convert("RGB")
if a.size != b.size:
    raise SystemExit(f"Image dimensions differ: {a.size} vs {b.size}")
difference = ImageChops.difference(a, b)
statistics = ImageStat.Stat(difference)
peaks = [max(pixel) for pixel in difference.getdata()]
count = len(peaks)
report = {
    "baseline": baseline,
    "current": current,
    "dimensions": list(a.size),
    "mean_absolute_channel_error": sum(statistics.mean) / 3,
    "max_channel_error": max(peaks),
    "changed_pixel_fraction": sum(p > 0 for p in peaks) / count,
    "pixel_fraction_above_8": sum(p > 8 for p in peaks) / count,
    "pixel_fraction_above_32": sum(p > 32 for p in peaks) / count,
    "rmse": (sum(value * value for value in statistics.rms) / 3) ** .5,
}
difference.point(lambda value: min(255, value * 8)).save(output / "diff.png")
(output / "comparison.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
# A diagnostic guard, not a claim of perceptual equivalence. Inspect the diff
# and the original images even when this passes; all captures must be reviewed.
if report["pixel_fraction_above_32"] > 0.005 or report["mean_absolute_channel_error"] > 0.5:
    raise SystemExit(1)
