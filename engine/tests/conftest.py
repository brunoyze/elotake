"""Gera um "vídeo bruto" sintético: falas com pausas longas, um vício e uma repetição."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from elotake_engine.models import Transcript, Word

# (texto falado, silêncio depois em segundos). flite só tem vozes em inglês.
SCRIPT = [
    ("Hello everyone.", 1.5),
    ("Today I will show you how to edit videos.", 0.2),
    ("Um.", 1.2),
    ("Editing is hard.", 0.3),
    ("Editing is hard, but not anymore.", 2.0),
    ("Let's go.", 0.8),
]


def _ff(*args: str) -> None:
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args], check=True)


def _duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout)


@pytest.fixture(scope="session")
def raw_video(tmp_path_factory) -> tuple[Path, Transcript]:
    """Retorna o vídeo e uma transcrição "perfeita" montada a partir do roteiro."""
    folder = tmp_path_factory.mktemp("bruto")
    pieces: list[Path] = []
    words: list[Word] = []
    t = 0.0
    for i, (text, pause) in enumerate(SCRIPT):
        speech = folder / f"fala{i}.wav"
        _ff("-f", "lavfi", "-i", f"flite=text='{text}':voice=slt", "-ar", "48000", "-ac", "1", str(speech))
        dur = _duration(speech)
        tokens = text.split()
        # Distribui as palavras igualmente na duração da fala (sem o respiro final do flite).
        spoken = dur * 0.9
        for j, tok in enumerate(tokens):
            words.append(Word(
                text=tok,
                start=round(t + spoken * j / len(tokens), 3),
                end=round(t + spoken * (j + 1) / len(tokens), 3),
            ))
        silence = folder / f"pausa{i}.wav"
        _ff("-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", str(pause), str(silence))
        pieces += [speech, silence]
        t += dur + pause

    listing = folder / "lista.txt"
    listing.write_text("".join(f"file '{p}'\n" for p in pieces))
    audio = folder / "audio.wav"
    _ff("-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(audio))
    total = _duration(audio)

    video = folder / "bruto.mp4"
    half = total / 2
    _ff(
        "-f", "lavfi", "-i", f"testsrc2=size=1280x720:rate=30:duration={half:.3f}",
        "-f", "lavfi", "-i", f"smptebars=size=1280x720:rate=30:duration={total - half:.3f}",
        "-i", str(audio),
        "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]",
        "-map", "[v]", "-map", "2:a", "-c:v", "libx264", "-preset", "ultrafast",
        "-c:a", "aac", "-shortest", str(video),
    )
    return video, Transcript(language="en", words=words)
