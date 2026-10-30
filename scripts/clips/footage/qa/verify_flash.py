"""Test helper (not a deliverable): counts general flashes in a video, WCAG 2.3.1 style.

Relative luminance per frame (sRGB-linearised luma, frame mean and the brightest quarter of the
frame, which is closer to the "25 % of the field of view" rule); a flash is a pair of opposing
changes of at least 0.1 where the darker state is below 0.8. Reports the most flashes found in any
1-second window, and where they are.

    python3 -I verify_flash.py video.mp4 [fps]
"""
import subprocess
import sys

import numpy as np

path = sys.argv[1]
fps = float(sys.argv[2]) if len(sys.argv) > 2 else 30.0
w, h = 54, 96
p = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"scale={w}:{h}:in_range=tv:out_range=pc,format=gray", "-f", "rawvideo", "-"], capture_output=True, check=True)
y = np.frombuffer(p.stdout, np.uint8).reshape(-1, h, w).astype(np.float64) / 255.0
lin = np.where(y <= 0.04045, y / 12.92, ((y + 0.055) / 1.055) ** 2.4)


def flashes(series):
    """Frames where a flash completes: a rise >= 0.1 then a fall >= 0.1 back (or the reverse)."""
    events = []
    ext = [(0, series[0])]          # alternating local extremes
    for i in range(1, len(series)):
        v = series[i]
        if len(ext) >= 2 and (ext[-1][1] - ext[-2][1]) * (v - ext[-1][1]) > 0:
            ext[-1] = (i, v)        # same direction: extend
        elif v != ext[-1][1]:
            ext.append((i, v))
    for a, b, c in zip(ext, ext[1:], ext[2:]):
        up, down = b[1] - a[1], b[1] - c[1]
        if abs(up) >= 0.1 and abs(down) >= 0.1 and np.sign(up) == np.sign(down) and min(a[1], b[1], c[1]) < 0.8:
            events.append(c[0])
    return events


for name, series in [("frame mean", lin.mean(axis=(1, 2))),
                     ("brightest quarter", np.array([np.sort(f.ravel())[-(w * h) // 4:].mean() for f in lin]))]:
    ev = flashes(series)
    win = int(round(fps))
    worst = max((sum(1 for e in ev if s <= e < s + win), s) for s in range(0, len(series))) if ev else (0, 0)
    print(f"{name}: {len(ev)} flashes at frames {ev}; most in any 1 s window: {worst[0]} (from frame {worst[1]})")
