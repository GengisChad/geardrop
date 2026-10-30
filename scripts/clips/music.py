#!/usr/bin/env python3
"""
Music for the GEAR//DROP drop reel (owner, 2026-10-29): an original track, synthesised here.

Everything audible comes out of this file: oscillators, noise, filters, reverb and the master
are plain numpy. No downloaded music, loops, samples or sound effects. The output is
deterministic: every random source has a fixed seed, so the same code writes the same file.

    python3 scripts/clips/music.py                 # writes out/clips/drop/geardrop-drop-music.wav
    python3 scripts/clips/music.py --stems DIR     # also writes the pre-master stems to DIR

Needs python3 and numpy only. 48 kHz, stereo, 24-bit PCM, 24.4 s, mastered to -14 LUFS
integrated with true peak at or below -1 dBTP (measured here with BS.1770 K-weighting and 4x
oversampling; check with ffmpeg ebur128).

The timing grid is shared with the video and must not change:
128 BPM, beat 0.46875 s, bar 1.875 s.
  0.000  intro: emblem launch (ratchet + spin whir), filtered Gm pad
  0.9375 wordmark slam: impact + sub drop + chord stab
  1.40625 "BEYBLADE X ORIGINALI" stamp; clap and hat rolls, riser and reverse swell build
  1.875  DROP: launch FX (ratchet rip + rising metallic whir), crash, impact, full groove
  1.875 / 5.625 / 9.375 / 13.125 / 16.875  product segments (2 bars each): impact + sub drop +
         crash on the downbeat, whoosh from 0.25 s before; chip stamp on beat 3, name slam on
         beat 5, callout blip on beat 7; the lead hook plays once per segment (varied in 4 and 5)
  20.625 outro: relaunch FX, impact, last groove bar with the resolving phrase
  22.5   last hit: impact + sub drop + Gm stab, then the tail spins down and is silent by 24.4
Key: G minor (harmonic minor over D). Progression per segment: Gm|Eb, Cm|D, Gm|Eb, Cm|D, Eb|D.
"""
from __future__ import annotations

import argparse
import os
import wave
import zlib

import numpy as np

# ---------------------------------------------------------------- grid ------------------------
SR = 48_000
BPM = 128.0
BEAT = 60.0 / BPM            # 0.46875 s
BAR = 4 * BEAT               # 1.875 s
STEP = BEAT / 4              # a 16th: 0.1171875 s
LENGTH = 24.4                # 732 frames at 30 fps
N = int(round(LENGTH * SR))  # 1 171 200 samples

WORDMARK = 2 * BEAT          # 0.9375
STAMP = 3 * BEAT             # 1.40625
DROP = BAR                   # 1.875
SEGMENTS = [BAR + i * 2 * BAR for i in range(5)]  # 1.875 5.625 9.375 13.125 16.875
OUTRO = BAR + 10 * BAR       # 20.625
LAST_HIT = OUTRO + 4 * BEAT  # 22.5
END = OUTRO + 2 * BAR        # 24.375
WHOOSH_LEAD = 0.25           # a whoosh starts this long before each cut
GAP = STEP / 2               # a 32nd (59 ms) of air before the drop, the CTA hit and the last hit
BUILD_END = DROP - GAP       # the intro build stops here
BUILD = 0.6                  # the build's gain (-4.5 dB)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUT = os.path.join(ROOT, "out", "clips", "drop", "geardrop-drop-music.wav")


def bar_t(bar: int, step: float = 0.0) -> float:
    return bar * BAR + step * STEP


# ---------------------------------------------------------------- basics ----------------------
def rng(name: str) -> np.random.Generator:
    """A fixed generator per name: deterministic, and independent of render order."""
    return np.random.default_rng(zlib.crc32(name.encode()))


def hz(midi: float) -> float:
    return 440.0 * 2.0 ** ((midi - 69.0) / 12.0)


def secs(n: int) -> np.ndarray:
    return np.arange(n) / SR


def ns(t: float) -> int:
    return int(round(t * SR))


def pan_mono(x: np.ndarray, pan: float = 0.0) -> np.ndarray:
    """Mono to stereo, equal power, unity in the centre (pan -1 left ... +1 right)."""
    a = (pan + 1.0) * np.pi / 4.0
    return np.stack([x * np.sqrt(2.0) * np.cos(a), x * np.sqrt(2.0) * np.sin(a)])


def fade_edges(x: np.ndarray, fin: float = 0.001, fout: float = 0.004) -> np.ndarray:
    n = x.shape[-1]
    a, b = max(1, ns(fin)), max(1, ns(fout))
    env = np.ones(n)
    env[: min(a, n)] = np.linspace(0.0, 1.0, min(a, n), endpoint=False)
    env[n - min(b, n):] *= np.linspace(1.0, 0.0, min(b, n))
    return x * env


def normalize(x: np.ndarray, peak: float = 1.0) -> np.ndarray:
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


# ---------------------------------------------------------------- filters ---------------------
# Magnitude responses (Butterworth-like slopes, smooth bells and shelves).
def m_lp(f, fc, order=2):
    return 1.0 / np.sqrt(1.0 + (f / fc) ** (2 * order))


def m_hp(f, fc, order=2):
    return 1.0 / np.sqrt(1.0 + (fc / np.maximum(f, 1e-3)) ** (2 * order))


def m_bell(f, f0, db, bw_oct):
    x = np.log2(np.maximum(f, 1.0) / f0) / bw_oct
    return 10.0 ** (db / 20.0 * np.exp(-0.5 * x * x))


def m_shelf(f, f0, db):
    """High shelf (gain db above f0)."""
    return 10.0 ** (db / 20.0 / (1.0 + (f0 / np.maximum(f, 1.0)) ** 2))


def m_band(f, fc, bw_oct):
    x = np.log2(np.maximum(f, 1.0) / fc) / bw_oct
    return np.exp(-0.5 * x * x)


def _nfft(n: int) -> int:
    return 1 << int(np.ceil(np.log2(max(n, 2))))


def filt(x: np.ndarray, mag, pad: int | None = None) -> np.ndarray:
    """Static filter with the given magnitude response and minimum phase (causal, like analog)."""
    x = np.asarray(x, float)
    n = x.shape[-1]
    nfft = _nfft(n + (pad if pad is not None else max(8192, n // 4)))
    f = np.fft.rfftfreq(nfft, 1.0 / SR)
    logm = np.log(np.maximum(mag(f), 1e-7))
    cep = np.fft.irfft(logm, nfft)
    w = np.zeros(nfft)
    w[0] = 1.0
    w[1: nfft // 2] = 2.0
    w[nfft // 2] = 1.0
    h = np.exp(np.fft.rfft(cep * w))
    return np.fft.irfft(np.fft.rfft(x, nfft, axis=-1) * h, nfft, axis=-1)[..., :n]


def tv_filter(x: np.ndarray, gain, nfft: int = 1024, hop: int = 256) -> np.ndarray:
    """Time-varying filter by STFT: gain(t_frame[:, None], f[None, :]) -> (frames, bins)."""
    x = np.asarray(x, float)
    n = x.shape[-1]
    lead = [(0, 0)] * (x.ndim - 1)
    xp = np.pad(x, lead + [(nfft, nfft)])
    frames = np.lib.stride_tricks.sliding_window_view(xp, nfft, axis=-1)[..., ::hop, :]
    win = np.hanning(nfft + 1)[:-1]
    spec = np.fft.rfft(frames * win, axis=-1)
    nf = spec.shape[-2]
    tc = (np.arange(nf) * hop + nfft / 2 - nfft) / SR
    f = np.fft.rfftfreq(nfft, 1.0 / SR)
    y = np.fft.irfft(spec * gain(tc[:, None], f[None, :]), nfft, axis=-1) * win
    out = np.zeros(xp.shape)
    for i in range(nf):
        out[..., i * hop: i * hop + nfft] += y[..., i, :]
    return out[..., nfft: nfft + n] / (np.sum(win ** 2) / hop)


def fftconv(x: np.ndarray, h: np.ndarray) -> np.ndarray:
    n = x.shape[-1] + h.shape[-1] - 1
    nfft = _nfft(n)
    return np.fft.irfft(np.fft.rfft(x, nfft, axis=-1) * np.fft.rfft(h, nfft, axis=-1), nfft, axis=-1)[..., :n]


# ---------------------------------------------------------------- oscillators -----------------
def wavetable(amps: np.ndarray, size: int = 4096) -> np.ndarray:
    """One cycle with harmonic k at amplitude amps[k-1] (sine phase)."""
    spec = np.zeros(size // 2 + 1, complex)
    k = np.arange(1, len(amps) + 1)
    spec[k] = -0.5j * size * np.asarray(amps)
    return np.fft.irfft(spec, size)


def wt_play(table: np.ndarray, cycles: np.ndarray) -> np.ndarray:
    size = len(table)
    idx = np.mod(cycles, 1.0) * size
    i0 = idx.astype(np.int64)
    fr = idx - i0
    return table[i0 % size] * (1.0 - fr) + table[(i0 + 1) % size] * fr


def saw_amps(f0: float, cutoff: float, maxf: float = 16000.0, order: int = 2) -> np.ndarray:
    k = np.arange(1, max(1, int(maxf // f0)) + 1)
    return (1.0 / k) * m_lp(k * f0, cutoff, order)


def square_amps(f0: float, maxf: float = 16000.0) -> np.ndarray:
    k = np.arange(1, max(1, int(maxf // f0)) + 1)
    return np.where(k % 2 == 1, 1.0 / k, 0.0)


def metal(n: int, scale: float = 1.0, seed: str = "metal") -> np.ndarray:
    """The TR-808 trick: six detuned square waves at inharmonic ratios, the base of hats and crashes."""
    t = secs(n)
    r = rng(seed)
    out = np.zeros(n)
    for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0):
        f *= scale
        tab = wavetable(square_amps(f, 20000.0))
        out += wt_play(tab, f * t + r.random())
    return out / 6.0


def adsr(n: int, dur: float, a: float, d: float, s: float, r: float) -> np.ndarray:
    t = secs(n)
    env = np.where(t < a, t / a, s + (1.0 - s) * np.exp(-(t - a) / d))
    rel = np.clip(1.0 - (t - dur) / r, 0.0, 1.0) ** 2
    return env * np.where(t > dur, rel, 1.0)


# ---------------------------------------------------------------- drums -----------------------
def make_kick() -> np.ndarray:
    n = ns(0.44)
    t = secs(n)
    f = 49.0 + 185.0 * np.exp(-t / 0.030) + 1300.0 * np.exp(-t / 0.0022)   # tuned to G1
    body = np.sin(2 * np.pi * np.cumsum(f) / SR)
    amp = np.where(t < 0.045, 1.0, np.exp(-(t - 0.045) / 0.125))
    body = np.tanh(2.4 * body * amp) / np.tanh(2.4)
    click = filt(rng("kick").standard_normal(n) * np.exp(-t / 0.0016),
                 lambda f: m_hp(f, 1800, 2) * m_lp(f, 9000, 2))
    return fade_edges(0.92 * body + 0.32 * normalize(click), 0.0003, 0.03)


def make_clap() -> np.ndarray:
    n = ns(0.38)
    t = secs(n)
    r = rng("clap")
    env = np.zeros(n)
    for d in (0.0, 0.0085, 0.0175):
        env += (t >= d) * np.exp(-np.maximum(t - d, 0) / 0.0032)
    env += (t >= 0.026) * np.exp(-np.maximum(t - 0.026, 0) / 0.075) * 1.1
    clap = filt(r.standard_normal(n) * env, lambda f: m_hp(f, 950, 2) * m_lp(f, 5000, 2) * m_bell(f, 1500, 3, 0.6))
    sn_f = 175.0 + 60.0 * np.exp(-t / 0.012)
    body = np.sin(2 * np.pi * np.cumsum(sn_f) / SR) * np.exp(-t / 0.045) * (1 - np.exp(-t / 0.001))
    rattle = filt(r.standard_normal(n) * np.exp(-t / 0.12), lambda f: m_hp(f, 2500, 2) * m_lp(f, 11000, 2))
    x = normalize(clap) + 0.45 * body + 0.22 * normalize(rattle)
    return fade_edges(np.tanh(1.3 * normalize(x)), 0.0003, 0.05)


def make_hat(open_: bool, variant: int) -> np.ndarray:
    n = ns(0.30 if open_ else 0.07)
    t = secs(n)
    r = rng(f"hat{open_}{variant}")
    raw = 0.55 * metal(n, 1.0 + 0.01 * variant, f"hm{variant}") + 0.6 * r.standard_normal(n) * 0.35
    env = np.exp(-t / (0.085 if open_ else 0.014)) * (1 - np.exp(-t / 0.0004))
    x = filt(raw * env, lambda f: m_hp(f, 7200, 3) * m_bell(f, 10500, 3, 0.5) * m_lp(f, 16000, 2))
    return fade_edges(normalize(x), 0.0002, 0.01)


def make_crash(dur: float = 2.3, name: str = "crash") -> np.ndarray:
    n = ns(dur)
    t = secs(n)
    r = rng(name)
    out = []
    for ch in range(2):
        raw = 0.7 * r.standard_normal(n) + 1.4 * metal(n, 1.31 + 0.012 * ch, f"{name}m{ch}")
        env = (0.55 * np.exp(-t / 0.05) + 0.45 * np.exp(-t / 0.62)) * (1 - np.exp(-t / 0.0006))
        out.append(filt(raw * env, lambda f: m_hp(f, 3600, 2) * m_lp(f, 14500, 2) * m_bell(f, 6800, 2.5, 0.8)))
    return fade_edges(normalize(np.stack(out)), 0.0002, 0.3)


# ---------------------------------------------------------------- impacts and FX --------------
def make_impact(f0: float = 196.0, name: str = "impact") -> np.ndarray:
    """Metal clang (free bar modes, tuned to G) + crack + mid thump: the slam of a top hitting."""
    n = ns(1.6)
    t = secs(n)
    r = rng(name)
    out = np.zeros((2, n))
    modes = [(1.0, 1.0, 0.45), (2.756, 0.7, 0.30), (5.404, 0.45, 0.20), (8.933, 0.3, 0.12), (13.34, 0.18, 0.08)]
    for ch, det in enumerate((0.997, 1.003)):
        for ratio, amp, dec in modes:
            ph = r.random()
            out[ch] += amp * np.sin(2 * np.pi * (f0 * ratio * det * t + ph)) * np.exp(-t / dec)
    out *= 1 - np.exp(-t / 0.0008)
    crack = filt(r.standard_normal((2, n)) * np.exp(-t / 0.011), lambda f: m_hp(f, 1500, 2) * m_lp(f, 12000, 2))
    thump_f = 62.0 + 70.0 * np.exp(-t / 0.03)
    thump = np.sin(2 * np.pi * np.cumsum(thump_f) / SR) * np.exp(-t / 0.10) * (1 - np.exp(-t / 0.001))
    body = filt(r.standard_normal(n) * np.exp(-t / 0.05), lambda f: m_lp(f, 900, 2) * m_hp(f, 90, 2))
    x = 0.55 * out + 0.7 * normalize(crack) + 0.85 * thump + 0.5 * normalize(body)
    return fade_edges(np.tanh(1.2 * normalize(x)), 0.0002, 0.2)


def make_subdrop(dur: float, f_hi: float, f_lo: float, tau_f: float, tau_a: float) -> np.ndarray:
    n = ns(dur)
    t = secs(n)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / tau_f)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau_a) * (1 - np.exp(-t / 0.004))
    return fade_edges(np.tanh(1.5 * x) / np.tanh(1.5), 0.0005, 0.15)


def make_whoosh(rise: float = WHOOSH_LEAD, tail: float = 0.14, name: str = "whoosh", direction: int = 1) -> np.ndarray:
    n = ns(rise + tail)
    t = secs(n)
    noise = rng(name).standard_normal((2, n))

    def gain(tc, f):
        x = np.clip(tc / rise, 0.0, 1.0)
        fc = 600.0 * (9000.0 / 600.0) ** (x ** 1.15)
        return m_band(f, fc, 1.25) * m_hp(f, 250, 2)

    y = tv_filter(noise, gain, 1024, 128)
    amp = np.where(t < rise, 0.22 + 0.78 * (t / rise) ** 1.6, np.exp(-(t - rise) / 0.03))
    a = np.clip(t / rise, 0, 1) * 0.6 + 0.2
    if direction < 0:
        a = 1.0 - a
    ang = a * np.pi / 2
    y = y * amp * np.stack([np.cos(ang), np.sin(ang)]) * np.sqrt(2)
    return fade_edges(normalize(y), 0.03, 0.02)


def make_ratchet(dur: float, rate0: float, rate1: float, name: str = "ratchet") -> np.ndarray:
    """The launcher's ripcord: clicks that accelerate (rate0 -> rate1 per second) and get louder."""
    n = ns(dur + 0.03)
    out = np.zeros((2, n))
    r = rng(name)
    lr = np.log(rate1 / rate0)
    k = 0
    m = ns(0.012)
    tt = secs(m)
    while True:
        tk = dur * np.log(1.0 + k * lr / (rate0 * dur)) / lr
        if tk > dur:
            break
        x = tk / dur
        burst = r.standard_normal(m) * np.exp(-tt / 0.0007)
        ping = np.sin(2 * np.pi * (3100 + 600 * r.random()) * tt) * np.exp(-tt / 0.0025)
        tk_low = np.sin(2 * np.pi * 950 * tt) * np.exp(-tt / 0.0035)
        click = 0.8 * burst + 0.6 * ping + 0.5 * tk_low
        i = ns(tk)
        p = 0.35 * np.sin(k * 1.7)
        out[:, i: i + m] += pan_mono(click * (0.35 + 0.65 * x ** 1.2), p)[:, : n - i]
        k += 1
    out = filt(out, lambda f: m_hp(f, 700, 2) * m_lp(f, 11000, 2))
    return normalize(out)


def make_whir(dur: float, f_start: float, f_peak: float, rise: float, f_end: float, decay: float,
              name: str = "whir", spin_down: bool = False) -> np.ndarray:
    """A spinning top: a metallic whine that rises fast, then sags while it spins, with a wobble."""
    n = ns(dur)
    t = secs(n)
    x = np.clip(t / rise, 0, 1)
    if spin_down:
        f = f_start * (f_end / f_start) ** (t / dur) ** 0.8
        amp = (1 - np.exp(-t / 0.05)) * np.clip(1 - t / dur, 0, 1) ** 1.6
    else:
        f = f_start * (f_peak / f_start) ** (x ** 0.65)
        sag = np.clip((t - rise) / max(dur - rise, 1e-3), 0, 1)
        f = f * (f_end / f_peak) ** (sag ** 1.3)
        amp = np.where(t < rise, x ** 1.4, np.exp(-(t - rise) / decay))
    ph = np.cumsum(f) / SR
    tone = (np.sin(2 * np.pi * ph) + 0.45 * np.sin(4 * np.pi * ph + 0.4) + 0.22 * np.sin(6 * np.pi * ph + 1.1)
            + 0.12 * np.sin(10 * np.pi * ph + 2.0))
    wobble = 1.0 + 0.3 * np.sin(2 * np.pi * ph / 7.0)
    air = filt(rng(name).standard_normal(n), lambda fr: m_hp(fr, 2500, 2) * m_lp(fr, 9000, 2))
    mono = (0.8 * tone * wobble + 0.5 * normalize(air) * (0.4 + 0.6 * x)) * amp
    # it rotates: an auto-pan whose speed follows the spin (counter-clockwise: right to left)
    rot = np.cumsum(f / 260.0) / SR
    ang = (0.5 - 0.35 * np.sin(2 * np.pi * rot)) * np.pi / 2
    y = np.stack([mono * np.cos(ang), mono * np.sin(ang)]) * np.sqrt(2)
    y = filt(y, lambda fr: m_hp(fr, 350, 2) * m_lp(fr, 7000, 2))
    return fade_edges(normalize(y), 0.004, 0.08)


def make_stamp(name: str = "stamp", big: bool = False) -> np.ndarray:
    """A rubber-and-metal stamp: dry thud, snap and a short clank."""
    n = ns(0.25)
    t = secs(n)
    r = rng(name)
    thud_f = 95.0 + 80.0 * np.exp(-t / 0.012)
    thud = np.sin(2 * np.pi * np.cumsum(thud_f) / SR) * np.exp(-t / (0.06 if big else 0.035))
    snap = filt(r.standard_normal(n) * np.exp(-t / 0.008), lambda f: m_hp(f, 1400, 2) * m_lp(f, 7000, 2))
    clank = (np.sin(2 * np.pi * 1760 * t) * np.exp(-t / 0.035) + 0.6 * np.sin(2 * np.pi * 2810 * t + 1) * np.exp(-t / 0.02))
    x = (0.9 if big else 0.6) * thud + 0.8 * normalize(snap) + (0.25 if big else 0.4) * clank
    return fade_edges(normalize(np.tanh(1.5 * x)), 0.0002, 0.05)


def make_blip() -> np.ndarray:
    n = ns(0.16)
    t = secs(n)
    f = 1568.0 * 2 ** np.clip(t / 0.03, 0, 1)
    a = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035)
    b = np.sin(2 * np.pi * 2349.0 * t) * np.exp(-np.maximum(t - 0.045, 0) / 0.03) * (t > 0.045)
    return fade_edges(normalize(0.7 * a + 0.5 * b), 0.001, 0.03)


# ---------------------------------------------------------------- tonal instruments -----------
LEAD_VOICES = [(-17.0, -0.8, 0.8), (-7.0, -0.35, 0.92), (0.0, 0.0, 1.0), (7.0, 0.35, 0.92), (17.0, 0.8, 0.8)]


def lead_note(m: float, dur: float, vel: float = 1.0, bright: float = 1.0, rel: float = 0.11) -> np.ndarray:
    """Hook lead: a 5-voice supersaw with a bright pluck filter, plus an FM layer for bite and a
    short inharmonic 'ting' on the attack for the metallic edge."""
    n = ns(dur + rel)
    t = secs(n)
    f0 = hz(m)
    r = rng(f"lead{m}{dur:.4f}{vel:.3f}{bright:.3f}")
    vib = 1.0 + 0.0028 * np.sin(2 * np.pi * 5.3 * t) * np.clip((t - 0.16) / 0.2, 0, 1)
    fc = 2800.0 + 5200.0 * bright * np.exp(-t / 0.085)
    kmax = int(12500 // (f0 * 1.02))
    base = np.cumsum(f0 * vib) / SR
    amps = [(1.0 / k) / np.sqrt(1.0 + (k * f0 / fc) ** 4) for k in range(1, kmax + 1)]
    out = np.zeros((2, n))
    for cents, p, g in LEAD_VOICES:
        ph = base * 2 ** (cents / 1200.0) + r.random()
        v = np.zeros(n)
        for k, a in enumerate(amps, start=1):
            v += a * np.sin(2 * np.pi * k * ph)
        out += pan_mono(v * g, p)
    out /= len(LEAD_VOICES) * 0.8
    idx = 1.5 * np.exp(-t / 0.06) + 0.5
    fm = np.sin(2 * np.pi * base + idx * np.sin(4 * np.pi * base))
    ting = np.sin(2 * np.pi * base + 2.6 * np.exp(-t / 0.012) * np.sin(2 * np.pi * 3.53 * base)) * np.exp(-t / 0.028)
    out += pan_mono(0.42 * fm + 0.30 * ting)
    out *= adsr(n, dur, 0.003, 0.12, 0.72, rel) * vel
    return np.tanh(1.25 * out) / np.tanh(1.25)


def bass_note(m: float, dur: float, vel: float) -> np.ndarray:
    """Mid bass: a plucky, saturated saw an octave over the sub (it is what phones play)."""
    n = ns(dur + 0.04)
    t = secs(n)
    f0 = hz(m)
    fc = 380.0 + 1800.0 * vel * np.exp(-t / 0.045)
    kmax = int(4200 // f0)
    v = np.zeros(n)
    for cents in (-7.0, 7.0):
        ph = np.cumsum(np.full(n, f0 * 2 ** (cents / 1200.0))) / SR
        for k in range(1, kmax + 1):
            v += (1.0 / k) / np.sqrt(1.0 + (k * f0 / fc) ** 4) * np.sin(2 * np.pi * k * ph)
    v *= adsr(n, dur, 0.002, 0.10, 0.55, 0.035)
    return np.tanh(2.2 * v * vel) / np.tanh(2.2)


def pad_chord(notes, dur: float, att: float = 0.07, rel: float = 0.35, cutoff: float = 2300.0,
              name: str = "pad") -> np.ndarray:
    n = ns(dur + rel)
    t = secs(n)
    r = rng(name + str(notes) + f"{dur:.3f}{cutoff:.0f}")
    out = np.zeros((2, n))
    for m in notes:
        f0 = hz(m)
        tab = wavetable(saw_amps(f0, cutoff, 9000.0))
        for cents, p in ((-10.0, -0.75), (0.0, 0.0), (10.0, 0.75)):
            out += pan_mono(wt_play(tab, f0 * 2 ** (cents / 1200.0) * t + r.random()), p)
    env = np.minimum(1.0, t / att) * np.where(t > dur, np.clip(1 - (t - dur) / rel, 0, 1) ** 2, 1.0)
    return out * env / (len(notes) * 3)


def stab(notes, decay: float, rel: float, name: str = "stab") -> np.ndarray:
    """Chord stab: bright supersaw chord whose filter closes as it rings."""
    dur = decay
    n = ns(dur + rel)
    t = secs(n)
    r = rng(name)
    out = np.zeros((2, n))
    for m in notes:
        f0 = hz(m)
        tab = wavetable(saw_amps(f0, 9000.0, 15000.0))
        for cents, p in ((-14.0, -0.8), (-5.0, -0.3), (5.0, 0.3), (14.0, 0.8)):
            out += pan_mono(wt_play(tab, f0 * 2 ** (cents / 1200.0) * t + r.random()), p)
    out /= len(notes) * 4

    def gain(tc, f):
        fc = 900.0 + 7000.0 * np.exp(-np.maximum(tc, 0) / 0.16)
        return m_lp(f, fc, 2) * m_hp(f, 160, 2)

    out = tv_filter(out, gain, 2048, 256)
    env = (1 - np.exp(-t / 0.002)) * (0.35 + 0.65 * np.exp(-t / 0.25)) * np.where(
        t > dur, np.clip(1 - (t - dur) / rel, 0, 1) ** 2, 1.0)
    return out * env


def pluck(m: float, dur: float) -> np.ndarray:
    n = ns(dur + 0.12)
    t = secs(n)
    f0 = hz(m)
    k = np.arange(1, int(9000 // f0) + 1)
    amps = np.where(k % 2 == 1, 1.0 / k, 0.35 / k) * m_lp(k * f0, 3800.0, 2)
    v = wt_play(wavetable(amps), f0 * t)
    return v * (1 - np.exp(-t / 0.001)) * np.exp(-t / 0.085)


def bell(m: float, dur: float = 0.7) -> np.ndarray:
    """FM bell (inharmonic 3.5 ratio): the metallic voice of the sonic logo in the intro."""
    n = ns(dur)
    t = secs(n)
    f = hz(m)
    idx = 3.0 * np.exp(-t / 0.07) + 0.5
    v = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 3.5 * f * t)) * np.exp(-t / 0.22)
    v += 0.45 * np.sin(2 * np.pi * 2 * f * t + 0.5) * np.exp(-t / 0.10)
    return fade_edges(v * (1 - np.exp(-t / 0.0008)), 0.0, 0.05)


def cowbell(m: float) -> np.ndarray:
    """The phonk cowbell (808-style: two square waves a ~fifth apart through a band-pass)."""
    n = ns(0.42)
    t = secs(n)
    f1 = hz(m)
    f2 = f1 * 1.4815
    v = 0.6 * wt_play(wavetable(square_amps(f1, 14000.0)), f1 * t) + 0.6 * wt_play(wavetable(square_amps(f2, 14000.0)), f2 * t + 0.3)
    env = (0.72 * np.exp(-t / 0.05) + 0.28 * np.exp(-t / 0.22)) * (1 - np.exp(-t / 0.0007))
    v = filt(v * env, lambda f: m_hp(f, f1 * 0.85, 2) * m_lp(f, f2 * 2.6, 2) * m_bell(f, f2, 3, 0.5))
    return fade_edges(np.tanh(1.6 * normalize(v)), 0.0003, 0.04)


# ---------------------------------------------------------------- space -----------------------
def make_ir(rt60: float = 1.7, length: float = 2.4, predelay: float = 0.014, name: str = "ir") -> np.ndarray:
    """Stereo hall: decorrelated noise with frequency-dependent decay and a few early taps."""
    n = ns(length)
    t = secs(n)
    r = rng(name)
    noise = r.standard_normal((2, n))
    spec = np.fft.rfft(noise, axis=-1)
    f = np.fft.rfftfreq(n, 1.0 / SR)
    ir = np.zeros((2, n))
    edges = [0.0, 350.0, 1400.0, 4500.0, 24000.0]
    mults = [1.0, 1.0, 0.72, 0.42]
    for lo, hi, mult in zip(edges[:-1], edges[1:], mults):
        mask = m_hp(f, max(lo, 1.0), 4) * m_lp(f, hi, 4) if lo > 0 else m_lp(f, hi, 4)
        band = np.fft.irfft(spec * mask, n, axis=-1)
        ir += band * np.exp(-6.9078 * t / (rt60 * mult))
    ir *= 1 - np.exp(-t / 0.006)
    for d, g, ch in ((0.011, 0.5, 0), (0.017, 0.45, 1), (0.023, 0.35, 0), (0.031, 0.3, 1)):
        ir[ch, ns(d)] += g * np.max(np.abs(ir))
    ir = np.pad(ir, ((0, 0), (ns(predelay), 0)))[:, :n]
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def pingpong(x: np.ndarray, delay: float, fb: float, repeats: int) -> np.ndarray:
    mono = filt(x.mean(axis=0), lambda f: m_hp(f, 500, 2) * m_lp(f, 5000, 2))
    out = np.zeros((2, x.shape[-1]))
    for i in range(1, repeats + 1):
        d = ns(delay * i)
        if d >= x.shape[-1]:
            break
        out[(i - 1) % 2, d:] += mono[: x.shape[-1] - d] * fb ** (i - 1)
    return out


# ---------------------------------------------------------------- sidechain -------------------
def duck_env(times, depth: float, release: float, attack: float = 0.003) -> np.ndarray:
    g = np.ones(N)
    for tk in times:
        i0 = ns(tk - attack)
        m = ns(attack + release)
        lt = secs(m) - attack
        x = np.clip(lt / release, 0, 1)
        d = np.where(lt < 0, depth * (lt + attack) / attack, depth * 0.5 * (1 + np.cos(np.pi * x)))
        lo, hi = max(0, i0), min(N, i0 + m)
        if hi > lo:
            g[lo:hi] = np.minimum(g[lo:hi], 1 - d[lo - i0: hi - i0])
    return g


# ---------------------------------------------------------------- music data ------------------
CHORDS = {
    "Gm": dict(root=31, pad=(55, 58, 62, 67), arp=(67, 70, 74, 79)),
    "Eb": dict(root=39, pad=(55, 58, 63, 67), arp=(67, 70, 75, 79)),
    "Cm": dict(root=36, pad=(55, 60, 63, 67), arp=(67, 72, 75, 79)),
    "D": dict(root=38, pad=(54, 57, 62, 66), arp=(66, 69, 74, 78)),
}
# bar 0 intro, bars 1-10 the five segments, bar 11 outro groove, bar 12 the last hit and tail
BAR_CHORDS = ["Gm", "Gm", "Eb", "Cm", "D", "Gm", "Eb", "Cm", "D", "Eb", "D", "Gm", "Gm"]

# The hook: (16th step, length in 16ths, midi). A tresillo cell (3+1+2+2) answered in bar 2.
G5, A5, Bb5, C6, D6, Eb6, F6, Fs5, Fs6, G6, A6 = 79, 81, 82, 84, 86, 87, 89, 78, 90, 91, 93
HOOK_X = [  # over Gm | Eb
    [(0, 3, G5), (3, 1, G5), (4, 2, Bb5), (6, 2, D6), (8, 3, C6), (11, 1, Bb5), (12, 2, A5), (14, 2, Bb5)],
    [(0, 3, G5), (3, 1, G5), (4, 2, Bb5), (6, 2, Eb6), (8, 5, D6)],
]
HOOK_Y = [  # over Cm | D (same shape, the answer leans on F#, the leading tone back to G)
    [(0, 3, G5), (3, 1, G5), (4, 2, C6), (6, 2, Eb6), (8, 3, D6), (11, 1, C6), (12, 2, Bb5), (14, 2, C6)],
    [(0, 3, Fs5), (3, 1, Fs5), (4, 2, A5), (6, 2, D6), (8, 3, C6), (11, 2, A5)],
]
HOOK_Y2 = [  # segment 4, varied: the answer jumps an octave and runs down
    HOOK_Y[0],
    [(0, 3, D6), (3, 1, D6), (4, 2, Fs6), (6, 2, A6), (8, 2, Fs6), (10, 1, D6), (11, 1, C6), (12, 1, A5), (13, 2, Fs5)],
]
HOOK_Z = [  # segment 5, varied and lifted: over Eb | D, then a run up into the outro's G
    [(0, 3, Bb5), (3, 1, Bb5), (4, 2, Eb6), (6, 2, G6), (8, 3, F6), (11, 1, Eb6), (12, 2, D6), (14, 2, Eb6)],
    [(0, 3, D6), (3, 1, D6), (4, 2, Fs6), (6, 2, A6), (8, 3, Fs6), (11, 1, D6), (12, 1, A5), (13, 1, C6), (14, 1, D6), (15, 0.5, Fs6)],
]
OUTRO_LEAD = [(0, 6, G6), (6, 2, D6), (8, 2, Eb6), (10, 2, D6), (12, 2, Bb5), (14, 2, A5)]
SEGMENT_HOOKS = [HOOK_X, HOOK_Y, HOOK_X, HOOK_Y2, HOOK_Z]


TRIADS = {"Gm": (7, 10, 2), "Eb": (3, 7, 10), "Cm": (0, 3, 7), "D": (2, 6, 9)}


def harmony_below(m: int, chord: str) -> int:
    """The highest chord tone at least a minor third under the melody note: never a semitone rub
    against the chord (a diatonic third under D6 over D major would be B-flat against A)."""
    return max(x for x in range(m - 12, m - 2) if x % 12 in TRIADS[chord])


# ---------------------------------------------------------------- arrangement -----------------
class Mix:
    def __init__(self):
        self.buses: dict[str, np.ndarray] = {}

    def bus(self, name: str) -> np.ndarray:
        if name not in self.buses:
            self.buses[name] = np.zeros((2, N))
        return self.buses[name]

    def add(self, name: str, sig: np.ndarray, t0: float, gain: float = 1.0, pan: float = 0.0):
        b = self.bus(name)
        s = pan_mono(sig, pan) if sig.ndim == 1 else sig
        i0 = ns(t0)
        if i0 < 0:
            s, i0 = s[:, -i0:], 0
        i1 = min(N, i0 + s.shape[-1])
        if i1 > i0:
            b[:, i0:i1] += gain * s[:, : i1 - i0]


def is_roll_bar(b: int) -> bool:
    """Bars that end on a cut: the hats roll into the next downbeat."""
    return b in (0, 2, 4, 6, 8, 10, 11)


def arrange() -> tuple[dict[str, np.ndarray], dict]:
    mx = Mix()
    cues: dict[str, list[float]] = {"kick": [], "clap": [], "impact": [], "whoosh_start": [], "launch": [],
                                     "stamp": [], "slam": [], "blip": [], "hook": []}
    kick, clap = make_kick(), make_clap()
    hats_c = [make_hat(False, v) for v in range(4)]
    hats_o = [make_hat(True, v) for v in range(2)]
    crash = make_crash()
    impact = make_impact()
    stamp_s, slam_s, blip_s = make_stamp("chip"), make_stamp("slam", big=True), make_blip()

    # ---- drums: kick on every beat of bars 1-11 and on the last hit
    kick_times = [bar_t(b, s) for b in range(1, 12) for s in (0, 4, 8, 12)] + [LAST_HIT]
    for tk in kick_times:
        mx.add("kick", kick, tk)
    cues["kick"] = kick_times

    # ---- claps on 2 and 4; a 32nd clap roll from the stamp into the drop
    for b in range(1, 12):
        for s in (4, 12):
            mx.add("clap", clap, bar_t(b, s))
            cues["clap"].append(bar_t(b, s))
    for i in range(7):  # the 8th roll hit (1.816 s) is left out: the build stops a 32nd before the drop
        mx.add("clap", clap, STAMP + i * STEP / 2, 0.6 * (0.18 + 0.55 * (i / 7) ** 1.5))
    for i in range(4):  # a softer 16th roll into the last hit
        mx.add("clap", clap, LAST_HIT - BEAT + i * STEP, 0.25 + 0.2 * i)

    # ---- hats: 8ths (open on the offbeats) + ghost 16ths; 16th then 32nd rolls into each cut
    for b in range(0, 12):
        start_step = 8 if b == 0 else 0
        for s in range(start_step, 16):
            t = bar_t(b, s)
            if is_roll_bar(b) and s >= 8:
                if s < 12:
                    mx.add("hats", hats_c[s % 4], t, (0.55 + 0.08 * (s - 8)) * (BUILD if b == 0 else 1.0), pan=0.15)
                else:
                    for h in range(2):
                        x = ((s - 12) * 2 + h) / 7
                        th = t + h * STEP / 2
                        if b == 0 and th >= DROP - STEP / 2 - 1e-6:
                            continue  # the build stops a 32nd early: a gap for the drop to land in
                        mx.add("hats", hats_c[(s + h) % 4], th, (0.42 + 0.38 * x) * (BUILD if b == 0 else 1.0), pan=0.15 - 0.3 * x)
                continue
            if b == 0:
                continue
            if s % 4 == 2:
                mx.add("hats", hats_o[s // 8 % 2], t, 0.62, pan=-0.1)
            elif s % 2 == 0:
                mx.add("hats", hats_c[s % 4], t, 0.8 if s % 4 == 0 else 0.6, pan=0.2)
            elif s in (7, 15) or (s == 11 and b % 2 == 1):
                mx.add("hats", hats_c[(s + 1) % 4], t, 0.32, pan=0.3)

    # ---- sub: one oscillator following the roots, gliding at chord changes; off before each cut
    freq = np.zeros(N)
    gate = np.zeros(N)
    for b in range(1, 12):
        i0, i1 = ns(bar_t(b)), ns(bar_t(b + 1))
        freq[i0:i1] = hz(CHORDS[BAR_CHORDS[b]]["root"])
        off = ns(bar_t(b, 14)) if is_roll_bar(b) else i1
        gate[i0:off] = 1.0
    freq[: ns(bar_t(1))] = hz(31)
    freq[ns(bar_t(12)):] = hz(31)
    glide = np.hanning(ns(0.05))
    freq = np.exp(np.convolve(np.log(np.pad(freq, ns(0.05), mode="edge")), glide / glide.sum(), "same"))[ns(0.05):-ns(0.05)]
    gate = np.convolve(gate, np.ones(ns(0.006)) / ns(0.006), "same")
    ph = np.cumsum(freq) / SR
    sub = np.sin(2 * np.pi * ph) + 0.08 * np.sin(4 * np.pi * ph)
    sub = np.tanh(1.8 * sub) / np.tanh(1.8) * gate
    sub = filt(sub, lambda f: m_lp(f, 190, 3) * m_hp(f, 28, 2))
    mx.add("sub", sub, 0.0)

    # ---- mid bass: offbeat 8ths with a ghost 16th after each (the gallop), an octave over the sub
    for b in range(1, 12):
        root = CHORDS[BAR_CHORDS[b]]["root"] + 12
        for s, v in ((2, 1.0), (3, 0.55), (6, 1.0), (7, 0.55), (10, 1.0), (11, 0.55), (14, 1.0), (15, 0.55)):
            if is_roll_bar(b) and s >= 14:
                continue
            mx.add("bass", bass_note(root, STEP * 0.8, v), bar_t(b, s), v)

    # ---- pads: a filtered Gm swells in the intro, then one chord per bar
    intro_pad = pad_chord(CHORDS["Gm"]["pad"], BAR, att=0.6, rel=0.05, cutoff=3000.0, name="intro")
    intro_pad = tv_filter(intro_pad, lambda tc, f: m_lp(f, 350.0 * (3000.0 / 350.0) ** np.clip(tc / BAR, 0, 1) ** 1.5, 2))
    # From the stamp on the pad thins out (-8 dB by the end of the build, silent in the 32nd before
    # the drop) and leaves the riser alone: the drop is the loudest moment even on a phone speaker.
    pt = secs(intro_pad.shape[-1])
    intro_pad *= 10 ** (-8.0 / 20 * np.clip((pt - STAMP) / (BUILD_END - STAMP), 0, 1)) * np.clip((BUILD_END - pt) / 0.004, 0, 1)
    mx.add("pads", intro_pad, 0.0, 2.0)
    for b in range(1, 12):
        mx.add("pads", pad_chord(CHORDS[BAR_CHORDS[b]]["pad"], BAR, name=f"pad{b}"), bar_t(b))

    # ---- the hook, once per product segment; harmony a third below in segments 4 and 5
    for i, seg in enumerate(SEGMENT_HOOKS):
        b0 = 1 + 2 * i
        cues["hook"].append(bar_t(b0))
        for half, phrase in enumerate(seg):
            chord = BAR_CHORDS[b0 + half]
            for s, ln, m in phrase:
                vel = 1.0 if s in (0, 4, 8) else 0.86
                note = lead_note(m, ln * STEP * 0.92, vel, bright=1.0 + 0.15 * (i >= 3))
                mx.add("lead", note, bar_t(b0 + half, s))
                if i >= 3:
                    mx.add("lead", lead_note(harmony_below(m, chord), ln * STEP * 0.92, vel * 0.55, 0.8),
                           bar_t(b0 + half, s), 0.8)
                if i in (2, 4):
                    mx.add("cowbell", cowbell(m - 12), bar_t(b0 + half, s), vel, pan=-0.25)
    for s, ln, m in OUTRO_LEAD:
        mx.add("lead", lead_note(m, ln * STEP * 0.92, 1.0 if s == 0 else 0.86), bar_t(11, s))
        mx.add("cowbell", cowbell(m - 12), bar_t(11, s), 0.7, pan=-0.25)
    for m, g in ((G5, 1.0), (G6, 0.5)):
        mx.add("lead", lead_note(m, 0.9, g, rel=0.9), LAST_HIT)

    # ---- arp: 16th plucks on chord tones from segment 3 on
    pattern = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2]
    for b in range(5, 12):
        tones = CHORDS[BAR_CHORDS[b]]["arp"]
        for s in range(16):
            if is_roll_bar(b) and s >= 14:
                continue
            m = tones[pattern[s]] - 12 + (12 if s % 8 == 6 else 0)
            mx.add("arp", pluck(m, STEP), bar_t(b, s), 0.85 if s % 4 == 0 else 0.6, pan=0.45 if s % 2 else -0.45)

    # ---- stabs on the wordmark slam and the last hit
    mx.add("stab", stab((55, 62, 67, 70, 74, 79), 0.35, 0.5, "slam"), WORDMARK)
    mx.add("stab", stab((43, 55, 62, 67, 70, 74, 79), 0.9, 0.9, "last"), LAST_HIT)

    # ---- intro: emblem launch, slam, stamp, riser, reverse swell
    mx.add("fx", make_ratchet(0.20, 30.0, 60.0, "r_intro"), 0.0, 0.9)
    mx.add("fx", make_whir(0.95, 260.0, 980.0, 0.85, 980.0, 0.5, "w_intro"), 0.0, 0.55)
    # sonic logo: four rising bell notes on the 8ths (G4 D5 G5 Bb5) into the wordmark slam
    for k, (m, v) in enumerate(((67, 0.62), (74, 0.72), (79, 0.86), (82, 1.0))):
        mx.add("bell", bell(m), k * 2 * STEP, v, pan=(-0.3, 0.3, -0.15, 0.15)[k])
    mx.add("impact", impact, WORDMARK, 1.0)
    mx.add("sdrop", make_subdrop(1.1, 120.0, hz(31), 0.22, 0.45), WORDMARK, 1.0)  # settles on G1, the kick's pitch
    mx.add("crash", crash, WORDMARK, 0.8)
    cues["impact"].append(WORDMARK)
    mx.add("fx", make_stamp("ox", big=True), STAMP, 0.65)
    cues["stamp"].append(STAMP)
    # riser: noise sweep + a pitched supersaw climbing two octaves, from the slam to a 32nd before
    # the drop. The whole build sits 4.5 dB lower and stops early, so on a phone speaker (no low end)
    # the drop still comes in louder than what leads into it.
    rlen = BUILD_END - WORDMARK
    rn = ns(rlen)
    rt = secs(rn)
    noise = rng("riser").standard_normal((2, rn))
    rnoise = tv_filter(noise, lambda tc, f: m_band(f, 500.0 * (9000.0 / 500.0) ** np.clip(tc / rlen, 0, 1) ** 1.3, 1.0))
    rnoise *= (rt / rlen) ** 2
    rf = 196.0 * 4.0 ** ((rt / rlen) ** 1.3)
    rtab = wavetable(saw_amps(784.0, 6000.0, 14000.0))
    rsaw = sum(pan_mono(wt_play(rtab, np.cumsum(rf * 2 ** (c / 1200)) / SR + 0.37 * j), p)
               for j, (c, p) in enumerate(((-15, -0.7), (0, 0), (15, 0.7))))
    rsaw = tv_filter(rsaw, lambda tc, f: m_lp(f, 600.0 * (7000.0 / 600.0) ** np.clip(tc / rlen, 0, 1), 2))
    rsaw *= (rt / rlen) ** 1.6
    mx.add("fx", fade_edges(normalize(rnoise) * 0.8 + normalize(rsaw) * 0.6, 0.01, 0.004), WORDMARK, 0.55 * BUILD)
    # reverse swell: a crash and a reverbed Gm stab played backwards, ending a 32nd before the drop
    swell = make_crash(1.0, "rev")
    swell_st = stab((55, 62, 67, 70, 74), 0.1, 0.1, "revst")
    swell_st = fftconv(swell_st, make_ir(2.0, 1.2, 0.0, "revir"))[:, : ns(1.0)] * 0.25
    sw = np.zeros((2, ns(1.0)))
    sw[:, : swell.shape[1]] += swell[:, : ns(1.0)] * 0.6
    sw[:, : swell_st.shape[1]] += swell_st
    sw = sw[:, ::-1] * np.linspace(0, 1, ns(1.0)) ** 1.5
    mx.add("fx", fade_edges(normalize(sw), 0.01, 0.003), BUILD_END - 1.0, 0.6 * BUILD)

    # ---- the drop: the launcher rip (ratchet accelerating into the downbeat) and the top's whir
    mx.add("fx", make_ratchet(0.30, 22.0, 95.0, "r_drop"), BUILD_END - 0.30, 0.55 * BUILD)
    mx.add("fx", make_whir(1.9, 520.0, 1568.0, 0.24, 1290.0, 0.55, "w_drop"), DROP - 0.04, 0.20)
    cues["launch"].append(DROP)

    # ---- every product segment: whoosh in, impact + sub drop + crash on the downbeat, UI hits
    for i, s0 in enumerate(SEGMENTS):
        # the drop's whoosh is part of the build, so it gets the build's gain
        mx.add("fx", make_whoosh(name=f"wh{i}", direction=1 if i % 2 == 0 else -1), s0 - WHOOSH_LEAD, 1.5 * (BUILD if i == 0 else 1.0))
        cues["whoosh_start"].append(s0 - WHOOSH_LEAD)
        mx.add("impact", impact, s0, 0.8)
        mx.add("sdrop", make_subdrop(0.7, 105.0, 38.0, 0.10, 0.22), s0, 0.75)
        mx.add("crash", crash, s0, 0.62)
        cues["impact"].append(s0)
        mx.add("ui", stamp_s, s0 + 2 * BEAT, 0.5, pan=0.2)
        mx.add("ui", slam_s, s0 + 4 * BEAT, 0.55, pan=-0.1)
        mx.add("ui", blip_s, s0 + 6 * BEAT, 0.32, pan=0.3)
        cues["stamp"].append(s0 + 2 * BEAT)
        cues["slam"].append(s0 + 4 * BEAT)
        cues["blip"].append(s0 + 6 * BEAT)

    # ---- outro: relaunch, CTA hit, the last groove bar, the last hit, the spin-down tail
    mx.add("fx", make_whoosh(name="wh_out"), OUTRO - WHOOSH_LEAD, 1.5)
    cues["whoosh_start"].append(OUTRO - WHOOSH_LEAD)
    mx.add("fx", make_ratchet(0.26, 22.0, 90.0, "r_out"), OUTRO - 0.26, 0.5)
    mx.add("fx", make_whir(1.4, 520.0, 1568.0, 0.22, 1300.0, 0.45, "w_out"), OUTRO - 0.04, 0.17)
    mx.add("impact", impact, OUTRO, 0.85)
    mx.add("sdrop", make_subdrop(0.7, 105.0, 38.0, 0.10, 0.22), OUTRO, 0.75)
    mx.add("crash", crash, OUTRO, 0.62)
    cues["impact"].append(OUTRO)
    cues["launch"].append(OUTRO)
    mx.add("fx", make_whoosh(name="wh_last"), LAST_HIT - WHOOSH_LEAD, 0.9)
    mx.add("impact", impact, LAST_HIT, 1.0)
    mx.add("sdrop", make_subdrop(1.6, 110.0, hz(31), 0.2, 0.5), LAST_HIT, 0.95)
    mx.add("crash", make_crash(1.9, "lastcrash"), LAST_HIT, 0.75)
    cues["impact"].append(LAST_HIT)
    mx.add("fx", make_whir(1.7, 1568.0, 1568.0, 0.1, 330.0, 1.0, "w_tail", spin_down=True), LAST_HIT + 0.12, 0.10)
    return mx.buses, cues


# ---------------------------------------------------------------- mix -------------------------
LEVELS = {  # linear gains into the mix bus
    "kick": 0.80, "clap": 0.60, "hats": 0.42, "sub": 0.26, "bass": 0.27, "pads": 0.45,
    "lead": 0.24, "arp": 0.09, "cowbell": 0.12, "stab": 0.40, "fx": 0.50, "impact": 0.42,
    "sdrop": 0.50, "crash": 0.34, "ui": 0.88, "bell": 0.30,
}
REVERB_SENDS = {"bell": 0.35, "clap": 0.16, "lead": 0.22, "pads": 0.25, "arp": 0.35, "cowbell": 0.35, "stab": 0.55,
                "impact": 0.30, "crash": 0.15, "fx": 0.18, "ui": 0.25}
DELAY_SENDS = {"bell": 0.35, "lead": 0.20, "arp": 0.25, "cowbell": 0.30}
REVERB_RETURN = 0.30
DELAY_RETURN = 0.30


def mixdown(buses: dict[str, np.ndarray], cues: dict) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    kick_duck = duck_env(cues["kick"], 1.0, 0.24)
    impact_duck = duck_env(cues["impact"], 1.0, 0.45)

    def sc(depth_k: float, depth_i: float) -> np.ndarray:
        return (1 - depth_k * (1 - kick_duck)) * (1 - depth_i * (1 - impact_duck))

    eq = {
        "kick": lambda f: m_hp(f, 30, 2) * m_bell(f, 3800, 2.0, 0.6),
        "clap": lambda f: m_hp(f, 150, 2) * m_bell(f, 400, -2.0, 0.8),
        "hats": lambda f: m_hp(f, 6000, 2) * m_bell(f, 4000, -2, 0.5),
        "bass": lambda f: m_hp(f, 125, 3) * m_lp(f, 3500, 2) * m_bell(f, 320, -2.5, 0.7),
        "pads": lambda f: m_hp(f, 220, 2) * m_lp(f, 7000, 2) * m_bell(f, 600, -2, 0.8),
        "lead": lambda f: m_hp(f, 300, 2) * m_bell(f, 3300, -1.5, 0.45) * m_bell(f, 1100, 1.2, 0.8) * m_lp(f, 13000, 2),
        "arp": lambda f: m_hp(f, 450, 2) * m_lp(f, 6000, 2),
        "bell": lambda f: m_hp(f, 250, 2) * m_lp(f, 9000, 2),
        "cowbell": lambda f: m_hp(f, 350, 2) * m_lp(f, 8000, 2),
        "stab": lambda f: m_hp(f, 160, 2),
        "fx": lambda f: m_hp(f, 160, 2),
        "impact": lambda f: m_hp(f, 45, 2),
        "crash": lambda f: m_hp(f, 2500, 2),
        "ui": lambda f: m_hp(f, 200, 2),
        "sdrop": lambda f: m_hp(f, 24, 2) * m_lp(f, 220, 2),
    }
    # The UI hits of the motion graphics (chip stamp, name slam, callout blip) dip the lead and the
    # pads by 6 dB for 90 ms, so they are heard over the hook.
    ui_duck = 1 - 0.5 * (1 - duck_env(cues["stamp"][1:] + cues["slam"] + cues["blip"], 1.0, 0.09))
    # A 32nd of air before the CTA hit and the last hit: FX, claps and hats stop, the hit lands alone.
    gap = np.ones(N)
    ramp = ns(0.002)
    for t in (OUTRO, LAST_HIT):
        i0, i1 = ns(t - GAP), ns(t)
        gap[i0:i1] = 0.0
        gap[i0 - ramp: i0] = np.minimum(gap[i0 - ramp: i0], np.linspace(1.0, 0.0, ramp))
        gap[i1: i1 + ramp] = np.minimum(gap[i1: i1 + ramp], np.linspace(0.0, 1.0, ramp))
    ducks = {"sub": sc(0.92, 0.85), "bass": sc(0.65, 0.6), "pads": sc(0.6, 0.5) * ui_duck, "arp": sc(0.35, 0.3),
             "lead": sc(0.12, 0.15) * ui_duck, "cowbell": sc(0.15, 0.15), "fx": gap, "clap": gap, "hats": gap}
    stems: dict[str, np.ndarray] = {}
    rev_in = np.zeros((2, N))
    dly_in = np.zeros((2, N))
    for name, x in buses.items():
        y = filt(x, eq[name]) if name in eq else x
        y = y * LEVELS.get(name, 1.0)
        if name in ducks:
            y = y * ducks[name]
        stems[name] = y
        rev_in += y * REVERB_SENDS.get(name, 0.0)
        dly_in += y * DELAY_SENDS.get(name, 0.0)
    dly = pingpong(dly_in, 3 * STEP, 0.42, 6)
    rev_in += dly * 0.25
    rev_in = filt(rev_in, lambda f: m_hp(f, 320, 2) * m_lp(f, 9000, 2))
    rev = fftconv(rev_in, make_ir(1.7, 2.4))[:, :N]
    stems["reverb"] = rev * REVERB_RETURN * (0.55 + 0.45 * kick_duck)
    stems["delay"] = dly * DELAY_RETURN
    mix = sum(stems.values())
    return mix, stems


# ---------------------------------------------------------------- master ----------------------
def _biquad_ir(b, a, n):
    y = np.zeros(n)
    x = np.zeros(n)
    x[0] = 1.0
    for i in range(n):
        acc = b[0] * x[i]
        if i >= 1:
            acc += b[1] * x[i - 1] - a[1] * y[i - 1]
        if i >= 2:
            acc += b[2] * x[i - 2] - a[2] * y[i - 2]
        y[i] = acc
    return y


_KW = None


def k_weight(x: np.ndarray) -> np.ndarray:
    """BS.1770 K-weighting at 48 kHz (shelf + RLB high-pass), as an FIR of its impulse response."""
    global _KW
    if _KW is None:
        h1 = _biquad_ir([1.53512485958697, -2.69169618940638, 1.19839281085285],
                        [1.0, -1.69065929318241, 0.73248077421585], 2048)
        h2 = _biquad_ir([1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621], 24000)
        _KW = np.convolve(h1, h2)[:24000]
    return fftconv(x, _KW[None, :])[:, : x.shape[-1]]


def lufs(x: np.ndarray) -> float:
    y = k_weight(x)
    blk, hop = ns(0.4), ns(0.1)
    p = np.stack([np.mean(y[:, i: i + blk] ** 2, axis=1) for i in range(0, y.shape[1] - blk + 1, hop)]).sum(1)
    lk = -0.691 + 10 * np.log10(np.maximum(p, 1e-12))
    g = p[lk > -70]
    rel = -0.691 + 10 * np.log10(np.mean(g)) - 10
    g = p[(lk > -70) & (lk > rel)]
    return float(-0.691 + 10 * np.log10(np.mean(g)))


def oversample(x: np.ndarray, factor: int = 4) -> np.ndarray:
    n = x.shape[-1]
    spec = np.fft.rfft(x, axis=-1)
    return np.fft.irfft(spec, n * factor, axis=-1) * factor


def true_peak_db(x: np.ndarray) -> float:
    return float(20 * np.log10(np.max(np.abs(oversample(x, 4)))))


def limiter(x: np.ndarray, ceiling_db: float, attack: float = 0.002, release_db_s: float = 45.0) -> np.ndarray:
    """Stereo-linked lookahead limiter on the 4x oversampled peak (no recursion: the release is a
    running maximum in dB with a linear decay, which numpy can do with maximum.accumulate)."""
    n = x.shape[-1]
    up = np.abs(oversample(x, 4)).max(axis=0).reshape(n, 4).max(axis=1)
    pk = np.maximum(up, np.roll(up, 1))
    over = np.maximum(0.0, 20 * np.log10(np.maximum(pk, 1e-9)) - ceiling_db)
    k = np.arange(n)
    rel = release_db_s / SR
    att = 12.0 / (attack * SR)  # dB per sample on the way down (lookahead ramp)
    d_rel = np.maximum.accumulate(over + k * rel) - k * rel
    d_att = (np.maximum.accumulate((over - k * att)[::-1]) + 0)[::-1] + k * att
    d = np.maximum(d_rel, d_att)
    w = max(1, ns(0.001))
    hold = np.lib.stride_tricks.sliding_window_view(np.pad(d, (0, w - 1), mode="edge"), w).max(axis=1)
    d = np.convolve(np.pad(hold, (w - 1, 0), mode="edge"), np.ones(w) / w, "valid")
    return x * 10 ** (-d / 20)


def master(mix: np.ndarray, target: float = -14.0, ceiling: float = -1.5) -> tuple[np.ndarray, dict]:
    mix = filt(mix, lambda f: m_hp(f, 24, 2) * m_bell(f, 4500, 1.5, 1.0) * m_shelf(f, 9000, 1.5))
    gain_db = target - lufs(mix)
    y = mix
    for _ in range(8):
        y = limiter(mix * 10 ** (gain_db / 20), ceiling)
        y = soft_tail(y)
        lv = lufs(y)
        if abs(lv - target) < 0.03:
            break
        gain_db += target - lv
    tp = true_peak_db(y)
    if tp > ceiling + 0.05:
        y *= 10 ** ((ceiling - tp) / 20)
    return y, {"lufs": lufs(y), "true_peak_db": true_peak_db(y), "gain_db": gain_db,
               "sample_peak_db": float(20 * np.log10(np.max(np.abs(y))))}


def soft_tail(y: np.ndarray) -> np.ndarray:
    """Silence at both ends so the reel loops: tiny fade-in, the tail fades out by 24.38 s."""
    t = secs(y.shape[-1])
    env = np.clip(t / 0.004, 0, 1)
    a, b = 23.15, END + 0.005
    env *= np.where(t < a, 1.0, np.where(t < b, 0.5 * (1 + np.cos(np.pi * (t - a) / (b - a))), 0.0))
    return y * env


def write_wav(path: str, x: np.ndarray) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    q = np.ascontiguousarray(np.clip(np.round(x.T * 8388607.0), -8388608, 8388607).astype("<i4"))
    raw = q.view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(raw)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--stems", default=None, help="folder for the pre-master stems (optional)")
    args = ap.parse_args()
    buses, cues = arrange()
    mix, stems = mixdown(buses, cues)
    out, stats = master(mix)
    write_wav(args.out, out)
    if args.stems:
        for name, s in stems.items():
            write_wav(os.path.join(args.stems, f"{name}.wav"), normalize(s, 0.9))
        np.save(os.path.join(args.stems, "premaster.npy"), mix.astype(np.float32))
    print(f"wrote {args.out}: {out.shape[1] / SR:.3f} s, {stats['lufs']:.2f} LUFS, "
          f"true peak {stats['true_peak_db']:.2f} dBTP, sample peak {stats['sample_peak_db']:.2f} dBFS, "
          f"master gain {stats['gain_db']:+.2f} dB")


if __name__ == "__main__":
    main()
