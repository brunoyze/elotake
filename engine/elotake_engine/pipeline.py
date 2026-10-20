"""Orquestra o fluxo completo: analisar → dirigir → renderizar."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from . import analyze as analysis_mod
from .director import effective_effects, make_plan
from .models import Analysis, Brief, EditPlan, Pace, StyleProfile, Transcript
from .presets import PLATFORMS
from .render import RenderJob, render, thumbnail

log = logging.getLogger(__name__)

MUSIC_DIR = Path(__file__).resolve().parent.parent / "assets" / "music"
MUSIC_EXTS = {".mp3", ".m4a", ".wav", ".aac", ".ogg"}

# (etapa, progresso_da_etapa 0..1)
StageFn = Callable[[str, float], None]


@dataclass
class Result:
    output: Path
    thumbnail: Path
    plan: EditPlan
    analysis: Analysis


def pick_music(mood: str) -> Path | None:
    folder = MUSIC_DIR / mood
    if not folder.is_dir():
        return None
    tracks = sorted(p for p in folder.iterdir() if p.suffix.lower() in MUSIC_EXTS)
    return tracks[0] if tracks else None


def edit_video(
    source: Path,
    profile: StyleProfile,
    brief: Brief,
    workdir: Path,
    *,
    music: Path | None = None,
    transcript: Transcript | None = None,
    use_ai: bool = True,
    on_stage: StageFn | None = None,
) -> Result:
    stage = on_stage or (lambda name, p: None)
    workdir.mkdir(parents=True, exist_ok=True)
    fx = effective_effects(profile, brief)

    stage("analisando", 0.0)
    analysis = analysis_mod.analyze(source, with_transcript=fx.legendas or use_ai, transcript=transcript)
    (workdir / "analysis.json").write_text(analysis.model_dump_json(indent=2), encoding="utf-8")
    stage("analisando", 1.0)

    stage("dirigindo", 0.0)
    plan = make_plan(analysis, profile, brief, use_ai=use_ai)
    (workdir / "plan.json").write_text(plan.model_dump_json(indent=2), encoding="utf-8")
    stage("dirigindo", 1.0)

    if fx.musica and music is None:
        music = pick_music(profile.clima_musica)

    output = workdir / "final.mp4"
    job = RenderJob(
        source=source,
        output=output,
        workdir=workdir,
        plan=plan,
        media=analysis.media,
        spec=PLATFORMS[brief.plataforma],
        profile=profile,
        effects=fx,
        reframe=brief.reenquadrar,
        transcript=analysis.transcript,
        music=music if fx.musica else None,
    )
    stage("renderizando", 0.0)
    render(job, on_progress=lambda p: stage("renderizando", p))
    thumb = thumbnail(output, workdir / "thumb.jpg", at=min(1.0, plan.duration / 3))
    stage("pronto", 1.0)
    return Result(output=output, thumbnail=thumb, plan=plan, analysis=analysis)


def learn_from_reference(path: Path) -> dict:
    """Mede o ritmo de um vídeo de referência (cortes por minuto) e sugere um ritmo."""
    media = analysis_mod.probe(path)
    cuts = analysis_mod.detect_scenes(path, threshold=0.3)
    per_minute = len(cuts) / max(media.duration / 60, 1e-6)
    if per_minute >= 20:
        pace = Pace.rapido
    elif per_minute >= 8:
        pace = Pace.equilibrado
    else:
        pace = Pace.calmo
    vertical = media.height > media.width
    return {
        "duracao": round(media.duration, 1),
        "cortes_por_minuto": round(per_minute, 1),
        "ritmo_sugerido": pace.value,
        "formato": "vertical" if vertical else "horizontal",
    }


def load_transcript(path: Path) -> Transcript:
    return Transcript.model_validate(json.loads(path.read_text(encoding="utf-8")))
