import json
from types import SimpleNamespace

from elotake_engine.director import (
    build_claude_request, make_plan, plan_heuristic, remove_fillers, split_sentences,
)
from elotake_engine.models import (
    Analysis, Brief, Effects, MediaInfo, Pace, Platform, Silence, Transcript, Word,
)
from elotake_engine.presets import profile_from_preset


def words(*items):
    return [Word(text=t, start=s, end=e) for t, s, e in items]


def analysis_with(ws, duration=20.0, silences=()):
    return Analysis(
        media=MediaInfo(duration=duration, width=1920, height=1080, fps=30),
        silences=[Silence(start=s, end=e) for s, e in silences],
        transcript=Transcript(words=ws) if ws else None,
    )


def test_remove_fillers_drops_hard_fillers_and_isolated_soft_ones():
    ws = words(("Olá", 0, 0.4), ("ahn", 0.5, 0.7), ("tipo", 1.2, 1.4), ("isso", 1.8, 2.0),
               ("é", 2.05, 2.1), ("tipo", 2.12, 2.3), ("assim", 2.32, 2.5))
    kept = [w.text for w in remove_fillers(ws)]
    assert "ahn" not in kept
    assert kept.count("tipo") == 1  # o "tipo" solto sai, o colado na frase fica
    assert "Olá" in kept and "isso" in kept


def test_heuristic_cuts_long_pauses_using_words():
    ws = words(("Oi", 0.0, 0.5), ("gente.", 0.5, 1.0), ("Hoje", 4.0, 4.5), ("vamos.", 4.5, 5.0))
    profile = profile_from_preset("clean")
    plan = plan_heuristic(analysis_with(ws, duration=8.0), profile, Brief(plataforma=Platform.youtube))
    assert len(plan.segments) == 2
    assert plan.duration < 2.6
    assert plan.segments[0].start <= 0.0 + 1e-9 and plan.segments[1].start < 4.0


def test_heuristic_without_transcript_uses_silences():
    profile = profile_from_preset("clean")
    a = analysis_with([], duration=10.0, silences=[(2.0, 5.0), (7.0, 7.2)])
    plan = plan_heuristic(a, profile, Brief(plataforma=Platform.youtube))
    # A pausa curta (0.2s) fica; a longa (3s) sai, com o respiro do ritmo nas bordas.
    assert [(round(s.start, 2), round(s.end, 2)) for s in plan.segments] == [(0.0, 2.08), (4.92, 10.0)]


def test_heuristic_respects_platform_duration_and_zoom_alternates():
    ws = [Word(text=f"p{i}", start=i * 0.5, end=i * 0.5 + 0.45) for i in range(400)]
    profile = profile_from_preset("dinamico")
    plan = plan_heuristic(analysis_with(ws, duration=200.0), profile, Brief(plataforma=Platform.ads))
    assert plan.duration <= 45.0 + 1e-6
    zooms = [s.zoom for s in plan.segments]
    assert 1.0 in zooms and max(zooms) > 1.0


def test_no_silence_cutting_keeps_whole_video():
    profile = profile_from_preset("clean")
    brief = Brief(plataforma=Platform.youtube, efeitos=Effects(cortar_silencios=False, zoom_dinamico=False))
    plan = plan_heuristic(analysis_with([], duration=12.0, silences=[(2, 6)]), profile, brief)
    assert [(s.start, s.end) for s in plan.segments] == [(0.0, 12.0)]


def test_split_sentences_on_punctuation_and_pauses():
    ws = words(("Oi.", 0, 0.3), ("Tudo", 0.4, 0.6), ("bem", 0.6, 0.8), ("depois", 2.0, 2.4))
    assert [s.text for s in split_sentences(ws)] == ["Oi.", "Tudo bem", "depois"]


class FakeStream:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self):
        return SimpleNamespace(
            stop_reason="end_turn",
            content=[SimpleNamespace(type="text", text=json.dumps(self.payload))],
        )


class FakeClient:
    def __init__(self, payload):
        self.requests = []
        stream = self._stream

        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=stream))
        self.payload = payload

    def _stream(self, **kwargs):
        self.requests.append(kwargs)
        return FakeStream(self.payload)


def test_claude_director_reorders_and_maps_back_to_word_times():
    ws = words(("Oi", 0.0, 0.3), ("gente.", 0.3, 0.6),
               ("Isso", 2.0, 2.3), ("muda", 2.3, 2.6), ("tudo!", 2.6, 3.0))
    payload = {
        "sequencia": [
            {"id": 1, "zoom": True, "texto_tela": "Muda tudo"},
            {"id": 0, "zoom": False, "texto_tela": ""},
        ],
        "destaques": ["tudo"],
        "titulo": "Isso muda tudo",
        "descricao": "d",
        "hashtags": ["#edicao"],
        "resumo_edicao": "Abri com a frase mais forte.",
    }
    client = FakeClient(payload)
    profile = profile_from_preset("dinamico", ritmo=Pace.rapido)
    plan = make_plan(analysis_with(ws, duration=4.0), profile, Brief(plataforma=Platform.reels), client=client)

    assert plan.autor == "claude"
    assert plan.segments[0].start < 2.0 < plan.segments[0].end  # frase 1 primeiro
    assert plan.segments[0].zoom > 1.0 and plan.segments[-1].zoom == 1.0
    assert plan.overlays[0].text == "Muda tudo" and plan.overlays[0].start == 0.0
    request = client.requests[0]
    assert request["model"] == "claude-opus-5-5"
    assert request["output_config"]["format"]["type"] == "json_schema"
    assert "[1]" in request["messages"][0]["content"]


def test_claude_failure_falls_back_to_heuristic():
    class Broken:
        beta = SimpleNamespace(messages=SimpleNamespace(stream=lambda **k: (_ for _ in ()).throw(RuntimeError("x"))))

    ws = words(("Oi", 0.0, 0.3), ("gente.", 0.3, 0.6))
    plan = make_plan(analysis_with(ws, duration=2.0), profile_from_preset("clean"),
                     Brief(plataforma=Platform.youtube), client=Broken())
    assert plan.autor == "heuristico"


def test_request_mentions_duration_limit_and_objective():
    ws = words(("Oi.", 0.0, 0.3))
    a = analysis_with(ws, duration=2.0)
    req = build_claude_request(a, profile_from_preset("ugc_ads"),
                               Brief(plataforma=Platform.ads, objetivo="vender o curso"),
                               split_sentences(ws))
    content = req["messages"][0]["content"]
    assert "45s" in content and "vender o curso" in content
