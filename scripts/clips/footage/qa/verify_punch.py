"""Test helper (not a deliverable): measures the punch-in actually applied to the footage.

The placeholder's colour bars are vertical, so a horizontal profile of the band below the safe
area (median over its rows, which ignores the speed lines drawn over it) is enough: for each chosen
output frame it fits the zoom s and the horizontal shake dx about x = 540 with
out(X) = in(540 + (X - 540 - dx) / s).

    python3 -I verify_punch.py input.mp4 output.mp4 136 137 138 ...
"""
import subprocess
import sys

import numpy as np

W, H = 1080, 1920
Y0, BH = 1640, 260


def profile(path, n):
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"select='eq(n,{n})',crop={W}:{BH}:0:{Y0},format=gray", "-fps_mode", "vfr", "-frames:v", "1", "-f", "rawvideo", "-"],
                       capture_output=True, check=True)
    band = np.frombuffer(p.stdout, np.uint8).reshape(BH, W).astype(np.float64)
    return np.median(band, axis=0)


src, out = sys.argv[1], sys.argv[2]
X = np.arange(W, dtype=np.float64)
for n in map(int, sys.argv[3:]):
    a, b = profile(src, n), profile(out, n)
    best = None
    for s in np.arange(1.0, 1.08001, 0.001):
        for dx in np.arange(-6, 6.01, 0.25):
            u = 540 + (X - 540 - dx) / s
            w = np.interp(u, X, a)
            e = float(np.mean(np.abs(w[40:-40] - b[40:-40])))
            if best is None or e < best[0]:
                best = (e, s, dx)
    print(f"frame {n}: zoom {best[1]:.3f}  shake x {best[2]:+.2f} px  (mean error {best[0]:.2f})")
