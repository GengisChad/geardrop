#!/usr/bin/env python3
"""
Original hype soundtrack for the GEAR//DROP "spin" reel: real Beyblade X battle footage, 9:16,
for Instagram. Hard phonk / trap-metal at 150 BPM in G minor: a distorted 808, a cowbell riff,
double-tracked distorted power chords, punchy drums, and hit-point scoring for the slow-motion
contacts.

Everything audible is synthesised in this file with numpy: oscillators, Karplus-Strong strings,
noise, filters, reverb and the master. No samples, no recordings, no existing melodies. Every
random source has a fixed seed, so the same timeline always gives the same audio.

    python3 score.py --timeline spin-hype/timeline.json --out ../../../out/clips/spin-hype/spin-music.wav

Writes next to --out:
  spin-music.wav         full mix: 48 kHz stereo 24-bit, exactly the timeline duration,
                         -14 LUFS integrated, true peak <= -1 dBTP
  spin-music-nosfx.wav   the music without the impact hits
  spin-hits.wav          the impact hits only
                         (both stems go through the master gain and the limiter envelope of the
                         full mix, so nosfx + hits = full mix, sample for sample)
  report.json            tempo, sections, every hit and accent time, loudness, checks
  spin-music-waveform.png, spin-music-spectrogram.png   with the cut and impact times marked

Every time comes from the timeline, so the score follows a re-measured edit in seconds:
  duration    file length (samples = round(duration * 48000))
  shots[]     start / end / kind: runs of "fast" shots get the groove, with an accent on every
              cut; a "lead" shot gets the riser; a "slow" shot gets the heavy half-time bed
  hits[]      optional, the measured contact times; when present they replace impacts[]
  impacts[]   first guesses at the contacts (the starts of the slow-motion shots)
  stinger     optional, the time of the final stinger (default: the last downbeat of the finale
              groove that leaves 0.3 s before the end)

Form, with the first-guess timeline:
  0.00-4.10   montage: the groove (kick and 808 on a 3+3+2 pattern, clap on 2 and 4, 16th hats,
              the cowbell riff) and an accent on every cut (crash + power-chord stab + kick + 808;
              a bigger one with a spin-up whine on 0.00)
  4.10-14.22  seven lead + slow pairs: on the lead shot a riser (noise sweep, reverse crash, rising
              spin whine, saws gliding up an octave onto the hit's root, accelerating snare roll)
              that peaks on the impact; on the impact a hit (punch + sub boom + crash + metal
              clang + distorted chord stab); in the slow motion a half-time bed (808 swell,
              muffled pad, the riff head on a cowbell slowed to half speed, a heavy snare on the
              half-time backbeat) that tape-stops into the next lead. The fast shot at 10.22 brings
              the groove back for its 0.7 s.
  14.22-end   finale: the full groove with chugging guitars, accents on 14.22 and 15.22, the final
              stinger on the next downbeat, and a launcher-rip pickup that runs into 0.00 so the
              reel loops.
Hits progression: G Eb C D | G Ab D -> G (the last hit before every groove is the dominant).
"""
from __future__ import annotations

import argparse
import functools
import json
import os
import re
import shutil
import subprocess
import time
import wave
import zlib

import numpy as np

SR = 48_000
BPM = 150.0
BEAT = 60.0 / BPM          # 0.4 s
STEP = BEAT / 4            # a 16th: 0.1 s, the grid the montage was cut on
BAR = 16                   # 16ths per bar
SNAP = 0.055               # grid events this close to a cut accent move onto it: no flams
EDGE_FADE = 0.006          # the file's own fade in and fade out (>= 5 ms)
LOOP_PICKUP = 0.22         # the launcher rip at the end that runs into 0.00
CEILING_DB = -1.5          # limiter ceiling (true peak, 4x oversampled); the brief asks <= -1.0
TARGET_LUFS = -14.0


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


def choke(x: np.ndarray, t_end: float, fade: float = 0.008) -> np.ndarray:
    """Silence a sound from t_end (seconds from its start), with a raised-cosine fade ending there."""
    n = x.shape[-1]
    i1 = ns(t_end)
    if i1 >= n:
        return x
    i1 = max(i1, 1)
    f = max(1, min(ns(fade), i1))
    env = np.ones(n)
    env[i1:] = 0.0
    env[i1 - f: i1] = 0.5 * (1.0 + np.cos(np.pi * np.arange(1, f + 1) / f))
    return x * env


def tape_curve(n: int, dive: float, semis: float) -> np.ndarray:
    """Pitch multiplier of a tape stop over the last `dive` seconds: it slows down, faster and faster."""
    t = secs(n)
    x = np.clip((t - (n / SR - dive)) / max(dive, 1e-3), 0.0, 1.0)
    return 2.0 ** (-semis * x ** 2 / 12.0)


# ---------------------------------------------------------------- filters ---------------------
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


def filt_sparse(x: np.ndarray, mag, tail: float = 0.35, gap: float = 0.5) -> np.ndarray:
    """filt() on a long, mostly silent bus: each active stretch (plus a tail for the filter's
    ringing) is filtered on its own, so the FFTs stay short. Causal filter: nothing before a stretch."""
    act = np.flatnonzero(np.abs(x).max(axis=0) > 0)
    out = np.zeros_like(x)
    if len(act) == 0:
        return out
    br = np.flatnonzero(np.diff(act) > ns(gap))
    starts = np.concatenate([[act[0]], act[br + 1]])
    ends = np.concatenate([act[br], [act[-1]]]) + 1
    for a, b in zip(starts, ends):
        e = min(x.shape[-1], b + ns(tail))
        seg = np.zeros((x.shape[0], e - a))
        seg[:, : b - a] = x[:, a:b]
        out[:, a:e] += filt(seg, mag)
    return out


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
        out += wt_play(wavetable(square_amps(f, 20000.0)), f * t + r.random())
    return out / 6.0


def frozen(x: np.ndarray) -> np.ndarray:
    x.flags.writeable = False
    return x


# ---------------------------------------------------------------- drums -----------------------
@functools.lru_cache(maxsize=None)
def make_kick(f_end: float = 52.0, sweep: float = 150.0, decay: float = 0.075, length: float = 0.30,
              name: str = "kick") -> np.ndarray:
    """Short, hard kick (the 808 under it carries the sustain): a pitch-swept sine, clipped, plus a click."""
    n = ns(length)
    t = secs(n)
    f = f_end + sweep * np.exp(-t / 0.028) + 1100.0 * np.exp(-t / 0.0022)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR)
    amp = np.where(t < 0.025, 1.0, np.exp(-(t - 0.025) / decay))
    body = np.tanh(2.6 * body * amp) / np.tanh(2.6)
    click = filt(rng(name).standard_normal(n) * np.exp(-t / 0.0015), lambda f: m_hp(f, 2000, 2) * m_lp(f, 9000, 2))
    return frozen(fade_edges(0.9 * body + 0.4 * normalize(click), 0.0003, 0.03))


@functools.lru_cache(maxsize=None)
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
    return frozen(fade_edges(np.tanh(1.5 * normalize(x)), 0.0003, 0.05))


@functools.lru_cache(maxsize=None)
def make_snare(name: str = "snare", big: bool = False) -> np.ndarray:
    """Tight trap snare for the rolls; the big one (half-time backbeat) has a longer, darker tail."""
    n = ns(0.95 if big else 0.25)
    t = secs(n)
    r = rng(name)
    f = 185.0 + 95.0 * np.exp(-t / 0.010)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.07 if big else 0.045))
    body2 = np.sin(2 * np.pi * 332.0 * t + 0.5) * np.exp(-t / 0.03)
    noise = filt(r.standard_normal(n) * np.exp(-t / (0.17 if big else 0.075)),
                 lambda f: m_hp(f, 1300 if big else 1700, 2) * m_lp(f, 8500 if big else 10000, 2) * m_bell(f, 3800, 2, 0.8))
    crack = filt(r.standard_normal(n) * np.exp(-t / 0.004), lambda f: m_hp(f, 3000, 2))
    x = 0.85 * body + 0.3 * body2 + 0.95 * normalize(noise) + 0.4 * normalize(crack)
    x = np.tanh(1.7 * normalize(x * (1 - np.exp(-t / 0.0006))))
    return frozen(fade_edges(normalize(x), 0.0002, 0.04))


@functools.lru_cache(maxsize=None)
def make_hat(open_: bool, variant: int) -> np.ndarray:
    n = ns(0.30 if open_ else 0.07)
    t = secs(n)
    r = rng(f"hat{open_}{variant}")
    raw = 0.55 * metal(n, 1.0 + 0.01 * variant, f"hm{variant}") + 0.21 * r.standard_normal(n)
    env = np.exp(-t / (0.085 if open_ else 0.014)) * (1 - np.exp(-t / 0.0004))
    x = filt(raw * env, lambda f: m_hp(f, 7200, 3) * m_bell(f, 10500, 3, 0.5) * m_lp(f, 16000, 2))
    return frozen(fade_edges(normalize(x), 0.0002, 0.01))


@functools.lru_cache(maxsize=None)
def make_crash(dur: float = 2.0, name: str = "crash") -> np.ndarray:
    n = ns(dur)
    t = secs(n)
    r = rng(name)
    out = []
    for ch in range(2):
        raw = 0.7 * r.standard_normal(n) + 1.4 * metal(n, 1.31 + 0.012 * ch, f"{name}m{ch}")
        env = (0.55 * np.exp(-t / 0.05) + 0.45 * np.exp(-t / 0.62)) * (1 - np.exp(-t / 0.0006))
        out.append(filt(raw * env, lambda f: m_hp(f, 3600, 2) * m_lp(f, 14500, 2) * m_bell(f, 6800, 2.5, 0.8)))
    return frozen(fade_edges(normalize(np.stack(out)), 0.0002, min(0.3, dur / 3)))


CRASH_LEN = 2.6


def crash(variant: int, dur: float | None = None, fade: float = 0.25) -> np.ndarray:
    """One of three crash renders, choked at dur when given."""
    c = make_crash(CRASH_LEN, f"crash{variant % 3}")
    return c if dur is None or dur >= CRASH_LEN else choke(c, dur, fade)


def reverse_crash(length: float, variant: int) -> np.ndarray:
    """A crash played backwards: it swells and peaks on its last sample."""
    c = make_crash(CRASH_LEN, f"crash{variant % 3}")
    return normalize(c[:, : ns(min(length, CRASH_LEN - 0.3))][:, ::-1].copy())


# ---------------------------------------------------------------- impacts and FX --------------
@functools.lru_cache(maxsize=None)
def make_clang(f0: float, name: str) -> np.ndarray:
    """Metal-on-metal contact: free-bar modes tuned to the chord, a crack, a mid thump."""
    n = ns(1.4)
    t = secs(n)
    r = rng(name)
    out = np.zeros((2, n))
    modes = [(1.0, 1.0, 0.40), (2.756, 0.7, 0.26), (5.404, 0.45, 0.17), (8.933, 0.3, 0.10), (13.34, 0.18, 0.07)]
    for ch, det in enumerate((0.997, 1.003)):
        for ratio, amp, dec in modes:
            out[ch] += amp * np.sin(2 * np.pi * (f0 * ratio * det * t + r.random())) * np.exp(-t / dec)
    out *= 1 - np.exp(-t / 0.0008)
    crack = filt(r.standard_normal((2, n)) * np.exp(-t / 0.011), lambda f: m_hp(f, 1500, 2) * m_lp(f, 12000, 2))
    thump_f = 70.0 + 80.0 * np.exp(-t / 0.03)
    thump = np.sin(2 * np.pi * np.cumsum(thump_f) / SR) * np.exp(-t / 0.09) * (1 - np.exp(-t / 0.001))
    body = filt(r.standard_normal(n) * np.exp(-t / 0.05), lambda f: m_lp(f, 900, 2) * m_hp(f, 90, 2))
    x = 0.55 * out + 0.7 * normalize(crack) + 0.6 * thump + 0.45 * normalize(body)
    return frozen(fade_edges(np.tanh(1.2 * normalize(x)), 0.0002, 0.2))


@functools.lru_cache(maxsize=None)
def make_boom(dur: float, f_hi: float, f_lo: float, tau_a: float) -> np.ndarray:
    """Sub boom: a sine falling from f_hi onto the chord root, saturated so phones hear it too."""
    n = ns(dur)
    t = secs(n)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / 0.07)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau_a) * (1 - np.exp(-t / 0.003))
    return frozen(fade_edges(np.tanh(1.8 * x) / np.tanh(1.8), 0.0005, 0.02))


def spin_whine(length: float, name: str, f0: float = 650.0, f1: float = 2600.0, shape: str = "rise") -> np.ndarray:
    """A spinning top's metallic whine, with an auto-pan that follows the spin (right to left)."""
    n = ns(length)
    t = secs(n)
    x = t / length
    if shape == "rise":
        f = f0 * (f1 / f0) ** (x ** 0.9)
        amp = 0.1 + 0.9 * x ** 1.2
    else:  # launch: shoots up in 0.12 s, then sags and fades
        f = f0 * (f1 / f0) ** np.clip(t / 0.12, 0, 1) ** 0.6 * (0.85 + 0.15 * np.exp(-np.maximum(t - 0.12, 0) / 0.3))
        amp = np.clip(t / 0.03, 0, 1) * np.exp(-np.maximum(t - 0.1, 0) / 0.18)
    ph = np.cumsum(f) / SR
    tone = (np.sin(2 * np.pi * ph) + 0.45 * np.sin(4 * np.pi * ph + 0.4) + 0.22 * np.sin(6 * np.pi * ph + 1.1)
            + 0.12 * np.sin(10 * np.pi * ph + 2.0))
    wob = 1.0 + 0.3 * np.sin(2 * np.pi * ph / 7.0)
    air = filt(rng(name).standard_normal(n), lambda fr: m_hp(fr, 2500, 2) * m_lp(fr, 9000, 2))
    mono = (0.8 * tone * wob + 0.4 * normalize(air)) * amp
    rot = np.cumsum(f / 260.0) / SR
    ang = (0.5 - 0.35 * np.sin(2 * np.pi * rot)) * np.pi / 2
    y = np.stack([mono * np.cos(ang), mono * np.sin(ang)]) * np.sqrt(2)
    y = filt(y, lambda fr: m_hp(fr, 400, 2) * m_lp(fr, 8000, 2))
    return fade_edges(normalize(y), 0.005, 0.006)


def make_ratchet(dur: float, rate0: float, rate1: float, name: str) -> np.ndarray:
    """The launcher's ripcord: clicks that accelerate (rate0 -> rate1 per second) and get louder."""
    n = ns(dur)
    out = np.zeros((2, n + ns(0.012)))
    r = rng(name)
    lr = np.log(rate1 / rate0)
    m = ns(0.012)
    tt = secs(m)
    k = 0
    while True:
        tk = dur * np.log(1.0 + k * lr / (rate0 * dur)) / lr
        if tk > dur - 0.01:
            break
        x = tk / dur
        burst = r.standard_normal(m) * np.exp(-tt / 0.0007)
        ping = np.sin(2 * np.pi * (3100 + 600 * r.random()) * tt) * np.exp(-tt / 0.0025)
        low = np.sin(2 * np.pi * 950 * tt) * np.exp(-tt / 0.0035)
        i = ns(tk)
        out[:, i: i + m] += pan_mono((0.8 * burst + 0.6 * ping + 0.5 * low) * (0.35 + 0.65 * x ** 1.2), 0.35 * np.sin(k * 1.7))
        k += 1
    out = filt(out[:, :n], lambda f: m_hp(f, 700, 2) * m_lp(f, 11000, 2))
    return fade_edges(normalize(out), 0.002, 0.006)


def make_riser(length: float, root: int, name: str) -> np.ndarray:
    """Lead-in that peaks on its last sample (the impact): a band-pass noise sweep, a reverse crash,
    a rising spin whine, and three saws gliding up an octave onto the hit's root."""
    n = ns(length)
    t = secs(n)
    x = t / length
    noise = rng(name).standard_normal((2, n))
    sweep = tv_filter(noise, lambda tc, f: m_band(f, 450.0 * (11000.0 / 450.0) ** np.clip(tc / length, 0, 1) ** 1.3, 1.0),
                      512, 64)
    sweep = normalize(sweep) * (0.3 + 0.7 * x ** 1.6)
    rc = reverse_crash(length, zlib.crc32(name.encode()))
    whine = spin_whine(length, name + "w")
    f = hz(root) * 2.0 ** (x ** 1.4)
    tab = wavetable(saw_amps(hz(root + 12), 7000.0, 12000.0))
    glide = sum(pan_mono(wt_play(tab, np.cumsum(f * 2 ** (c / 1200)) / SR + 0.31 * j), p)
                for j, (c, p) in enumerate(((-12, -0.6), (0, 0.0), (12, 0.6))))
    glide = tv_filter(glide, lambda tc, fr: m_lp(fr, 500.0 * 12.0 ** np.clip(tc / length, 0, 1), 2), 512, 64)
    glide = normalize(glide) * (0.15 + 0.85 * x ** 1.4)
    mix = 0.55 * sweep + 0.6 * rc + 0.35 * whine + 0.45 * glide
    return fade_edges(normalize(mix), 0.005, 0.005)


def make_pickup(length: float, name: str) -> np.ndarray:
    """Short build into a groove re-entry: reverse crash and a noise sweep, peaking on the last sample."""
    n = ns(length)
    t = secs(n)
    noise = rng(name).standard_normal((2, n))
    sweep = tv_filter(noise, lambda tc, f: m_band(f, 900.0 * 11.0 ** np.clip(tc / length, 0, 1), 1.0), 512, 64)
    sweep = normalize(sweep) * (t / length) ** 2
    return fade_edges(normalize(0.7 * reverse_crash(length, zlib.crc32(name.encode())) + 0.5 * sweep), 0.005, 0.005)


def roll_times(t0: float, t1: float, first: float = STEP, last: float = 0.028) -> list[float]:
    """An accelerating snare roll from t0 (one 16th apart) towards t1 (28 ms apart), stopping 30 ms short."""
    times, t = [], t0
    while t < t1 - 0.03:
        times.append(t)
        x = (t - t0) / max(t1 - t0, 1e-6)
        t += first * (last / first) ** x
    return times


# ---------------------------------------------------------------- tonal instruments -----------
def ks_string(f0: float, n: int, seed: str, sustain: float, bright: float, pick: float = 0.17) -> np.ndarray:
    """Karplus-Strong plucked string, computed one period per numpy step (no per-sample loop)."""
    L = max(8, int(round(SR / f0 - 0.5)))
    r = rng(seed)
    exc = r.uniform(-1.0, 1.0, L)
    exc = filt(exc, lambda f: m_lp(f, 900.0 + 7000.0 * bright, 1), pad=L)
    p = max(1, int(L * pick))
    exc = exc - np.concatenate([np.zeros(p), exc[:-p]])          # pick position comb
    y = np.zeros(n + 1)                                            # y[i + 1] holds sample i
    m0 = min(L, n)
    y[1: m0 + 1] = exc[:m0]
    g = 0.5 * sustain
    for s in range(L, n, L):
        e = min(s + L, n)
        y[s + 1: e + 1] = g * (y[s - L + 1: e - L + 1] + y[s - L: e - L])
    return y[1:]


def CAB(f):
    """A closed 4x12 with a scooped metal voicing."""
    return (m_hp(f, 85, 2) * m_lp(f, 5200, 4) * m_bell(f, 115, 3.0, 0.7) * m_bell(f, 470, -5.0, 1.0)
            * m_bell(f, 2500, 3.5, 0.8))


@functools.lru_cache(maxsize=None)
def guitar(root: int, dur: float, mute: bool, seed: str) -> np.ndarray:
    """A power chord (root, fifth, octave) on Karplus-Strong strings through a two-stage overdrive and
    a cabinet curve, double-tracked: take 1 left, take 2 right. Palm-muted when `mute`."""
    n = ns(dur)
    t = secs(n)
    takes = []
    for take in range(2):
        x = np.zeros(n)
        for k, (iv, g) in enumerate(((0, 1.0), (7, 0.8), (12, 0.55))):
            det = 1.0 + (0.0011 if take else -0.0011) * (1 + 0.5 * k)
            x += g * ks_string(hz(root + iv) * det, n, f"{seed}{take}{k}",
                               sustain=0.94 if mute else 0.9975, bright=0.3 if mute else 0.7)
        if mute:
            x *= np.exp(-t / 0.05)
        x = filt(x, lambda f: m_hp(f, 110, 2) * m_bell(f, 800, 9.0, 1.4))
        x /= np.max(np.abs(x)) + 1e-12
        y = np.tanh(24.0 * x + 0.25) - np.tanh(0.25)
        y = np.tanh(1.8 * filt(y, lambda f: m_hp(f, 70, 1) * m_lp(f, 9000, 1)))
        y = filt(y, CAB)
        if mute:
            y *= np.exp(-np.maximum(t - 0.02, 0) / 0.06)
        takes.append(y)
    out = np.stack([0.95 * takes[0] + 0.12 * takes[1], 0.95 * takes[1] + 0.12 * takes[0]])
    return frozen(fade_edges(normalize(out), 0.0004, 0.01))


@functools.lru_cache(maxsize=None)
def synth_stab(notes: tuple, dur: float, name: str, drive: float = 2.2, close: float = 0.15) -> np.ndarray:
    """Distorted supersaw chord whose filter slams shut as it rings (the chord colour of the hits)."""
    n = ns(dur)
    t = secs(n)
    r = rng(name)
    out = np.zeros((2, n))
    for m in notes:
        f0 = hz(m)
        tab = wavetable(saw_amps(f0, 9000.0, 15000.0))
        for cents, p in ((-14, -0.8), (-5, -0.3), (5, 0.3), (14, 0.8)):
            out += pan_mono(wt_play(tab, f0 * 2 ** (cents / 1200) * t + r.random()), p)
    out = np.tanh(drive * out / (len(notes) * 4)) / np.tanh(drive)
    out = tv_filter(out, lambda tc, f: m_lp(f, 700.0 + 7500.0 * np.exp(-np.maximum(tc, 0) / close), 2) * m_hp(f, 150, 2),
                    2048, 256)
    env = (1 - np.exp(-t / 0.002)) * (0.3 + 0.7 * np.exp(-t / 0.22))
    return frozen(fade_edges(out * env, 0.0, 0.02))


def pad_chord(notes, dur: float, att: float, cutoff: float, name: str, pitch: np.ndarray | None = None) -> np.ndarray:
    n = ns(dur)
    t = secs(n)
    r = rng(name)
    pm = np.ones(n) if pitch is None else pitch
    out = np.zeros((2, n))
    for m in notes:
        f0 = hz(m)
        tab = wavetable(saw_amps(f0, cutoff, 9000.0))
        for cents, p in ((-10.0, -0.75), (0.0, 0.0), (10.0, 0.75)):
            out += pan_mono(wt_play(tab, np.cumsum(f0 * 2 ** (cents / 1200.0) * pm) / SR + r.random()), p)
    return out * np.minimum(1.0, t / att) / (len(notes) * 3)


@functools.lru_cache(maxsize=None)
def cowbell(m: int, slow: float = 1.0) -> np.ndarray:
    """The phonk cowbell (808-style: two square waves a ~fifth apart through a band-pass). slow=2 is
    the same bell on tape at half speed: an octave down and twice as long."""
    n = ns(0.42 * slow)
    t = secs(n)
    f1 = hz(m)
    f2 = f1 * 1.4815
    v = (0.75 * wt_play(wavetable(square_amps(f1, 14000.0)), f1 * t)
         + 0.42 * wt_play(wavetable(square_amps(f2, 14000.0)), f2 * t + 0.3))
    env = (0.72 * np.exp(-t / (0.05 * slow)) + 0.28 * np.exp(-t / (0.22 * slow))) * (1 - np.exp(-t / 0.0007))
    # the fundamental leads (the riff must read as a melody); the flat fifth above is the 808 colour
    v = filt(v * env, lambda f: m_hp(f, f1 * 0.7, 2) * m_lp(f, f2 * 2.6, 2) * m_bell(f, f1, 2.5, 0.5))
    return frozen(fade_edges(np.tanh(1.6 * normalize(v)), 0.0003, 0.04))


@functools.lru_cache(maxsize=None)
def bell(m: int, dur: float = 0.7) -> np.ndarray:
    """FM bell (inharmonic 3.5 ratio), the metallic voice of the GEAR//DROP sonic logo."""
    n = ns(dur)
    t = secs(n)
    f = hz(m)
    idx = 3.0 * np.exp(-t / 0.07) + 0.5
    v = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 3.5 * f * t)) * np.exp(-t / 0.22)
    v += 0.45 * np.sin(2 * np.pi * 2 * f * t + 0.5) * np.exp(-t / 0.10)
    return frozen(fade_edges(v * (1 - np.exp(-t / 0.0008)), 0.0, 0.05))


# ---------------------------------------------------------------- the 808 ---------------------
def render_808(events: list[dict], n_total: int) -> np.ndarray:
    """One continuous, phase-continuous 808 voice. Each event: t0, t1, m (midi), slide (glide from
    the previous note without retriggering), knock (pitch drop on the attack), attack, tau (decay),
    dive (tape-stop semitones over the last dive_len seconds), gain."""
    evs = sorted(events, key=lambda e: e["t0"])
    freq = np.full(n_total, hz(31))
    amp = np.zeros(n_total)
    prev_level, prev_f = 0.0, hz(31)
    for k, ev in enumerate(evs):
        i0, i1 = ns(ev["t0"]), min(n_total, ns(ev["t1"]))
        if i1 <= i0:
            continue
        tt = secs(i1 - i0)
        ft = hz(ev["m"])
        tau = ev.get("tau", 0.7)
        if ev.get("slide") and prev_level > 1e-3:
            f = ft * (prev_f / ft) ** np.exp(-tt / 0.05)
            a = prev_level * np.exp(-tt / tau)
        else:
            f = ft * (1.0 + ev.get("knock", 0.8) * np.exp(-tt / 0.011))
            r = np.clip(tt / max(ev.get("attack", 0.003), 0.003), 0.0, 1.0)
            a = prev_level * (1.0 - r) + r * np.exp(-tt / tau)
        if ev.get("dive"):
            f = f * tape_curve(i1 - i0, ev["dive_len"], ev["dive"])
        a = a * ev.get("gain", 1.0)
        legato = k + 1 < len(evs) and abs(evs[k + 1]["t0"] - ev["t1"]) < 0.002
        if not legato:
            rl = min(ns(0.008), len(a))
            a[-rl:] *= np.linspace(1.0, 0.0, rl)
        freq[i0:i1] = f
        amp[i0:i1] = a
        prev_level, prev_f = (float(a[-1]), float(f[-1])) if legato else (0.0, float(f[-1]))
    ph = np.cumsum(freq) / SR
    x = np.sin(2 * np.pi * ph)
    clean = x * amp
    dirty = np.tanh(4.0 * amp * (x + 0.2 * np.sin(4 * np.pi * ph + 0.3)))
    dirty = filt(dirty, lambda f: m_hp(f, 90, 2) * m_lp(f, 3500, 2))
    return clean + 0.45 * dirty


# ---------------------------------------------------------------- space -----------------------
def make_ir(rt60: float, length: float, predelay: float, name: str) -> np.ndarray:
    """Stereo hall: decorrelated noise with frequency-dependent decay and a few early taps."""
    n = ns(length)
    t = secs(n)
    noise = rng(name).standard_normal((2, n))
    spec = np.fft.rfft(noise, axis=-1)
    f = np.fft.rfftfreq(n, 1.0 / SR)
    ir = np.zeros((2, n))
    edges = [0.0, 350.0, 1400.0, 4500.0, 24000.0]
    for lo, hi, mult in zip(edges[:-1], edges[1:], [1.0, 1.0, 0.72, 0.42]):
        mask = m_hp(f, max(lo, 1.0), 4) * m_lp(f, hi, 4) if lo > 0 else m_lp(f, hi, 4)
        ir += np.fft.irfft(spec * mask, n, axis=-1) * np.exp(-6.9078 * t / (rt60 * mult))
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


# ---------------------------------------------------------------- music data ------------------
# The riff: (16th, length in 16ths, midi) over two bars of G minor, a 3+1+2+2 cell answered in
# bar 2, which lifts to C and turns on F#, the leading tone back to G. Played on the cowbell.
RIFF = [
    [(0, 3, 79), (3, 1, 74), (4, 2, 79), (6, 2, 82), (8, 3, 81), (11, 1, 79), (12, 2, 77), (14, 2, 74)],
    [(0, 3, 79), (3, 1, 74), (4, 2, 79), (6, 2, 82), (8, 3, 84), (11, 1, 82), (12, 2, 81), (14, 2, 78)],
]
# The 808 line: (16th, midi, slide). Bar 1 sits on G and slides up an octave at the end; bar 2
# slides back down on the downbeat and turns G - C - D (slide), into the next G.
BASSLINE = [
    [(0, 31, False), (14, 43, True)],
    [(0, 31, True), (8, 36, False), (12, 38, True)],
]
KICKS = (0, 3, 6, 8, 11, 14)   # 3+3+2 | 3+3+2
CLAPS = (4, 12)
CHORDS = {   # boom (sub boom), bass (bed 808), gtr (power-chord root), triad (stab), pad, tone (clang, glide, riff root)
    "G": dict(boom=31, bass=31, gtr=43, triad=(55, 58, 62, 67), pad=(43, 50, 55, 58), tone=55, third=3),
    "Eb": dict(boom=27, bass=39, gtr=39, triad=(55, 58, 63, 67), pad=(39, 46, 51, 55), tone=51, third=4),
    "C": dict(boom=36, bass=36, gtr=36, triad=(55, 60, 63, 67), pad=(48, 55, 60, 63), tone=48, third=3),
    "D": dict(boom=26, bass=38, gtr=38, triad=(54, 57, 62, 66), pad=(38, 45, 50, 54), tone=50, third=4),
    "Ab": dict(boom=32, bass=32, gtr=44, triad=(56, 60, 63, 68), pad=(44, 51, 56, 60), tone=56, third=4),
}
PHRASES = {1: ["D"], 2: ["G", "D"], 3: ["G", "Ab", "D"], 4: ["G", "Eb", "C", "D"], 5: ["G", "Eb", "C", "Ab", "D"]}


def phrase_chords(k: int, resolve: bool) -> list[str]:
    """Chords for a run of k hits: start on G, end on D (the dominant) when a groove in G follows,
    or on G when the reel ends on that hit."""
    names = list(PHRASES.get(k) or (["G"] + (["Eb", "C", "Ab", "Bb"] * k)[: k - 2] + ["D"]))
    if resolve:
        names[-1] = "G"
    return [n if n in CHORDS else "Eb" for n in names]


def bass_at(bar: int, s: int) -> tuple[int, bool, bool]:
    """(midi, slide, changes here) of the 808 line at 16th s of a bar."""
    line = BASSLINE[bar % 2]
    m, slide, change = line[0][1], False, False
    for st, mm, sl in line:
        if st <= s:
            m, slide, change = mm, sl, st == s
    return m, slide and change, change


def gtr_root(m: int) -> int:
    """The bass note's pitch class as a guitar power-chord root between C2 and B2."""
    return 36 + (m - 36) % 12


# ---------------------------------------------------------------- the plan --------------------
def make_plan(tl: dict) -> dict:
    dur = float(tl["duration"])
    n = int(round(dur * SR))
    shots = []
    for k, s in enumerate(sorted(tl["shots"], key=lambda s: float(s["start"]))):
        shots.append(dict(i=k, start=float(s["start"]), end=min(float(s["end"]), dur), kind=str(s.get("kind", "fast"))))
    raw = tl.get("hits")
    source = "hits"
    if not raw:
        raw, source = tl.get("impacts") or [], "impacts"
    hits = sorted({round(float(h), 4) for h in raw if 0.1 <= float(h) <= dur - 0.15})

    def shot_at(t: float) -> dict:
        for s in shots:
            if s["start"] - 1e-3 <= t < s["end"] - 1e-3:
                return s
        return shots[-1]

    # groove runs: maximal runs of consecutive fast shots; the last one plays to the end
    runs: list[dict] = []
    for s in shots:
        if s["kind"] != "fast":
            continue
        if runs and runs[-1]["last"] == s["i"] - 1:
            runs[-1].update(end=s["end"], last=s["i"])
            runs[-1]["cuts"].append(s["start"])
        else:
            runs.append(dict(start=s["start"], end=s["end"], last=s["i"], cuts=[s["start"]]))
    if runs and runs[-1]["last"] == shots[-1]["i"]:
        runs[-1]["end"] = dur

    hps: list[dict] = []
    for h in hits:
        s = shot_at(h)
        prev = shots[s["i"] - 1] if s["i"] > 0 else None
        if s["kind"] == "slow" and prev is not None and prev["kind"] == "lead":
            lead = prev["start"]
        elif s["kind"] == "lead":
            lead = s["start"]
        else:
            lead = h - 0.3
        lo = hps[-1]["t"] + 0.3 if hps else 0.0
        lead = min(max(lead, lo, h - 0.8), h - 0.12)
        if s["kind"] == "fast":
            end = h                                   # a hit inside the groove: no slow bed
        else:
            end = next((x["start"] for x in shots if x["start"] > h + 0.05 and x["kind"] != "slow"), dur)
        hps.append(dict(t=h, riser=round(lead, 4), bed_end=end, shot=s["i"], shot_kind=s["kind"]))
    for k in range(len(hps) - 1):
        hps[k]["bed_end"] = max(hps[k]["t"], min(hps[k]["bed_end"], hps[k + 1]["riser"]))
    for hp in hps:
        if any(abs(r["start"] - hp["bed_end"]) < 2e-3 for r in runs):
            hp["next"] = "groove"
        elif hp["bed_end"] >= dur - 1e-3:
            hp["next"] = "end"
        else:
            hp["next"] = "lead"

    # chords: a phrase is a run of hits that ends where a groove (or the end) follows
    phrase: list[dict] = []
    for hp in hps:
        phrase.append(hp)
        if hp["next"] in ("groove", "end") or hp is hps[-1]:
            for p, c in zip(phrase, phrase_chords(len(phrase), resolve=hp["next"] == "end")):
                p["chord"] = c
            phrase = []

    # where each groove stops: at the first riser inside it, or at the stinger for the finale
    for r in runs:
        stops = [hp["riser"] for hp in hps if r["start"] + 0.05 < hp["riser"] < r["end"]]
        r["play_end"] = min([r["end"]] + stops)
        r["finale"] = r["end"] >= dur - 1e-3
        r["accents"] = [c for c in r["cuts"] if c < r["play_end"] - 0.05 and all(abs(c - hp["t"]) > 0.03 for hp in hps)]
    stinger = None
    fin = runs[-1] if runs and runs[-1]["finale"] else None
    if tl.get("stinger") is not None:
        stinger = float(tl["stinger"])
    elif fin is not None:
        limit = dur - 0.3
        downs = [fin["start"] + j * BAR * STEP for j in range(1, 64) if fin["start"] + j * BAR * STEP <= limit + 1e-6]
        beats = [fin["start"] + j * 4 * STEP for j in range(1, 256) if fin["start"] + j * 4 * STEP <= limit + 1e-6]
        stinger = downs[-1] if downs else (beats[-1] if beats else None)
    if fin is not None and stinger is not None and fin["start"] < stinger < dur:
        fin["play_end"] = min(fin["play_end"], stinger)
        fin["accents"] = [c for c in fin["accents"] if c < stinger - 0.05]
    return dict(duration=dur, n=n, shots=shots, hits=hps, hit_source=source, runs=runs, stinger=stinger,
                fps=tl.get("fps"))


# ---------------------------------------------------------------- arrangement -----------------
class Mix:
    def __init__(self, n: int):
        self.n = n
        self.buses: dict[str, np.ndarray] = {}

    def bus(self, name: str) -> np.ndarray:
        if name not in self.buses:
            self.buses[name] = np.zeros((2, self.n))
        return self.buses[name]

    def add(self, name: str, sig: np.ndarray, t0: float, gain: float = 1.0, pan: float = 0.0):
        b = self.bus(name)
        s = pan_mono(sig, pan) if sig.ndim == 1 else sig
        i0 = ns(t0)
        if i0 < 0:
            s, i0 = s[:, -i0:], 0
        i1 = min(self.n, i0 + s.shape[-1])
        if i1 > i0:
            b[:, i0:i1] += gain * s[:, : i1 - i0]


def render_groove(mx: Mix, run: dict, ev808: list, cues: dict, index: int) -> None:
    A, B = run["start"], run["play_end"]
    finale = run["finale"]
    acc = run["accents"]
    grid = [A + k * STEP for k in range(int((B - A) / STEP + 1e-6) + 1) if A + k * STEP < B - 0.02]

    def snap(t: float) -> float:
        for a in acc:
            if abs(t - a) < SNAP:
                return a
        return t

    def pos(t: float) -> tuple[int, int]:
        return divmod(int(round((t - A) / STEP)), BAR)

    # kicks: the 3+3+2 pattern, a kick on every cut, and a 16th of air before each cut
    kicks = set(round(a, 6) for a in acc)
    for k, t in enumerate(grid):
        if k % BAR in KICKS:
            if any(abs(t - a) < SNAP for a in acc) or any(SNAP <= a - t < 1.5 * STEP for a in acc):
                continue
            kicks.add(round(t, 6))
    kicks = sorted(kicks)
    for t in kicks:
        mx.add("g_kick", make_kick(), t, 1.0)
    cues["kicks"] += kicks
    for k, t in enumerate(grid):
        s = k % BAR
        if s in CLAPS:
            mx.add("g_clap", make_clap(), snap(t), 1.0, pan=0.05)
        vel = 0.8 if s % 4 == 0 else (0.55 if s % 2 == 0 else 0.3)
        mx.add("g_hats", make_hat(False, s % 4), snap(t), vel, pan=0.18)
        if finale and s % 4 == 2:
            mx.add("g_hats", make_hat(True, (k // 4) % 2), t, 0.45, pan=-0.2)
    for a in acc:   # a 32nd-triplet hat roll into every cut
        for j, d in enumerate((0.075, 0.05, 0.025)):
            if a - d > A + 0.02:
                mx.add("g_hats", make_hat(False, j), a - d, 0.32 + 0.14 * j, pan=0.3)

    # the cowbell riff, monophonic (each note chokes the previous one)
    notes = []
    for k, t in enumerate(grid):
        bar, s = divmod(k, BAR)
        for st, ln, m in RIFF[bar % 2]:
            if st == s:
                notes.append((snap(t), ln, m, st))
    for i, (t, ln, m, st) in enumerate(notes):
        nxt = notes[i + 1][0] if i + 1 < len(notes) else B
        d = min(ln * STEP + 0.06, nxt - t + 0.004, B - t)
        mx.add("g_cow", choke(cowbell(m), d, 0.006), t, 1.0 if st in (0, 6, 8) else 0.8, pan=-0.18)

    # the 808: on every kick and wherever the line changes note (slides need no kick)
    times = set(kicks)
    for k, t in enumerate(grid):
        bar, s = divmod(k, BAR)
        if bass_at(bar, s)[2]:
            times.add(round(snap(t), 6))
    times = sorted(t for t in times if t < B - 0.02)
    for i, t in enumerate(times):
        bar, s = pos(t)
        m, slide, _ = bass_at(bar, s)
        t1 = times[i + 1] if i + 1 < len(times) else B
        ev808.append(dict(t0=t, t1=t1, m=m, slide=slide, knock=0.8, tau=0.7, gain=1.0))

    # finale: palm-muted chugs on every kick
    if finale:
        for t in kicks:
            if any(abs(t - a) < 1e-6 for a in acc):
                continue
            bar, s = pos(t)
            mx.add("g_gtr", guitar(gtr_root(bass_at(bar, s)[0]), 0.2, True, f"chug{s % 3}"), t, 0.8)

    # accents on the cuts
    for i, a in enumerate(acc):
        bar, s = pos(a)
        root = gtr_root(bass_at(bar, s)[0])
        big = abs(a - A) < 1e-6
        cues["accents"].append(dict(t=round(a, 4), kind="big" if big else "cut"))
        if big:
            mx.add("g_crash", crash(index), a, 1.0)
            mx.add("g_stab", synth_stab(CHORDS["G"]["triad"], 0.5, "bigstab"), a, 1.0)
            mx.add("g_gtr", guitar(root, 0.55, False, f"bigg{index}") * np.exp(-secs(ns(0.55)) / 0.22), a, 1.0)
            mx.add("g_whine", spin_whine(0.6, f"launch{index}", 520.0, 1568.0, "launch"), a, 1.0)
        else:
            mx.add("g_crash", crash(i + 1, 1.2), a, 0.7, pan=0.3 if i % 2 else -0.3)
            g = guitar(root, 0.3, False, f"accg{i % 2}") * np.exp(-secs(ns(0.3)) / 0.09)
            mx.add("g_gtr", g, a, 0.9)
            if i % 2 == 1:
                mx.add("g_clap", make_snare("crack"), a, 0.6, pan=-0.05)


def render_hit(mx: Mix, hp: dict, k: int, total: int, cues: dict) -> None:
    """The impact (hits stem): punch, sub boom, crash, metal clang, distorted chord stab."""
    H, E = hp["t"], hp["bed_end"]
    ch = CHORDS[hp["chord"]]
    size = 0.82 + 0.18 * (k / max(1, total - 1))
    ring = max(E - H, 0.25)
    mx.add("h_punch", make_kick(48.0, 190.0, 0.12, 0.45, "punch"), H, size)
    boom = make_boom(round(min(ring + 0.15, 1.6), 3), 150.0, hz(ch["boom"]), round(min(0.55, 0.4 * ring + 0.1), 3))
    mx.add("h_boom", choke(boom, ring, 0.02), H, size)
    mx.add("h_crash", choke(crash(k), ring, 0.04), H, size)
    mx.add("h_clang", make_clang(hz(ch["tone"]), f"clang{k}"), H, size)
    gd = round(ring + 0.02, 3)
    g = guitar(ch["gtr"], gd, False, f"hitg{k}")
    gt = secs(g.shape[-1])
    g = tv_filter(g * (0.35 + 0.65 * np.exp(-gt / 0.5)), lambda tc, f: m_lp(f, 1200.0 + 7000.0 * np.exp(-np.maximum(tc, 0) / 0.3), 2),
                  2048, 256)
    mx.add("h_gtr", choke(g, ring, 0.015), H, size)
    mx.add("h_stab", choke(synth_stab(ch["triad"], round(ring + 0.05, 3), f"hstab{k}"), ring, 0.015), H, size)
    cues["hits"].append(dict(t=H, chord=hp["chord"]))


def render_bed(mx: Mix, hp: dict, ev808: list, k: int) -> None:
    """The slow motion (music stem): 808 swell that tape-stops, muffled pad, the riff head on a cowbell
    slowed to half speed, and a heavy snare on the half-time backbeat when there is room."""
    H, E = hp["t"], hp["bed_end"]
    L = E - H
    if L < 0.2:
        return
    ch = CHORDS[hp["chord"]]
    dive = min(0.22, 0.3 * L)
    ev808.append(dict(t0=H, t1=E, m=ch["bass"], attack=0.12, tau=2.2, knock=0.0, dive=7.0, dive_len=dive, gain=1.15))
    n = ns(L)
    pad = pad_chord(ch["pad"], L, 0.15, 2000.0, f"bedpad{k}", pitch=tape_curve(n, dive, 7.0))
    pad = filt(pad, lambda f: m_lp(f, 700, 2) * m_hp(f, 90, 2))
    mx.add("bed_pad", fade_edges(pad, 0.005, 0.02), H, 1.0)
    shift = ((ch["tone"] % 12 - 7 + 6) % 12) - 6         # transpose the riff head from G
    head = [(0.0, 67 + shift), (0.6, 62 + shift), (0.8, 67 + shift), (1.2, 67 + shift + ch["third"])]
    pk = [x for x in head if H + x[0] < E - 0.08]
    for j, (dt, m) in enumerate(pk):
        nxt = pk[j + 1][0] if j + 1 < len(pk) else L
        mx.add("bed_cow", choke(cowbell(m, 2.0), min(nxt - dt, 0.8), 0.01), H + dt, 1.0 if j == 0 else 0.85, pan=-0.15)
    if hp["next"] != "groove" and H + 2 * BEAT <= E - 0.15:
        mx.add("bed_snare", make_snare("snare_big", big=True), H + 2 * BEAT, 1.0)


def arrange(plan: dict) -> tuple[dict, dict]:
    n, dur = plan["n"], plan["duration"]
    mx = Mix(n)
    cues: dict = dict(kicks=[], accents=[], hits=[], risers=[], beds=[], pickups=[], stinger=None)
    ev808: list[dict] = []
    gate = np.zeros(n)
    for i, run in enumerate(plan["runs"]):
        render_groove(mx, run, ev808, cues, i)
        i0, i1 = max(0, ns(run["start"] - 0.004)), ns(run["play_end"])
        gate[i0:i1] = 1.0
        f = ns(0.008)
        gate[i1 - f: i1] = np.minimum(gate[i1 - f: i1], np.linspace(1.0, 0.0, f))
        r = min(ns(0.003), i0)
        gate[i0 - r: i0] = np.maximum(gate[i0 - r: i0], np.linspace(0.0, 1.0, r, endpoint=False))
    for name in [b for b in mx.buses if b.startswith("g_")]:
        mx.buses[name] *= gate

    hits = plan["hits"]
    for k, hp in enumerate(hits):
        H, L = hp["t"], hp["riser"]
        mx.add("r_fx", make_riser(H - L, CHORDS[hp["chord"]]["tone"], f"riser{k}"), L, 1.0)
        rt = roll_times(L, H)
        for j, t in enumerate(rt):   # the first hit marks the cut into the lead shot, then the roll builds
            vel = 0.8 if j == 0 else 0.4 + 0.55 * (j / max(1, len(rt) - 1)) ** 1.3
            mx.add("r_snare", make_snare(), t, vel, pan=0.1 * (-1) ** j)
        cues["risers"].append(dict(start=L, peak=H, rolls=[round(t, 4) for t in rt]))
        render_hit(mx, hp, k, len(hits), cues)
        render_bed(mx, hp, ev808, k)
        cues["beds"].append(dict(start=H, end=hp["bed_end"], chord=hp["chord"], next=hp["next"]))
        if hp["next"] == "groove":
            P, E = max(H + 0.45, hp["bed_end"] - 0.3), hp["bed_end"]
            if E - P > 0.1:
                mx.add("pickup", make_pickup(E - P, f"pickup{k}"), P, 1.0)
                for j, t in enumerate(roll_times(P, E, 0.05)):
                    mx.add("r_snare", make_snare(), t, 0.3 + 0.4 * j / 6, pan=0.1 * (-1) ** j)
                cues["pickups"].append(dict(start=round(P, 4), end=E))

    # the final stinger and the pickup that loops into 0.00
    S = plan["stinger"]
    if S is not None:
        room = dur - S
        mx.add("st_kick", make_kick(48.0, 190.0, 0.12, 0.45, "punch"), S, 1.0)
        mx.add("st_boom", choke(make_boom(0.9, 150.0, hz(31), 0.32), room - 0.06, 0.04), S, 1.0)
        mx.add("st_crash", choke(crash(2), room - 0.02, 0.15), S, 1.0)
        mx.add("st_clang", make_clang(hz(55), "stclang"), S, 1.0)
        g = guitar(43, 0.9, False, "stgtr")
        mx.add("st_gtr", choke(g * np.exp(-secs(g.shape[-1]) / 0.35), room - 0.02, 0.02), S, 1.0)
        mx.add("st_stab", choke(synth_stab((55, 58, 62, 67, 70), 0.9, "ststab"), room - 0.02, 0.02), S, 1.0)
        mx.add("st_bell", bell(79), S, 1.0, pan=-0.2)
        mx.add("st_bell", bell(86), S + 0.002, 0.6, pan=0.25)
        cues["stinger"] = S
    P = dur - LOOP_PICKUP
    mx.add("loop_fx", make_pickup(LOOP_PICKUP, "looprev"), P, 1.0)
    mx.add("loop_fx", make_ratchet(LOOP_PICKUP, 25.0, 110.0, "loopratchet"), P, 0.8)
    for j, t in enumerate(roll_times(P, dur, 0.05)):
        mx.add("loop_snare", make_snare(), t, 0.3 + 0.5 * j / 6, pan=0.1 * (-1) ** j)
    cues["pickups"].append(dict(start=round(P, 4), end=dur, loop=True))

    mx.add("b808", render_808(ev808, n), 0.0, 1.0)
    return mx.buses, cues


# ---------------------------------------------------------------- mix -------------------------
LEVELS = {  # linear gains into the stems
    "g_kick": 0.80, "g_clap": 0.56, "g_hats": 0.30, "g_cow": 0.36, "g_gtr": 0.36, "g_crash": 0.30,
    "g_stab": 0.32, "g_whine": 0.16, "b808": 0.36,
    "r_fx": 0.72, "r_snare": 0.55, "pickup": 0.55, "loop_fx": 0.50, "loop_snare": 0.42,
    "bed_pad": 0.70, "bed_cow": 0.36, "bed_snare": 0.62,
    "st_kick": 0.85, "st_boom": 0.55, "st_crash": 0.34, "st_clang": 0.28, "st_gtr": 0.40, "st_stab": 0.36,
    "st_bell": 0.14,
    "h_punch": 1.05, "h_boom": 0.70, "h_crash": 0.45, "h_clang": 0.38, "h_gtr": 0.50, "h_stab": 0.43,
}
EQ = {
    "g_kick": lambda f: m_hp(f, 30, 2) * m_bell(f, 3800, 2.0, 0.6),
    "g_clap": lambda f: m_hp(f, 150, 2) * m_bell(f, 400, -2.0, 0.8),
    "g_hats": lambda f: m_hp(f, 6000, 2),
    "g_cow": lambda f: m_hp(f, 350, 2) * m_lp(f, 9000, 2),
    "g_gtr": lambda f: m_hp(f, 90, 2),
    "g_crash": lambda f: m_hp(f, 2500, 2),
    "g_stab": lambda f: m_hp(f, 160, 2),
    "b808": lambda f: m_hp(f, 28, 2) * m_lp(f, 4000, 2),
    "r_fx": lambda f: m_hp(f, 180, 2),
    "pickup": lambda f: m_hp(f, 300, 2),
    "loop_fx": lambda f: m_hp(f, 300, 2),
    "bed_cow": lambda f: m_hp(f, 200, 2) * m_lp(f, 2600, 2),
    "h_punch": lambda f: m_hp(f, 28, 2),
    "h_boom": lambda f: m_hp(f, 24, 2) * m_lp(f, 400, 2),
    "h_crash": lambda f: m_hp(f, 2500, 2),
    "h_gtr": lambda f: m_hp(f, 80, 2),
    "st_boom": lambda f: m_hp(f, 24, 2) * m_lp(f, 400, 2),
    "st_crash": lambda f: m_hp(f, 2500, 2),
}
REVERB_SENDS = {
    "g_clap": 0.14, "g_cow": 0.28, "g_gtr": 0.06, "g_crash": 0.10, "g_stab": 0.40, "g_whine": 0.25,
    "r_fx": 0.20, "r_snare": 0.20, "pickup": 0.15, "bed_pad": 0.30, "bed_cow": 0.60, "bed_snare": 0.60,
    "st_crash": 0.15, "st_clang": 0.35, "st_gtr": 0.20, "st_stab": 0.45, "st_bell": 0.50,
    "h_crash": 0.15, "h_clang": 0.35, "h_gtr": 0.22, "h_stab": 0.50,
}
DELAY_SENDS = {"g_cow": 0.30, "bed_cow": 0.40}
REVERB_RETURN = 0.30
DELAY_RETURN = 0.28


def is_hit_bus(name: str) -> bool:
    return name.startswith("h_")


def mixdown(buses: dict, n: int) -> tuple[np.ndarray, np.ndarray, dict]:
    """Two stems: the music (everything but the impacts) and the hits, each with its own reverb."""
    pre: dict[str, np.ndarray] = {}
    rev_in = {False: np.zeros((2, n)), True: np.zeros((2, n))}
    dly_in = np.zeros((2, n))
    for name, x in buses.items():
        y = filt_sparse(x, EQ[name]) if name in EQ else x
        act = np.flatnonzero(np.abs(y).max(axis=0) > 0)
        if len(act) == 0:
            continue
        a, b = act[0], act[-1] + 1
        seg = y[:, a:b] * LEVELS.get(name, 1.0)
        out = np.zeros((2, n))
        out[:, a:b] = seg
        pre[name] = out
        if REVERB_SENDS.get(name):
            rev_in[is_hit_bus(name)][:, a:b] += seg * REVERB_SENDS[name]
        if DELAY_SENDS.get(name):
            dly_in[:, a:b] += seg * DELAY_SENDS[name]
    dly = pingpong(dly_in, 3 * STEP, 0.38, 5)
    rev_in[False] += dly * 0.25
    for hit, ir in ((False, make_ir(1.6, 2.0, 0.012, "ir_music")), (True, make_ir(2.3, 2.6, 0.018, "ir_hits"))):
        r = filt(rev_in[hit], lambda f: m_hp(f, 300, 2) * m_lp(f, 9000, 2))
        pre["rev_hits" if hit else "rev_music"] = fftconv(r, ir)[:, :n] * REVERB_RETURN
    pre["delay"] = dly * DELAY_RETURN
    music = sum(v for k, v in pre.items() if not is_hit_bus(k) and k != "rev_hits")
    hits = sum(v for k, v in pre.items() if is_hit_bus(k) or k == "rev_hits")
    return music, hits, pre


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
    c = np.cumsum(np.pad(y ** 2, ((0, 0), (1, 0))), axis=1)
    starts = np.arange(0, y.shape[1] - blk + 1, hop)
    p = ((c[:, starts + blk] - c[:, starts]) / blk).sum(0)
    lk = -0.691 + 10 * np.log10(np.maximum(p, 1e-12))
    g = p[lk > -70]
    if len(g) == 0:
        return -70.0
    rel = -0.691 + 10 * np.log10(np.mean(g)) - 10
    g = p[(lk > -70) & (lk > rel)]
    return float(-0.691 + 10 * np.log10(np.mean(g)))


def oversample(x: np.ndarray, factor: int = 4) -> np.ndarray:
    """Band-limited upsampling by zero-padding the spectrum (power-of-two FFT: the file length can
    have large prime factors, which makes a plain FFT slow)."""
    n = x.shape[-1]
    m = _nfft(n + 4096)
    return np.fft.irfft(np.fft.rfft(x, m, axis=-1), m * factor, axis=-1)[..., : n * factor] * factor


def true_peak_db(x: np.ndarray) -> float:
    return float(20 * np.log10(max(np.max(np.abs(oversample(x, 4))), 1e-12)))


def peak_db(x: np.ndarray) -> np.ndarray:
    """Per-sample stereo-linked peak (dB) of the 4x oversampled signal: the limiter's detector."""
    n = x.shape[-1]
    up = np.abs(oversample(x, 4)).max(axis=0).reshape(n, 4).max(axis=1)
    return 20 * np.log10(np.maximum(np.maximum(up, np.roll(up, 1)), 1e-9))


def limiter_gain(pk_db: np.ndarray, gain_db: float, ceiling_db: float, attack: float = 0.002,
                 release_db_s: float = 45.0) -> np.ndarray:
    """Gain envelope (linear) of a lookahead limiter for a signal with detector peak_db() raised by
    gain_db (no recursion: the release is a running maximum in dB with a linear decay)."""
    n = len(pk_db)
    over = np.maximum(0.0, pk_db + gain_db - ceiling_db)
    k = np.arange(n)
    rel = release_db_s / SR
    att = 12.0 / (attack * SR)
    d_rel = np.maximum.accumulate(over + k * rel) - k * rel
    d_att = np.maximum.accumulate((over - k * att)[::-1])[::-1] + k * att
    d = np.maximum(d_rel, d_att)
    w = max(1, ns(0.001))
    hold = np.lib.stride_tricks.sliding_window_view(np.pad(d, (0, w - 1), mode="edge"), w).max(axis=1)
    d = np.convolve(np.pad(hold, (w - 1, 0), mode="edge"), np.ones(w) / w, "valid")
    return 10 ** (-d / 20)


def edge_env(n: int) -> np.ndarray:
    """Raised-cosine fade in and out at the file's edges: it starts and ends on exact zero."""
    env = np.ones(n)
    f = ns(EDGE_FADE)
    env[:f] = 0.5 * (1 - np.cos(np.pi * np.arange(f) / f))
    env[-f:] = 0.5 * (1 + np.cos(np.pi * np.arange(1, f + 1) / f))
    return env


def master_eq(x: np.ndarray) -> np.ndarray:
    return filt(x, lambda f: m_hp(f, 25, 2) * m_bell(f, 4500, 1.2, 1.0) * m_shelf(f, 10000, 1.0))


def master(music: np.ndarray, hits: np.ndarray) -> tuple[dict, dict]:
    """Master the full mix to -14 LUFS with a true-peak limiter, then send each stem through the same
    gain and the same limiter envelope, so the stems add up to the master exactly."""
    m_eq, h_eq = master_eq(music), master_eq(hits)
    full = m_eq + h_eq
    n = full.shape[-1]
    env = edge_env(n)
    # one detector for all three files: whichever is hottest at that instant sets the gain
    pk = np.maximum(peak_db(full), np.maximum(peak_db(m_eq), peak_db(h_eq)))
    gain_db = TARGET_LUFS - lufs(full)
    for _ in range(10):
        gl = 10 ** (gain_db / 20)
        lim = limiter_gain(pk, gain_db, CEILING_DB)
        y = full * gl * lim * env
        lv = lufs(y)
        if abs(lv - TARGET_LUFS) < 0.02:
            break
        gain_db += TARGET_LUFS - lv
    tp = true_peak_db(y)
    trim = 10 ** (min(0.0, CEILING_DB - tp) / 20)
    g = 10 ** (gain_db / 20) * lim * env * trim
    out = {"full": full * g, "nosfx": m_eq * g, "hits": h_eq * g}
    stats = {"master_gain_db": round(gain_db, 2), "max_limiter_reduction_db": round(float(-20 * np.log10(lim.min())), 2),
             "limiter_active_ms": round(float(np.sum(lim < 0.999)) / SR * 1000, 1)}
    return out, stats


def write_wav(path: str, x: np.ndarray) -> None:
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    q = np.ascontiguousarray(np.clip(np.round(x.T * 8388607.0), -8388608, 8388607).astype("<i4"))
    raw = q.view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(raw)


def read_wav(path: str) -> np.ndarray:
    with wave.open(path, "rb") as w:
        ch, sw, n = w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = np.frombuffer(w.readframes(n), np.uint8)
    b = raw.reshape(-1, 3)
    v = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
    v = np.where(v >= 1 << 23, v - (1 << 24), v)
    return (v.reshape(-1, ch).T / 8388608.0).astype(float)


# ---------------------------------------------------------------- analysis --------------------
def ffmpeg_loudness(paths: list[str]) -> list[dict | None]:
    """Integrated loudness and true peak as ffmpeg measures them (ebur128 and loudnorm), all files at once."""
    if not shutil.which("ffmpeg"):
        return [None] * len(paths)
    procs = []
    for path in paths:
        procs.append((subprocess.Popen(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-filter_complex",
                                        "ebur128=peak=true", "-f", "null", "-"], stderr=subprocess.PIPE, text=True),
                      subprocess.Popen(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af",
                                        "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"],
                                       stderr=subprocess.PIPE, text=True)))
    return [_parse_ffmpeg(a.communicate()[1], b.communicate()[1]) for a, b in procs]


def _parse_ffmpeg(ebur: str, ln: str) -> dict:
    out: dict = {}
    s = ebur[ebur.rfind("Summary:"):]
    mi = re.search(r"I:\s+(-?[\d.]+) LUFS", s)
    mp = re.search(r"True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS", s)
    ml = re.search(r"LRA:\s+(-?[\d.]+) LU", s)
    if mi:
        out["ebur128_I_lufs"] = float(mi.group(1))
    if mp:
        out["ebur128_true_peak_dbtp"] = float(mp.group(1)) if mp.group(1) != "-inf" else None
    if ml:
        out["ebur128_LRA_lu"] = float(ml.group(1))
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", ln, re.S)
    if m:
        j = json.loads(m.group(0))
        out["loudnorm_input_i"] = float(j["input_i"])
        out["loudnorm_input_tp"] = float(j["input_tp"])
    return out


ONSET_BANDS = ((30.0, 200.0, 0.025), (200.0, 2500.0, 0.005), (2500.0, 16000.0, 0.002))


def onset_strength(x: np.ndarray, hop: int = 48) -> np.ndarray:
    """Energy-envelope onset strength at 1 ms resolution, in three bands (each with an energy window
    long enough for its lowest frequency, so a bass wave does not read as a string of onsets): the
    rise of each band's log energy over 4 ms, summed. Each band's floor sits 60 dB under its
    loudest moment, so near-silence does not make onsets."""
    m = x.mean(axis=0) if x.ndim == 2 else x
    o = 0.0
    for lo, hi, win in ONSET_BANDS:
        y = filt(m, lambda f, lo=lo, hi=hi: m_hp(f, lo, 2) * m_lp(f, hi, 2))
        w = ns(win)
        c = np.cumsum(np.concatenate([[0.0], y ** 2]))
        idx = np.arange(0, len(y), hop)
        a, b = np.clip(idx - w // 2, 0, len(y)), np.clip(idx + w // 2, 0, len(y))
        e = (c[b] - c[a]) / w
        le = 10 * np.log10(e + e.max() * 1e-6 + 1e-20)
        d = np.zeros_like(le)
        d[4:] = np.maximum(0.0, le[4:] - le[:-4])
        o = o + d
    return o


def match_onsets(o: np.ndarray, expected: list[float], hop: int = 48, window: float = 0.04) -> list[dict]:
    """For every expected time, the strongest onset within +-40 ms and its error. The onset is the
    middle of the log-energy rise, so a hit that starts exactly on time reads about +2 ms."""
    res = []
    for t in expected:
        a, b = max(0, int((t - window) * SR / hop)), min(len(o), int((t + window) * SR / hop) + 1)
        i = a + int(np.argmax(o[a:b]))
        res.append(dict(expected=round(t, 4), detected=round(i * hop / SR, 4), error_ms=round((i * hop / SR - t) * 1000, 1),
                        rise_db=round(float(o[i]), 1)))
    return res


def detect_onsets(o: np.ndarray, x: np.ndarray, hop: int = 48, thresh_db: float = 6.0, min_gap: float = 0.06,
                  gate_db: float = -30.0) -> list[float]:
    """Peak-picking on the onset strength: rises above thresh_db, at least min_gap apart, where the
    signal (20 ms after the rise) comes within gate_db of its loudest moment."""
    m = x.mean(axis=0)
    w = ns(0.02)
    c = np.cumsum(np.concatenate([[0.0], m ** 2]))
    idx_all = np.arange(len(o)) * hop
    lvl = 10 * np.log10((c[np.clip(idx_all + w, 0, len(m))] - c[np.clip(idx_all, 0, len(m))]) / w + 1e-20)
    lvl -= lvl.max()
    idx = np.where((o[1:-1] > thresh_db) & (o[1:-1] >= o[:-2]) & (o[1:-1] >= o[2:]) & (lvl[1:-1] > gate_db))[0] + 1
    out: list[float] = []
    for i in idx[np.argsort(-o[idx])]:
        t = i * hop / SR
        if all(abs(t - u) >= min_gap for u in out):
            out.append(t)
    return sorted(round(t, 4) for t in out)


def section_levels(x: np.ndarray, sections: list[dict]) -> list[dict]:
    res = []
    for s in sections:
        a, b = ns(s["start"]), ns(s["end"])
        seg = x[:, a:b]
        if seg.shape[1] < ns(0.02):
            continue
        rms = 20 * np.log10(max(np.sqrt(np.mean(seg ** 2)), 1e-12))
        y = k_weight(seg)
        lu = -0.691 + 10 * np.log10(max(np.mean(y ** 2, axis=1).sum(), 1e-12))
        res.append(dict(name=s["name"], start=round(s["start"], 3), end=round(s["end"], 3), rms_dbfs=round(rms, 1),
                        loudness_lufs=round(lu, 1), silent=bool(lu < -40)))
    return res


def quiet_runs(x: np.ndarray, floor_db: float = -50.0, win: float = 0.02) -> list[dict]:
    """Stretches (>= 40 ms) where the 20 ms RMS falls under floor_db, apart from the file's edges."""
    m = x.mean(axis=0)
    w = ns(win)
    k = len(m) // w
    r = 20 * np.log10(np.sqrt(np.mean(m[: k * w].reshape(k, w) ** 2, axis=1)) + 1e-12)
    q = r < floor_db
    out, i = [], 0
    while i < k:
        if q[i]:
            j = i
            while j < k and q[j]:
                j += 1
            if (j - i) * win >= 0.04 and i > 0 and j < k:
                out.append(dict(start=round(i * win, 3), end=round(j * win, 3)))
            i = j
        else:
            i += 1
    return out


def file_checks(x: np.ndarray) -> dict:
    return dict(
        samples=int(x.shape[1]), seconds=round(x.shape[1] / SR, 6),
        lufs_internal=round(lufs(x), 2), true_peak_internal_dbtp=round(true_peak_db(x), 2),
        sample_peak_dbfs=round(float(20 * np.log10(max(np.max(np.abs(x)), 1e-12))), 2),
        clipped_samples=int(np.sum(np.abs(x) >= 0.9999)),
        dc_offset=[float(f"{v:.2e}") for v in x.mean(axis=1)],
        first_sample=[round(float(v), 6) for v in x[:, 0]], last_sample=[round(float(v), 6) for v in x[:, -1]],
    )


# ---------------------------------------------------------------- plots -----------------------
def make_plots(full: np.ndarray, hits: np.ndarray, plan: dict, cues: dict, onsets: dict, wave_png: str, spec_png: str,
               title: str) -> bool:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not installed: no plots")
        return False
    dur = plan["duration"]
    cuts = [s["start"] for s in plan["shots"]] + [plan["shots"][-1]["end"]]
    hit_t = [h["t"] for h in plan["hits"]]
    acc_t = [a["t"] for a in cues["accents"]]
    S = cues["stinger"]

    def marks(ax, labels=False):
        for c in cuts:
            ax.axvline(c, color="#8a8f98", lw=0.8, ls="--", zorder=1)
        for a in acc_t:
            ax.axvline(a, color="#2bb673", lw=1.4, zorder=2)
        for h in hit_t:
            ax.axvline(h, color="#e0245e", lw=1.8, zorder=3)
        if S is not None:
            ax.axvline(S, color="#7b4dff", lw=1.8, zorder=3)
        if labels:
            for k, h in enumerate(hit_t):
                ax.text(h, 1.02, f"H{k + 1}", color="#e0245e", ha="center", va="bottom", fontsize=8,
                        transform=ax.get_xaxis_transform())
            if S is not None:
                ax.text(S, 1.02, "ST", color="#7b4dff", ha="center", va="bottom", fontsize=8, transform=ax.get_xaxis_transform())

    # waveform: the full mix with the hits stem on top, the onset strength, and a zoom on every hit
    mono = full.mean(axis=0)
    hmono = hits.mean(axis=0)
    px = 2000
    k = len(mono) // px
    seg = mono[: k * px].reshape(px, k)
    hseg = hmono[: k * px].reshape(px, k)
    tt = (np.arange(px) + 0.5) * k / SR
    nh = max(1, len(hit_t))
    fig = plt.figure(figsize=(20, 11), dpi=100)
    gs = fig.add_gridspec(3, nh, height_ratios=[2.2, 1.0, 1.4], hspace=0.45, wspace=0.25)
    ax = fig.add_subplot(gs[0, :])
    ax.fill_between(tt, seg.min(1), seg.max(1), color="#3d6fb6", lw=0, label="full mix")
    ax.fill_between(tt, hseg.min(1), hseg.max(1), color="#ff8a3d", alpha=0.75, lw=0, label="hits stem")
    marks(ax, labels=True)
    ax.set_xlim(0, dur)
    ax.set_ylim(-1, 1)
    ax.set_title(title, fontsize=11, pad=16)
    ax.set_xticks(np.arange(0, dur + 0.01, 0.5))
    ax.tick_params(labelsize=8)
    ax.legend(loc="lower left", fontsize=8, ncol=2)
    ax.text(0.995, 0.97, "grey dashed: cuts   green: cut accents   red: impacts   violet: stinger",
            transform=ax.transAxes, ha="right", va="top", fontsize=8)
    ax2 = fig.add_subplot(gs[1, :], sharex=ax)
    o = onsets["curve"]
    ax2.plot(np.arange(len(o)) * 48 / SR, o, color="#333", lw=0.6)
    marks(ax2)
    ax2.set_ylabel("onset (dB rise)", fontsize=8)
    ax2.tick_params(labelsize=8)
    ax2.set_xlabel("seconds", fontsize=8)
    errs = {round(m["expected"], 4): m for m in onsets["hits_full"]}
    for j, h in enumerate(hit_t):
        a3 = fig.add_subplot(gs[2, j])
        i0, i1 = ns(h - 0.08), ns(h + 0.12)
        ts = np.arange(i0, i1) / SR
        a3.plot(ts, mono[i0:i1], color="#3d6fb6", lw=0.6)
        a3.plot(ts, hmono[i0:i1], color="#ff8a3d", lw=0.6, alpha=0.8)
        a3.axvline(h, color="#e0245e", lw=1.4)
        e = errs.get(round(h, 4))
        a3.set_title(f"H{j + 1} {h:.3f}s {plan['hits'][j]['chord']}" + (f"  onset {e['error_ms']:+.1f} ms" if e else ""),
                     fontsize=8)
        a3.set_ylim(-1, 1)
        a3.tick_params(labelsize=6)
    fig.savefig(wave_png)
    plt.close(fig)

    # spectrogram (log frequency) with the same marks
    nfft, hop = 4096, 240
    win = np.hanning(nfft)
    xp = np.pad(mono, (nfft // 2, nfft // 2))
    frames = np.lib.stride_tricks.sliding_window_view(xp, nfft)[::hop]
    S_db = 20 * np.log10(np.abs(np.fft.rfft(frames * win, axis=1)) + 1e-9)
    S_db -= S_db.max()
    f = np.fft.rfftfreq(nfft, 1 / SR)
    lf = np.linspace(np.log10(30), np.log10(20000), 420)        # log-frequency rows
    img = np.stack([np.interp(lf, np.log10(f[1:]), row[1:]) for row in S_db]).T
    fig, ax = plt.subplots(figsize=(20, 7), dpi=100)
    ax.imshow(img, origin="lower", aspect="auto", cmap="magma", vmin=-90, vmax=0,
              extent=(0, frames.shape[0] * hop / SR, lf[0], lf[-1]), interpolation="nearest")
    ticks = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
    ax.set_yticks(np.log10(ticks))
    ax.set_yticklabels([f"{v // 1000}k" if v >= 1000 else str(v) for v in ticks])
    ax.set_xlim(0, dur)
    for c in cuts:
        ax.axvline(c, color="white", lw=0.7, ls="--", alpha=0.7)
    for h in hit_t:
        ax.axvline(h, color="#00e5ff", lw=1.3)
    for a in acc_t:
        ax.axvline(a, color="#7CFC00", lw=1.0)
    if S is not None:
        ax.axvline(S, color="#c9a0ff", lw=1.3)
    ax.set_xticks(np.arange(0, dur + 0.01, 0.5))
    ax.set_xlabel("seconds")
    ax.set_ylabel("Hz")
    ax.set_title("spin-music.wav spectrogram   white dashed: cuts   green: cut accents   cyan: impacts   violet: stinger",
                 fontsize=10)
    fig.tight_layout()
    fig.savefig(spec_png)
    plt.close(fig)
    return True


# ---------------------------------------------------------------- report ----------------------
NOTE_IT = {"G": "sol", "Eb": "mi bemolle", "C": "do", "D": "re", "Ab": "la bemolle", "Bb": "si bemolle", "F": "fa"}


def it_time(t: float) -> str:
    return f"{t:.2f}".replace(".", ",")


def descrizione(plan: dict, cues: dict) -> str:
    """One paragraph in Italian on how the track sounds, written from the plan (times and chords)."""
    hits = plan["hits"]
    runs = plan["runs"]
    fin = runs[-1] if runs and runs[-1]["finale"] else None
    mid = [r for r in runs if r is not fin and r["start"] > 0.05]
    frasi, cur = [], []
    for h in hits:
        cur.append(NOTE_IT.get(h["chord"], h["chord"]))
        if h["next"] != "lead":
            frasi.append(", ".join(cur))
            cur = []
    if cur:
        frasi.append(", ".join(cur))
    p = ("Un phonk duro a 150 BPM in sol minore, tutto sintetizzato. Si apre senza preamboli con un colpo pieno "
         "(crash, power chord di chitarra distorta, cassa e 808) e il fischio metallico di una trottola lanciata, poi "
         "parte il groove: cassa e 808 distorto sul ritmo 3+3+2, clap sul 2 e sul 4, charleston a sedicesimi e il riff "
         "di campanaccio (sol, re, sol, si bemolle, la) che resta in testa; ogni taglio del montaggio cade su un accento "
         "di crash e power chord, con un rullo di charleston che ci porta dentro. ")
    if hits:
        p += (f"Con il primo rallentatore la musica cambia passo: in ogni attacco sale un riser corto (rumore che si "
              f"apre, piatto al contrario, il sibilo della trottola che accelera, synth che salgono di un'ottava e un "
              f"rullante sempre più fitto) e sull'impatto arriva il botto, con sub che scende, cassa, crash, il clang "
              f"metallico delle trottole e un accordo distorto; nel ralenti tutto diventa pesante e ovattato, a metà "
              f"tempo, con l'808 che si gonfia, la testa del riff rallentata di un'ottava, un rullante enorme quando c'è "
              f"spazio e un tape-stop prima del colpo successivo. I {len(hits)} impatti seguono "
              f"{' e poi '.join(frasi)}: la tensione cresce mentre i colpi arrivano sempre più ravvicinati. ")
    if mid:
        p += ("Sullo scatto veloce a " + " e a ".join(it_time(r["start"]) for r in mid)
              + " il groove torna per un attimo, per far respirare la sequenza. ")
    if fin is not None:
        acc = [a for a in fin["accents"] if a > fin["start"] + 0.05]
        p += "Sul finale il groove torna al completo con chitarre palm-muted"
        if acc:
            p += ", accento sul taglio di " + " e di ".join(it_time(a) for a in acc)
        if cues.get("stinger") is not None:
            p += f", stinger finale in sol a {it_time(cues['stinger'])}"
        p += ", e la carica del lanciatore riporta all'inizio, così il reel gira in loop senza stacchi."
    return p


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--timeline", default=os.path.join(here, "..", "timeline.json"))
    ap.add_argument("--out", default="spin-music.wav")
    ap.add_argument("--out-nosfx", default=None, help="default: <out>-nosfx.wav")
    ap.add_argument("--out-hits", default=None, help="default: spin-hits.wav next to --out")
    ap.add_argument("--report", default=None, help="default: report.json next to --out")
    ap.add_argument("--no-plots", action="store_true")
    ap.add_argument("--no-ffmpeg", action="store_true")
    ap.add_argument("--debug-stems", default=None, help="folder for the pre-master buses (optional)")
    args = ap.parse_args()
    t_start = time.time()

    out = args.out
    base, _ = os.path.splitext(out)
    folder = os.path.dirname(os.path.abspath(out))
    out_nosfx = args.out_nosfx or base + "-nosfx.wav"
    stem_name = os.path.basename(base)
    out_hits = args.out_hits or os.path.join(folder, (stem_name.replace("-music", "-hits") if "-music" in stem_name
                                                      else stem_name + "-hits") + ".wav")
    report_path = args.report or os.path.join(folder, "report.json")
    wave_png = base + "-waveform.png"
    spec_png = base + "-spectrogram.png"

    with open(args.timeline) as fh:
        tl = json.load(fh)
    plan = make_plan(tl)
    buses, cues = arrange(plan)
    music, hits, pre = mixdown(buses, plan["n"])
    stems, mstats = master(music, hits)
    write_wav(out, stems["full"])
    write_wav(out_nosfx, stems["nosfx"])
    write_wav(out_hits, stems["hits"])
    t_render = time.time() - t_start
    if args.debug_stems:
        os.makedirs(args.debug_stems, exist_ok=True)
        for name, s in pre.items():
            write_wav(os.path.join(args.debug_stems, f"{name}.wav"), normalize(s, 0.9))

    # ---- checks on the files as written
    files = {"full": out, "nosfx": out_nosfx, "hits": out_hits}
    audio = {k: read_wav(p) for k, p in files.items()}
    checks = {k: file_checks(x) for k, x in audio.items()}
    if not args.no_ffmpeg:
        for k, fm in zip(files, ffmpeg_loudness(list(files.values()))):
            if fm:
                checks[k].update(fm)
    resid = audio["full"] - audio["nosfx"] - audio["hits"]
    o_full = onset_strength(audio["full"])
    o_hits = onset_strength(audio["hits"])
    o_music = onset_strength(audio["nosfx"])
    hit_t = [h["t"] for h in plan["hits"]]
    acc_t = [a["t"] for a in cues["accents"]]
    onsets = dict(
        curve=o_full,
        hits_full=match_onsets(o_full, hit_t),
        hits_stem=match_onsets(o_hits, hit_t),
        accents_full=match_onsets(o_full, acc_t),
        accents_music=match_onsets(o_music, acc_t),
        stinger_full=match_onsets(o_full, [cues["stinger"]]) if cues["stinger"] is not None else [],
        hits_stem_detected=detect_onsets(o_hits, audio["hits"], thresh_db=20.0, min_gap=0.25),
    )
    sections = []
    for r in plan["runs"]:
        sections.append(dict(name="finale groove" if r["finale"] else ("montage" if r["start"] < 0.05 else "groove"),
                             start=r["start"], end=r["play_end"]))
    for k, h in enumerate(plan["hits"]):
        sections.append(dict(name=f"riser {k + 1}", start=h["riser"], end=h["t"]))
        sections.append(dict(name=f"hit {k + 1} ({h['chord']}) first 0.3 s", start=h["t"], end=min(h["t"] + 0.3, h["bed_end"])))
        if h["bed_end"] - h["t"] > 0.35:
            sections.append(dict(name=f"bed {k + 1} after the hit", start=h["t"] + 0.3, end=h["bed_end"]))
    if cues["stinger"] is not None:
        sections.append(dict(name="stinger", start=cues["stinger"], end=plan["duration"] - LOOP_PICKUP))
    sections.append(dict(name="loop pickup", start=plan["duration"] - LOOP_PICKUP, end=plan["duration"]))
    sections.sort(key=lambda s: s["start"])
    levels_full = section_levels(audio["full"], sections)
    levels_music = section_levels(audio["nosfx"], sections)

    all_err = [abs(m["error_ms"]) for m in onsets["hits_full"] + onsets["hits_stem"] + onsets["accents_full"]
               + onsets["stinger_full"]]
    full_c = checks["full"]
    tp_ff = full_c.get("ebur128_true_peak_dbtp")
    i_ff = full_c.get("ebur128_I_lufs")
    verdict = dict(
        duration_exact=full_c["samples"] == plan["n"],
        lufs_ok=abs((i_ff if i_ff is not None else full_c["lufs_internal"]) - TARGET_LUFS) <= 0.5,
        true_peak_ok=(tp_ff if tp_ff is not None else full_c["true_peak_internal_dbtp"]) <= -1.0
        and full_c.get("loudnorm_input_tp", -99) <= -1.0,
        no_clipping=all(c["clipped_samples"] == 0 for c in checks.values()),
        no_dc=all(max(abs(v) for v in c["dc_offset"]) < 1e-3 for c in checks.values()),
        edges_silent=all(max(abs(v) for v in c["first_sample"] + c["last_sample"]) < 1e-3 for c in checks.values()),
        stems_sum_to_full=bool(np.max(np.abs(resid)) < 4.0 / 8388608.0),
        max_onset_error_ms=max(all_err) if all_err else None,
        onsets_ok=bool(all_err) and max(all_err) <= 15.0,
        hits_stem_onsets=len(onsets["hits_stem_detected"]) == len(hit_t),
        no_silent_section=not any(s["silent"] for s in levels_full),
        no_dropouts=len(quiet_runs(audio["full"])) == 0,
    )

    report = dict(
        summary=dict(
            seconds=plan["n"] / SR, bpm=BPM, key="G minor", hit_times=[h["t"] for h in plan["hits"]],
            cut_accents=[a["t"] for a in cues["accents"]], stinger=cues["stinger"],
            lufs_integrated=full_c.get("ebur128_I_lufs", full_c["lufs_internal"]),
            true_peak_dbtp=full_c.get("ebur128_true_peak_dbtp", full_c["true_peak_internal_dbtp"]),
            all_checks_pass=all(v for k, v in verdict.items() if isinstance(v, bool)),
        ),
        title="GEAR//DROP spin reel - original score",
        generator="score.py (numpy synthesis, no samples)",
        timeline=os.path.abspath(args.timeline),
        hit_times_from=plan["hit_source"],
        files=dict(full=os.path.abspath(out), nosfx=os.path.abspath(out_nosfx), hits=os.path.abspath(out_hits),
                   waveform_png=os.path.abspath(wave_png), spectrogram_png=os.path.abspath(spec_png)),
        format=dict(sample_rate=SR, channels=2, bit_depth=24, samples=plan["n"], seconds=plan["n"] / SR,
                    timeline_duration=plan["duration"]),
        tempo=dict(bpm=BPM, beat_s=BEAT, sixteenth_s=STEP, bar_s=BAR * STEP, meter="4/4",
                   note="Steady 150 BPM. Each groove starts its grid on its first cut (0.00, then every re-entry); "
                        "the montage cuts fall on 16ths. Impacts, cut accents and the stinger sit on their exact "
                        "times; grid notes within 55 ms of a cut accent move onto it.",
                   groove_anchors=[round(r["start"], 4) for r in plan["runs"]]),
        key="G minor (harmonic minor colours, Ab as the dark flat-two)",
        riff="cowbell, two bars: G5 D5 G5 Bb5 A5 G5 F5 D5 | G5 D5 G5 Bb5 C6 Bb5 A5 F#5 (3+1+2+2 rhythm)",
        sections=[dict(name=s["name"], start=round(s["start"], 4), end=round(s["end"], 4)) for s in sections],
        stems_note="spin-hits.wav holds only the impact hits (punch, sub boom, crash, metal clang, distorted chord "
                   "stab) and their reverb; risers, snare rolls, slow-motion beds, cut accents, the stinger and the loop "
                   "pickup are music. Both stems share the master gain and limiter envelope: nosfx + hits = full mix.",
        hits=[dict(index=k + 1, time=h["t"], chord=h["chord"], riser_start=h["riser"], riser_s=round(h["t"] - h["riser"], 3),
                   bed_end=h["bed_end"], bed_s=round(h["bed_end"] - h["t"], 3), then=h["next"])
              for k, h in enumerate(plan["hits"])],
        cut_accents=cues["accents"],
        stinger=cues["stinger"],
        loop_pickup=dict(start=round(plan["duration"] - LOOP_PICKUP, 4), end=plan["duration"]),
        snare_rolls=[r["rolls"] for r in cues["risers"]],
        master=dict(target_lufs=TARGET_LUFS, limiter_ceiling_dbtp=CEILING_DB, **mstats),
        loudness=checks,
        stems_sum_max_error=float(np.max(np.abs(resid))),
        onset_check={k: v for k, v in onsets.items() if k != "curve"},
        section_levels_full=levels_full,
        section_levels_nosfx=levels_music,
        quiet_runs_full=quiet_runs(audio["full"]),
        verdict=verdict,
        render_seconds=round(t_render, 2),
        descrizione=descrizione(plan, cues),
    )
    if not args.no_plots:
        title = (f"spin-music.wav  {plan['duration']:.3f} s  150 BPM  "
                 f"{checks['full'].get('ebur128_I_lufs', checks['full']['lufs_internal'])} LUFS  "
                 f"TP {checks['full'].get('ebur128_true_peak_dbtp', checks['full']['true_peak_internal_dbtp'])} dBTP  "
                 f"(hit times from {plan['hit_source']})")
        make_plots(audio["full"], audio["hits"], plan, cues, onsets, wave_png, spec_png, title)
    with open(report_path, "w") as fh:
        json.dump(report, fh, indent=1, ensure_ascii=False)
    print(f"wrote {out}, {out_nosfx}, {out_hits}, {report_path}")
    print(f"render {t_render:.1f} s, total {time.time() - t_start:.1f} s")
    print(json.dumps(dict(full=checks["full"], verdict=verdict, master=mstats), indent=1))


if __name__ == "__main__":
    main()
