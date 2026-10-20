import importlib
import json
import time

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ELOTAKE_DATA", str(tmp_path / "data"))
    monkeypatch.setenv("ELOTAKE_USE_AI", "0")
    from elotake_engine import api

    api = importlib.reload(api)
    with TestClient(api.app) as c:
        yield c


def wait_done(client, pid, timeout=180):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        project = client.get(f"/api/projetos/{pid}").json()
        if project["status"] in ("pronto", "erro"):
            return project
        time.sleep(0.5)
    raise AssertionError("edição não terminou a tempo")


def test_profile_project_and_redo_flow(client, raw_video, monkeypatch):
    video, transcript = raw_video
    # Evita baixar o Whisper no teste: a análise usa a transcrição do roteiro.
    from elotake_engine import analyze

    monkeypatch.setattr(analyze, "transcribe", lambda path: transcript)

    catalog = client.get("/api/catalogo").json()
    assert {e["id"] for e in catalog["estilos"]} >= {"dinamico", "ugc_ads"}
    assert client.get("/api/perfis/meu-estilo").status_code == 404

    profile = client.get("/api/perfis/dinamico").json()
    profile["observacoes"] = "sem emojis"
    saved = client.put("/api/perfis/meu-estilo", json=profile).json()
    assert saved["id"] == "meu-estilo"

    with video.open("rb") as fh:
        res = client.post(
            "/api/projetos",
            files={"video": ("bruto.mp4", fh, "video/mp4")},
            data={"profile_id": "meu-estilo", "brief": json.dumps({"plataforma": "ads"})},
        )
    assert res.status_code == 200, res.text
    pid = res.json()["id"]
    project = wait_done(client, pid)
    assert project["status"] == "pronto", project["erro"]
    assert project["plano"]["segments"]
    assert project["duracao_original"] > 10

    final = client.get(f"/api/projetos/{pid}/arquivos/final.mp4")
    assert final.status_code == 200 and len(final.content) > 10_000
    assert client.get(f"/api/projetos/{pid}/arquivos/../../etc").status_code == 404

    redo = client.post(f"/api/projetos/{pid}/refazer", json={"brief": {"plataforma": "youtube"}})
    assert redo.json()["versao"] == 1
    project = wait_done(client, pid)
    assert project["status"] == "pronto" and project["brief"]["plataforma"] == "youtube"
    assert [p["id"] for p in client.get("/api/projetos").json()] == [pid]
