"""Linha de comando: edita um vídeo sem subir a API.

    elotake editar bruto.mp4 --estilo dinamico --destino reels --objetivo "anúncio do curso"
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from .models import Brief, Platform, ReframeMode
from .pipeline import edit_video, learn_from_reference, load_transcript
from .presets import STYLE_PRESETS, profile_from_preset


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="elotake", description="Editor de vídeo automático Elotake")
    sub = parser.add_subparsers(dest="cmd", required=True)

    ed = sub.add_parser("editar", help="edita um vídeo bruto")
    ed.add_argument("video", type=Path)
    ed.add_argument("--estilo", default="dinamico", choices=sorted(STYLE_PRESETS))
    ed.add_argument("--destino", default="reels", choices=[p.value for p in Platform])
    ed.add_argument("--objetivo", default="")
    ed.add_argument("--duracao-max", type=float)
    ed.add_argument("--reenquadrar", default="crop", choices=[r.value for r in ReframeMode])
    ed.add_argument("--musica", type=Path)
    ed.add_argument("--transcricao", type=Path, help="JSON de transcrição pronto (pula o Whisper)")
    ed.add_argument("--sem-ia", action="store_true", help="usa só o diretor por regras")
    ed.add_argument("--saida", type=Path, default=Path("saida"))

    ref = sub.add_parser("referencia", help="mede o ritmo de um vídeo de referência")
    ref.add_argument("video", type=Path)

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if args.cmd == "referencia":
        print(learn_from_reference(args.video))
        return 0

    profile = profile_from_preset(args.estilo)
    brief = Brief(
        plataforma=Platform(args.destino),
        objetivo=args.objetivo,
        duracao_max=args.duracao_max,
        reenquadrar=ReframeMode(args.reenquadrar),
    )
    transcript = load_transcript(args.transcricao) if args.transcricao else None

    def on_stage(name: str, p: float) -> None:
        print(f"\r{name:<14} {p * 100:5.1f}%", end="", file=sys.stderr, flush=True)

    result = edit_video(
        args.video, profile, brief, args.saida,
        music=args.musica, transcript=transcript, use_ai=not args.sem_ia, on_stage=on_stage,
    )
    print(f"\nVídeo final: {result.output}")
    print(f"Duração: {result.analysis.media.duration:.1f}s → {result.plan.duration:.1f}s "
          f"({len(result.plan.segments)} cortes, diretor: {result.plan.autor})")
    print(result.plan.resumo_edicao)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
