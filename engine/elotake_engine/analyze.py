"""Análise do vídeo bruto: metadados, silêncios, cortes de cena e transcrição."""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
from pathlib import Path

from .models import Analysis, MediaInfo, Silence, Transcript, Word

log = logging.getLogger(__name__)


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    log.debug("exec: %s", " ".join(cmd))
    return subprocess.run(cmd, capture_output=True, text=True, check=True)


def probe(path: Path) -> MediaInfo:
    out = run([
        "ffprobe", "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", str(path),
    ]).stdout
    data = json.loads(out)
    video = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
    if video is None:
        raise ValueError(f"{path} não tem trilha de vídeo")
    has_audio = any(s["codec_type"] == "audio" for s in data["streams"])
    num, den = video.get("avg_frame_rate", "30/1").split("/")
    fps = float(num) / float(den) if float(den) else 30.0
    width, height = int(video["width"]), int(video["height"])
    # Vídeos de celular costumam vir com rotação nos metadados.
    rotation = 0
    for sd in video.get("side_data_list", []):
        if "rotation" in sd:
            rotation = abs(int(sd["rotation"]))
    if rotation in (90, 270):
        width, height = height, width
    return MediaInfo(
        duration=float(data["format"]["duration"]),
        width=width,
        height=height,
        fps=round(fps, 3),
        has_audio=has_audio,
    )


_SIL_START = re.compile(r"silence_start: (-?[\d.]+)")
_SIL_END = re.compile(r"silence_end: (-?[\d.]+)")


def detect_silences(path: Path, duration: float, noise_db: float = -35.0, min_len: float = 0.25) -> list[Silence]:
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-vn",
         "-af", f"silencedetect=noise={noise_db}dB:d={min_len}", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    silences: list[Silence] = []
    start: float | None = None
    for line in proc.stderr.splitlines():
        if m := _SIL_START.search(line):
            start = max(0.0, float(m.group(1)))
        elif (m := _SIL_END.search(line)) and start is not None:
            silences.append(Silence(start=start, end=min(duration, float(m.group(1)))))
            start = None
    if start is not None:
        silences.append(Silence(start=start, end=duration))
    return silences


_SCENE = re.compile(r"pts_time:([\d.]+)")


def detect_scenes(path: Path, threshold: float = 0.35) -> list[float]:
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-an",
         "-vf", f"scale=320:-2,select='gt(scene,{threshold})',showinfo", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    return [float(m.group(1)) for m in _SCENE.finditer(proc.stderr)]


def load_audio_16k(path: Path):
    """Decodifica o áudio com o FFmpeg do sistema (mono, 16 kHz, float32), formato que o Whisper espera."""
    import numpy as np

    raw = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(path), "-vn",
         "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def transcribe(path: Path, model_size: str | None = None, language: str | None = None) -> Transcript | None:
    """Transcrição com timestamps por palavra usando faster-whisper (opcional).

    Sem a dependência instalada, o motor segue sem legenda e corta só pelos
    silêncios.
    """
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        log.warning("faster-whisper não instalado: seguindo sem transcrição")
        return None
    model_size = model_size or os.environ.get("ELOTAKE_WHISPER_MODEL", "small")
    language = language or os.environ.get("ELOTAKE_LANG") or None  # None = detecta sozinho
    model = WhisperModel(model_size, device="auto", compute_type="auto")
    segments, info = model.transcribe(
        load_audio_16k(path), language=language, word_timestamps=True, vad_filter=True,
    )
    words = [
        Word(text=w.word.strip(), start=w.start, end=w.end)
        for seg in segments
        for w in (seg.words or [])
        if w.word.strip()
    ]
    return Transcript(language=info.language, words=words)


def analyze(path: Path, with_transcript: bool = True, transcript: Transcript | None = None) -> Analysis:
    media = probe(path)
    silences = detect_silences(path, media.duration) if media.has_audio else []
    scenes = detect_scenes(path)
    if transcript is None and with_transcript and media.has_audio:
        try:
            transcript = transcribe(path)
        except Exception:
            log.exception("transcrição falhou: seguindo sem legenda, cortando pelos silêncios")
    return Analysis(media=media, silences=silences, scenes=scenes, transcript=transcript)
