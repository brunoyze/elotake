import json
import subprocess
import sys
from pathlib import Path

from elotake_engine import analyze, worker
from elotake_engine.presets import catalog, profile_from_preset

ROOT = Path(__file__).resolve().parents[2]


def write_job(tmp_path, **job):
    path = tmp_path / "job.json"
    path.write_text(json.dumps(job))
    return path


def test_worker_edits_with_local_paths_and_reuses_transcript(raw_video, tmp_path, monkeypatch):
    video, transcript = raw_video
    calls = []

    def fake_transcribe(path):
        calls.append(path)
        return transcript

    monkeypatch.setattr(analyze, "transcribe", fake_transcribe)
    out = tmp_path / "v0"
    job = write_job(
        tmp_path,
        tipo="editar",
        profile=profile_from_preset("dinamico").model_dump(mode="json"),
        brief={"plataforma": "reels"},
        use_ai=False,
        entradas={"video": str(video), "musica": None, "analise": None},
        saidas={name: str(out / name) for name in
                ("final.mp4", "thumb.jpg", "plan.json", "analysis.json", "status.json")},
        status_local=str(tmp_path / "status.json"),
    )
    assert worker.main([str(job)]) == 0
    status = json.loads((tmp_path / "status.json").read_text())
    assert status["status"] == "pronto" and status["progresso"] == 1.0
    assert status["plano"]["segments"] and status["duracao_original"] > 10
    assert json.loads((out / "status.json").read_text())["status"] == "pronto"
    assert (out / "final.mp4").stat().st_size > 10_000
    assert len(calls) == 1

    # Refação em YouTube reaproveitando a análise anterior: não transcreve de novo.
    out2 = tmp_path / "v1"
    job2 = write_job(
        tmp_path,
        profile=profile_from_preset("clean").model_dump(mode="json"),
        brief={"plataforma": "youtube"},
        use_ai=False,
        entradas={"video": str(video), "analise": str(out / "analysis.json")},
        saidas={"final.mp4": str(out2 / "final.mp4")},
        status_local=str(tmp_path / "status2.json"),
    )
    assert worker.main([str(job2)]) == 0
    assert len(calls) == 1
    assert (out2 / "final.mp4").is_file()


def test_worker_reports_errors_in_status(tmp_path):
    job = write_job(
        tmp_path,
        profile=profile_from_preset("clean").model_dump(mode="json"),
        brief={"plataforma": "reels"},
        entradas={"video": str(tmp_path / "nao-existe.mp4")},
        saidas={"status.json": str(tmp_path / "remoto" / "status.json")},
        status_local=str(tmp_path / "status.json"),
    )
    assert worker.main([str(job)]) == 1
    status = json.loads((tmp_path / "status.json").read_text())
    assert status["status"] == "erro" and status["erro"]
    assert (tmp_path / "remoto" / "status.json").is_file()


def test_worker_reference(raw_video, tmp_path):
    video, _ = raw_video
    job = write_job(tmp_path, tipo="referencia", entradas={"video": str(video)},
                    status_local=str(tmp_path / "status.json"))
    assert worker.main([str(job)]) == 0
    status = json.loads((tmp_path / "status.json").read_text())
    assert status["resultado"]["formato"] == "horizontal"


def test_web_catalog_is_in_sync_with_presets():
    """web/src/lib/catalog.json é gerado com `elotake catalogo`; tem que bater com os presets."""
    exported = json.loads((ROOT / "web" / "src" / "lib" / "catalog.json").read_text(encoding="utf-8"))
    assert exported == json.loads(json.dumps(catalog())), "rode: elotake catalogo > web/src/lib/catalog.json"


def test_cli_catalog_runs():
    out = subprocess.run([sys.executable, "-m", "elotake_engine.cli", "catalogo"],
                         capture_output=True, text=True, check=True).stdout
    assert "dinamico" in json.loads(out)["perfis"]
