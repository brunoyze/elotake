"""Executa um trabalho descrito num arquivo JSON (usado pela interface web).

    python -m elotake_engine.worker job.json

O trabalho diz de onde baixar as entradas e para onde mandar as saídas. Cada
endereço pode ser uma URL (assinada, do Vercel Blob) ou um caminho local, para
que o mesmo worker rode numa Vercel Sandbox ou na máquina de quem desenvolve.

O progresso vai para ``status_local`` (um arquivo que a interface lê enquanto o
trabalho roda). No fim, o status final também é enviado para ``saidas["status.json"]``.

Formato do trabalho:

    {
      "tipo": "editar" | "referencia",
      "profile": {...}, "brief": {...}, "use_ai": true,
      "entradas": {"video": "...", "musica": "..." | null, "analise": "..." | null},
      "saidas": {"final.mp4": "...", "thumb.jpg": "...", "plan.json": "...",
                 "analysis.json": "...", "status.json": "..."},
      "status_local": "/caminho/status.json"
    }
"""

from __future__ import annotations

import json
import logging
import shutil
import sys
import tempfile
import time
import traceback
import urllib.request
from pathlib import Path

from .models import Brief, StyleProfile, Transcript
from .pipeline import edit_video, learn_from_reference

log = logging.getLogger("elotake.worker")

CONTENT_TYPES = {
    ".mp4": "video/mp4",
    ".jpg": "image/jpeg",
    ".json": "application/json",
}
STAGE_RANGES = {"analisando": (0.05, 0.4), "dirigindo": (0.4, 0.5), "renderizando": (0.5, 0.95)}


def is_url(target: str) -> bool:
    return target.startswith(("http://", "https://"))


def fetch(source: str, dest: Path) -> Path:
    if is_url(source):
        with urllib.request.urlopen(source, timeout=120) as resp, dest.open("wb") as fh:
            shutil.copyfileobj(resp, fh, length=1024 * 1024)
    else:
        shutil.copyfile(source, dest)
    return dest


def send(path: Path, target: str) -> None:
    if not is_url(target):
        Path(target).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        return
    size = path.stat().st_size
    content_type = CONTENT_TYPES.get(path.suffix, "application/octet-stream")
    for attempt in range(3):
        try:
            with path.open("rb") as fh:
                req = urllib.request.Request(
                    target, data=fh, method="PUT",
                    headers={"Content-Type": content_type, "Content-Length": str(size)},
                )
                with urllib.request.urlopen(req, timeout=600) as resp:
                    resp.read()
            return
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


class Status:
    """Escreve o status no arquivo local, no máximo a cada meio segundo."""

    def __init__(self, path: Path):
        self.path = path
        self.data: dict = {"status": "na_fila", "progresso": 0.0}
        self.last = 0.0

    def update(self, force: bool = False, **fields) -> None:
        self.data.update(fields, atualizado_em=time.time())
        now = time.monotonic()
        if force or now - self.last > 0.5:
            self.last = now
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.data, ensure_ascii=False), encoding="utf-8")
            tmp.replace(self.path)


def run_edit(job: dict, work: Path, status: Status) -> dict:
    inputs, outputs = job["entradas"], job["saidas"]
    status.update(force=True, status="baixando", progresso=0.02)
    source = fetch(inputs["video"], work / "original")
    music = fetch(inputs["musica"], work / "musica") if inputs.get("musica") else None

    transcript = None
    if inputs.get("analise"):
        # Refação: reaproveita a transcrição da versão anterior.
        try:
            previous = json.loads(fetch(inputs["analise"], work / "analise-anterior.json").read_text())
            if previous.get("transcript"):
                transcript = Transcript.model_validate(previous["transcript"])
        except Exception as exc:
            log.warning("não reaproveitei a transcrição anterior: %s", exc)

    def on_stage(name: str, p: float) -> None:
        if name in STAGE_RANGES:
            lo, hi = STAGE_RANGES[name]
            status.update(status=name, progresso=round(lo + (hi - lo) * p, 3))

    result = edit_video(
        source,
        StyleProfile.model_validate(job["profile"]),
        Brief.model_validate(job["brief"]),
        work / "saida",
        music=music,
        transcript=transcript,
        use_ai=job.get("use_ai", True),
        on_stage=on_stage,
    )
    status.update(force=True, status="enviando", progresso=0.96)
    files = {
        "final.mp4": result.output,
        "thumb.jpg": result.thumbnail,
        "plan.json": work / "saida" / "plan.json",
        "analysis.json": work / "saida" / "analysis.json",
    }
    for name, path in files.items():
        if name in outputs:
            send(path, outputs[name])
    return {
        "status": "pronto",
        "progresso": 1.0,
        "plano": result.plan.model_dump(mode="json"),
        "duracao_original": result.analysis.media.duration,
    }


def run_reference(job: dict, work: Path, status: Status) -> dict:
    status.update(force=True, status="analisando", progresso=0.3)
    source = fetch(job["entradas"]["video"], work / "referencia")
    return {"status": "pronto", "progresso": 1.0, "resultado": learn_from_reference(source)}


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    job = json.loads(Path(argv[0]).read_text(encoding="utf-8"))
    status = Status(Path(job["status_local"]))
    status.update(force=True, status="na_fila", progresso=0.01)
    work = Path(tempfile.mkdtemp(prefix="elotake-"))
    try:
        runner = run_reference if job.get("tipo") == "referencia" else run_edit
        final = runner(job, work, status)
        code = 0
    except Exception as exc:
        traceback.print_exc()
        final = {"status": "erro", "erro": str(exc)[-500:] or exc.__class__.__name__}
        code = 1
    finally:
        shutil.rmtree(work, ignore_errors=True)
    status.update(force=True, **final)
    remote = job.get("saidas", {}).get("status.json")
    if remote:
        try:
            send(status.path, remote)
        except Exception:
            log.exception("não consegui enviar o status final")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
