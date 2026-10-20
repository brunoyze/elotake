"""API HTTP do motor (FastAPI).

Armazenamento local em disco para o MVP: um diretório por projeto com o
vídeo original, a análise, o plano e o vídeo final. Em produção isto vira
storage de objetos (S3/R2) + banco + fila de workers.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .models import Brief, CaptionStyle, Pace, Platform, StyleProfile, Transcript
from .pipeline import edit_video, learn_from_reference
from .presets import COLOR_GRADES, PLATFORMS, STYLE_PRESETS, profile_from_preset

log = logging.getLogger(__name__)

DATA_DIR = Path(os.environ.get("ELOTAKE_DATA", "data")).resolve()
PROFILES = DATA_DIR / "profiles"
PROJECTS = DATA_DIR / "projects"
USE_AI = os.environ.get("ELOTAKE_USE_AI", "1") != "0"
STAGES = ["na_fila", "analisando", "dirigindo", "renderizando", "pronto"]
STAGE_WEIGHT = {"analisando": (0.0, 0.35), "dirigindo": (0.35, 0.45), "renderizando": (0.45, 1.0)}

@asynccontextmanager
async def lifespan(_: FastAPI):
    _ensure_dirs()
    # Projetos interrompidos por um restart voltam para a fila.
    for path in PROJECTS.glob("*/project.json"):
        project = Project.model_validate_json(path.read_text(encoding="utf-8"))
        if project.status not in ("pronto", "erro"):
            executor.submit(run_project, project.id)
    yield


app = FastAPI(title="Elotake Engine", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
executor = ThreadPoolExecutor(max_workers=int(os.environ.get("ELOTAKE_WORKERS", "2")))
_lock = threading.Lock()


class Project(BaseModel):
    id: str
    nome: str
    criado_em: float
    profile_id: str
    brief: Brief
    status: str = "na_fila"
    progresso: float = 0.0
    erro: str | None = None
    source: str
    music: str | None = None
    plano: dict | None = None
    duracao_original: float | None = None
    versao: int = 0


def _ensure_dirs() -> None:
    PROFILES.mkdir(parents=True, exist_ok=True)
    PROJECTS.mkdir(parents=True, exist_ok=True)


def _project_dir(pid: str) -> Path:
    path = (PROJECTS / pid).resolve()
    if path.parent != PROJECTS or not path.is_dir():
        raise HTTPException(404, "projeto não encontrado")
    return path


def load_project(pid: str) -> Project:
    return Project.model_validate_json((_project_dir(pid) / "project.json").read_text(encoding="utf-8"))


def save_project(project: Project) -> None:
    path = PROJECTS / project.id / "project.json"
    tmp = path.with_suffix(".tmp")
    with _lock:
        tmp.write_text(project.model_dump_json(indent=2), encoding="utf-8")
        tmp.replace(path)


def load_profile(profile_id: str) -> StyleProfile:
    path = PROFILES / f"{profile_id}.json"
    if path.is_file():
        return StyleProfile.model_validate_json(path.read_text(encoding="utf-8"))
    if profile_id in STYLE_PRESETS:
        return profile_from_preset(profile_id, id=profile_id)
    raise HTTPException(404, "perfil de estilo não encontrado")


def _safe_name(filename: str | None, default: str) -> str:
    suffix = Path(filename or "").suffix.lower()
    return default + (suffix if suffix.isascii() and len(suffix) <= 5 else "")


def _save_upload(upload: UploadFile, dest: Path) -> None:
    with dest.open("wb") as fh:
        shutil.copyfileobj(upload.file, fh)


# --------------------------------------------------------------------------
# Execução em segundo plano
# --------------------------------------------------------------------------

def run_project(pid: str) -> None:
    project = load_project(pid)
    folder = PROJECTS / pid
    profile = load_profile(project.profile_id)
    version = project.versao
    workdir = folder / f"v{version}"
    transcript = None
    previous = folder / f"v{version - 1}" / "analysis.json"
    if previous.is_file():
        # Refação: reaproveita a transcrição, que é a etapa mais cara.
        data = json.loads(previous.read_text(encoding="utf-8"))
        if data.get("transcript"):
            transcript = Transcript.model_validate(data["transcript"])

    last_write = 0.0

    def on_stage(name: str, p: float) -> None:
        nonlocal last_write
        lo, hi = STAGE_WEIGHT.get(name, (1.0, 1.0))
        project.status = name if name != "pronto" else project.status
        project.progresso = round(lo + (hi - lo) * p, 3)
        now = time.monotonic()
        if now - last_write > 0.5 or p in (0.0, 1.0):
            last_write = now
            save_project(project)

    try:
        result = edit_video(
            folder / project.source,
            profile,
            project.brief,
            workdir,
            music=folder / project.music if project.music else None,
            transcript=transcript,
            use_ai=USE_AI,
            on_stage=on_stage,
        )
        project.status = "pronto"
        project.progresso = 1.0
        project.plano = result.plan.model_dump()
        project.duracao_original = result.analysis.media.duration
    except Exception as exc:
        log.exception("projeto %s falhou", pid)
        project.status = "erro"
        project.erro = str(exc)[-500:]
    save_project(project)


# --------------------------------------------------------------------------
# Rotas
# --------------------------------------------------------------------------

@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "ia": USE_AI and bool(os.environ.get("ANTHROPIC_API_KEY"))}


@app.get("/api/catalogo")
def catalog() -> dict:
    return {
        "estilos": [
            {
                "id": p.id, "nome": p.nome, "descricao": p.descricao, "ritmo": p.ritmo.value,
                "legenda": p.legenda.value, "cor": p.cor, "efeitos": p.efeitos.model_dump(),
            }
            for p in STYLE_PRESETS.values()
        ],
        "plataformas": [
            {"id": k.value, "nome": v.nome, "largura": v.width, "altura": v.height, "duracao_max": v.duracao_max}
            for k, v in PLATFORMS.items()
        ],
        "cores": list(COLOR_GRADES),
        "legendas": [c.value for c in CaptionStyle],
        "ritmos": [p.value for p in Pace],
    }


@app.get("/api/perfis")
def list_profiles() -> list[StyleProfile]:
    _ensure_dirs()
    return [StyleProfile.model_validate_json(p.read_text(encoding="utf-8")) for p in sorted(PROFILES.glob("*.json"))]


@app.put("/api/perfis/{profile_id}")
def save_profile(profile_id: str, profile: StyleProfile) -> StyleProfile:
    _ensure_dirs()
    if not profile_id.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "id inválido")
    profile.id = profile_id
    (PROFILES / f"{profile_id}.json").write_text(profile.model_dump_json(indent=2), encoding="utf-8")
    return profile


@app.get("/api/perfis/{profile_id}")
def get_profile(profile_id: str) -> StyleProfile:
    return load_profile(profile_id)


@app.post("/api/referencias/analisar")
def analyze_reference(video: UploadFile = File(...)) -> dict:
    """Recebe um vídeo de referência e devolve o ritmo medido."""
    _ensure_dirs()
    tmp = DATA_DIR / f"ref-{uuid.uuid4().hex}{_safe_name(video.filename, '')}"
    try:
        _save_upload(video, tmp)
        return learn_from_reference(tmp)
    except Exception as exc:
        raise HTTPException(400, f"não consegui analisar a referência: {exc}") from exc
    finally:
        tmp.unlink(missing_ok=True)


@app.post("/api/projetos")
def create_project(
    video: UploadFile = File(...),
    profile_id: str = Form("dinamico"),
    brief: str = Form("{}"),
    musica: UploadFile | None = File(None),
) -> Project:
    _ensure_dirs()
    load_profile(profile_id)  # valida
    parsed = Brief.model_validate_json(brief)
    pid = uuid.uuid4().hex[:12]
    folder = PROJECTS / pid
    folder.mkdir()
    source = _safe_name(video.filename, "original")
    _save_upload(video, folder / source)
    music = None
    if musica is not None and musica.filename:
        music = _safe_name(musica.filename, "musica")
        _save_upload(musica, folder / music)
    project = Project(
        id=pid,
        nome=Path(video.filename or "video").stem[:80],
        criado_em=time.time(),
        profile_id=profile_id,
        brief=parsed,
        source=source,
        music=music,
    )
    save_project(project)
    executor.submit(run_project, pid)
    return project


@app.get("/api/projetos")
def list_projects() -> list[Project]:
    _ensure_dirs()
    projects = [Project.model_validate_json(p.read_text(encoding="utf-8")) for p in PROJECTS.glob("*/project.json")]
    return sorted(projects, key=lambda p: p.criado_em, reverse=True)


@app.get("/api/projetos/{pid}")
def get_project(pid: str) -> Project:
    return load_project(pid)


class Redo(BaseModel):
    brief: Brief | None = None
    profile_id: str | None = None


@app.post("/api/projetos/{pid}/refazer")
def redo_project(pid: str, body: Redo) -> Project:
    project = load_project(pid)
    if project.status not in ("pronto", "erro"):
        raise HTTPException(409, "o projeto ainda está sendo editado")
    if body.profile_id:
        load_profile(body.profile_id)
        project.profile_id = body.profile_id
    if body.brief:
        project.brief = body.brief
    project.versao += 1
    project.status, project.progresso, project.erro, project.plano = "na_fila", 0.0, None, None
    save_project(project)
    executor.submit(run_project, pid)
    return project


@app.get("/api/projetos/{pid}/arquivos/{name}")
def get_file(pid: str, name: str) -> FileResponse:
    if name not in ("final.mp4", "thumb.jpg", "plan.json", "captions.ass"):
        raise HTTPException(404, "arquivo não encontrado")
    project = load_project(pid)
    path = _project_dir(pid) / f"v{project.versao}" / name
    if not path.is_file():
        raise HTTPException(404, "arquivo ainda não existe")
    filename = f"elotake-{project.nome}-v{project.versao}{path.suffix}" if name == "final.mp4" else None
    return FileResponse(path, filename=filename)
