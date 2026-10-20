"""Renderizador: executa um EditPlan com FFmpeg.

Nada aqui toma decisão criativa. O plano diz o que fazer; este módulo só
traduz para um filtergraph do FFmpeg, para que o mesmo plano gere sempre o
mesmo vídeo.
"""

from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from .captions import build_ass, remap_words
from .models import CaptionStyle, EditPlan, Effects, MediaInfo, ReframeMode, StyleProfile, Transcript
from .presets import COLOR_GRADES, PlatformSpec

log = logging.getLogger(__name__)

ProgressFn = Callable[[float], None]


@dataclass
class RenderJob:
    source: Path
    output: Path
    workdir: Path
    plan: EditPlan
    media: MediaInfo
    spec: PlatformSpec
    profile: StyleProfile
    effects: Effects
    reframe: ReframeMode = ReframeMode.crop
    transcript: Transcript | None = None
    music: Path | None = None


def _even(n: float) -> int:
    return max(2, int(n) // 2 * 2)


def crop_box(src_w: int, src_h: int, out_w: int, out_h: int, zoom: float) -> tuple[int, int]:
    """Maior retângulo com o aspecto de saída que cabe na fonte, reduzido pelo zoom."""
    target = out_w / out_h
    if src_w / src_h > target:
        ch = src_h
        cw = ch * target
    else:
        cw = src_w
        ch = cw / target
    return _even(cw / zoom), _even(ch / zoom)


def output_fps(media: MediaInfo) -> int:
    return int(min(60, max(24, round(media.fps))))


def segment_video_filter(i: int, job: RenderJob) -> str:
    seg = job.plan.segments[i]
    W, H = job.spec.width, job.spec.height
    src_w, src_h = job.media.width, job.media.height
    fps = output_fps(job.media)
    head = f"[0:v]trim=start={seg.start:.3f}:end={seg.end:.3f},setpts=PTS-STARTPTS,fps={fps}"
    flash = ""
    if job.effects.flash_transicao and i > 0:
        flash = ",fade=t=in:st=0:d=0.12:color=white"

    if job.reframe == ReframeMode.blur and abs(src_w / src_h - W / H) > 0.01:
        # Vídeo inteiro no centro, sobre uma cópia ampliada e desfocada.
        zw, zh = _even(src_w / seg.zoom), _even(src_h / seg.zoom)
        return (
            f"{head},split[bgs{i}][fgs{i}];"
            f"[bgs{i}]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:3[bg{i}];"
            f"[fgs{i}]crop={zw}:{zh}:(iw-{zw})/2:(ih-{zh})/2,"
            f"scale={W}:{H}:force_original_aspect_ratio=decrease[fg{i}];"
            f"[bg{i}][fg{i}]overlay=(W-w)/2:(H-h)/2,setsar=1{flash}[v{i}]"
        )
    cw, ch = crop_box(src_w, src_h, W, H, seg.zoom)
    return f"{head},crop={cw}:{ch}:(iw-{cw})/2:(ih-{ch})/2,scale={W}:{H},setsar=1{flash}[v{i}]"


def segment_audio_filter(i: int, job: RenderJob) -> str:
    seg = job.plan.segments[i]
    fade = min(0.015, seg.duration / 4)
    return (
        f"[0:a]atrim=start={seg.start:.3f}:end={seg.end:.3f},asetpts=PTS-STARTPTS,"
        f"afade=t=in:d={fade:.3f},afade=t=out:st={seg.duration - fade:.3f}:d={fade:.3f}[a{i}]"
    )


def video_finish_filters(job: RenderJob, has_captions: bool) -> list[str]:
    fx = job.effects
    filters = [COLOR_GRADES.get(job.profile.cor, COLOR_GRADES["natural"])]
    if fx.granulado:
        filters.append("noise=alls=7:allf=t")
    if fx.vinheta:
        filters.append("vignette=PI/5")
    if fx.barras_cinema:
        bar = 0.08 if job.spec.height > job.spec.width else 0.12
        filters.append(
            f"drawbox=x=0:y=0:w=iw:h=ih*{bar}:color=black:t=fill,"
            f"drawbox=x=0:y=ih*{1 - bar}:w=iw:h=ih*{bar}:color=black:t=fill"
        )
    if has_captions:
        filters.append("ass=captions.ass")
    return filters


def build_filtergraph(job: RenderJob, has_captions: bool) -> tuple[str, str, str]:
    """Retorna (filtergraph, rótulo do vídeo final, rótulo do áudio final)."""
    n = len(job.plan.segments)
    has_audio = job.media.has_audio
    parts: list[str] = []
    for i in range(n):
        parts.append(segment_video_filter(i, job))
        if has_audio:
            parts.append(segment_audio_filter(i, job))
    pads = "".join(f"[v{i}][a{i}]" if has_audio else f"[v{i}]" for i in range(n))
    parts.append(f"{pads}concat=n={n}:v=1:a={1 if has_audio else 0}[vc]" + ("[ac]" if has_audio else ""))
    parts.append(f"[vc]{','.join(video_finish_filters(job, has_captions))}[vout]")

    if not has_audio:
        return ";\n".join(parts), "[vout]", ""

    voice = "[ac]"
    if job.effects.melhorar_audio:
        parts.append(
            "[ac]highpass=f=80,afftdn=nf=-25,"
            "acompressor=threshold=-18dB:ratio=3:attack=5:release=60[voice]"
        )
        voice = "[voice]"
    final = voice
    if job.music is not None:
        total = job.plan.duration
        parts.append(
            f"[1:a]atrim=0:{total:.3f},asetpts=PTS-STARTPTS,volume=0.35,"
            f"afade=t=in:d=0.5,afade=t=out:st={max(0.0, total - 1.5):.3f}:d=1.5[music]"
        )
        parts.append(f"{voice}asplit=2[vmix][vkey]")
        parts.append("[music][vkey]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350[ducked]")
        parts.append("[vmix][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mixed]")
        final = "[mixed]"
    parts.append(f"{final}loudnorm=I={job.spec.loudness}:TP=-1.5:LRA=11,aresample=48000[aout]")
    return ";\n".join(parts), "[vout]", "[aout]"


def render(job: RenderJob, on_progress: ProgressFn | None = None) -> Path:
    job.workdir.mkdir(parents=True, exist_ok=True)
    caption_style = job.profile.legenda if job.effects.legendas else CaptionStyle.nenhuma
    words = remap_words(job.transcript, job.plan) if job.transcript else []
    has_captions = bool(words and caption_style != CaptionStyle.nenhuma) or bool(job.plan.overlays)
    if has_captions:
        ass = build_ass(
            words if caption_style != CaptionStyle.nenhuma else [],
            caption_style,
            job.spec.width,
            job.spec.height,
            highlight=job.profile.cor_destaque,
            font=job.profile.fonte,
            emphasis=job.plan.destaques,
            overlays=job.plan.overlays,
        )
        (job.workdir / "captions.ass").write_text(ass, encoding="utf-8")

    graph, vlabel, alabel = build_filtergraph(job, has_captions)
    graph_file = job.workdir / "filtergraph.txt"
    graph_file.write_text(graph, encoding="utf-8")

    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(job.source.resolve())]
    if job.music is not None and job.media.has_audio:
        cmd += ["-stream_loop", "-1", "-i", str(job.music.resolve())]
    cmd += ["-filter_complex_script", graph_file.name, "-map", vlabel]
    if alabel:
        cmd += ["-map", alabel, "-c:a", "aac", "-b:a", "192k"]
    cmd += [
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", "-progress", "pipe:1", "-nostats",
        str(job.output.resolve()),
    ]
    log.info("renderizando %d cortes → %s", len(job.plan.segments), job.output)
    total_us = max(job.plan.duration, 0.01) * 1_000_000
    proc = subprocess.Popen(cmd, cwd=job.workdir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    assert proc.stdout is not None
    for line in proc.stdout:
        if line.startswith("out_time_us=") and on_progress:
            try:
                on_progress(min(1.0, int(line.split("=")[1]) / total_us))
            except ValueError:
                pass
    stderr = proc.stderr.read() if proc.stderr else ""
    if proc.wait() != 0:
        raise RuntimeError(f"ffmpeg falhou: {stderr.strip()[-2000:]}")
    if on_progress:
        on_progress(1.0)
    return job.output


def thumbnail(video: Path, output: Path, at: float = 1.0) -> Path:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{at:.2f}", "-i", str(video),
         "-frames:v", "1", "-q:v", "3", str(output)],
        check=True,
    )
    return output
