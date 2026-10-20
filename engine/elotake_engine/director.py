"""O diretor: transforma análise + estilo + pedido em um EditPlan.

Dois diretores com a mesma saída:

- ``plan_heuristic``: regras determinísticas (sem custo, sempre disponível).
- ``plan_with_claude``: o Claude lê a transcrição e decide o que fica, em que
  ordem, onde dar ênfase e o texto de tela. Os pontos exatos de corte continuam
  sendo calculados aqui, a partir dos timestamps das palavras, para que a IA
  nunca "corte no meio de uma palavra".
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from .models import (
    Analysis, Brief, EditPlan, Effects, Segment, StyleProfile, TextOverlay, Word,
)
from .presets import (
    FILLER_WORDS, PACE_MAX_GAP, PACE_PADDING, PLATFORMS, SOFT_FILLERS, STYLE_PRESETS,
)

log = logging.getLogger(__name__)

MIN_SEGMENT = 0.12
# A cada quantos segundos de fala contínua vale um corte de ênfase (zoom), por ritmo.
SPLIT_EVERY = {"rapido": 3.0, "equilibrado": 5.5, "calmo": 9.0}


@dataclass
class Sentence:
    id: int
    words: list[Word]

    @property
    def start(self) -> float:
        return self.words[0].start

    @property
    def end(self) -> float:
        return self.words[-1].end

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)


def effective_effects(profile: StyleProfile, brief: Brief) -> Effects:
    return brief.efeitos or profile.efeitos


def max_duration(brief: Brief) -> float | None:
    return brief.duracao_max or PLATFORMS[brief.plataforma].duracao_max


def _norm(text: str) -> str:
    return re.sub(r"[^\wà-ú]", "", text.lower())


def remove_fillers(words: list[Word]) -> list[Word]:
    kept: list[Word] = []
    for i, w in enumerate(words):
        token = _norm(w.text)
        if token in FILLER_WORDS:
            if token not in SOFT_FILLERS:
                continue
            gap_before = w.start - words[i - 1].end if i > 0 else 1.0
            gap_after = words[i + 1].start - w.end if i + 1 < len(words) else 1.0
            if gap_before >= 0.15 and gap_after >= 0.15:
                continue
        kept.append(w)
    return kept


def split_sentences(words: list[Word], pause: float = 0.6) -> list[Sentence]:
    sentences: list[Sentence] = []
    current: list[Word] = []
    for i, w in enumerate(words):
        current.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        ends_sentence = w.text.rstrip().endswith((".", "!", "?"))
        long_pause = nxt is not None and nxt.start - w.end > pause
        if nxt is None or ends_sentence or long_pause:
            sentences.append(Sentence(id=len(sentences), words=current))
            current = []
    return sentences


def runs_from_words(words: list[Word], max_gap: float) -> list[tuple[float, float]]:
    """Agrupa palavras em trechos contínuos de fala."""
    runs: list[tuple[float, float]] = []
    for w in words:
        if runs and w.start - runs[-1][1] <= max_gap:
            runs[-1] = (runs[-1][0], max(runs[-1][1], w.end))
        else:
            runs.append((w.start, w.end))
    return runs


def runs_from_silences(analysis: Analysis, max_gap: float) -> list[tuple[float, float]]:
    """Sem transcrição: fala = tudo que não é silêncio longo."""
    duration = analysis.media.duration
    runs: list[tuple[float, float]] = []
    cursor = 0.0
    for s in analysis.silences:
        if s.end - s.start <= max_gap:
            continue
        if s.start > cursor:
            runs.append((cursor, s.start))
        cursor = s.end
    if cursor < duration:
        runs.append((cursor, duration))
    return runs


def pad_and_merge(runs: list[tuple[float, float]], pad: float, duration: float) -> list[tuple[float, float]]:
    merged: list[tuple[float, float]] = []
    for start, end in sorted(runs):
        start, end = max(0.0, start - pad), min(duration, end + pad)
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return [(s, e) for s, e in merged if e - s >= MIN_SEGMENT]


def split_long(
    runs: list[tuple[float, float]], every: float, words: list[Word] | None,
) -> list[tuple[float, float]]:
    """Quebra trechos longos em pontos entre palavras, para alternar enquadramentos."""
    out: list[tuple[float, float]] = []
    for start, end in runs:
        while end - start > every * 1.5:
            target = start + every
            cut = target
            if words:
                inside = [w for w in words if start < w.end < end - 0.5]
                if inside:
                    cut = min(inside, key=lambda w: abs(w.end - target)).end
            if cut - start < MIN_SEGMENT or end - cut < MIN_SEGMENT:
                break
            out.append((start, cut))
            start = cut
        out.append((start, end))
    return out


def cap_duration(segments: list[Segment], limit: float | None) -> list[Segment]:
    if not limit:
        return segments
    kept: list[Segment] = []
    total = 0.0
    for seg in segments:
        if total + seg.duration > limit:
            remaining = limit - total
            if remaining >= 1.0:
                kept.append(seg.model_copy(update={"end": seg.start + remaining}))
            break
        kept.append(seg)
        total += seg.duration
    return kept


def zoom_strength(profile: StyleProfile) -> float:
    preset = STYLE_PRESETS.get(profile.preset)
    return preset.zoom_forca if preset and preset.zoom_forca > 1.0 else 1.12


def alternate_zoom(runs: list[tuple[float, float]], strength: float, motivo: str) -> list[Segment]:
    return [
        Segment(start=s, end=e, zoom=strength if i % 2 else 1.0, motivo=motivo)
        for i, (s, e) in enumerate(runs)
    ]


def plan_heuristic(analysis: Analysis, profile: StyleProfile, brief: Brief) -> EditPlan:
    fx = effective_effects(profile, brief)
    duration = analysis.media.duration
    max_gap = PACE_MAX_GAP[profile.ritmo]
    pad = PACE_PADDING[profile.ritmo]
    words = analysis.transcript.words if analysis.transcript else []
    if words and fx.remover_vicios:
        words = remove_fillers(words)

    if not fx.cortar_silencios:
        runs = [(0.0, duration)]
    elif words:
        runs = runs_from_words(words, max_gap)
    else:
        runs = runs_from_silences(analysis, max_gap)
    runs = pad_and_merge(runs, pad, duration) or [(0.0, duration)]

    if fx.zoom_dinamico:
        runs = split_long(runs, SPLIT_EVERY[profile.ritmo.value], words or None)
        segments = alternate_zoom(runs, zoom_strength(profile), "corte de ênfase")
    else:
        segments = [Segment(start=s, end=e, motivo="fala") for s, e in runs]

    segments = cap_duration(segments, max_duration(brief))
    removed = duration - sum(s.duration for s in segments)
    return EditPlan(
        segments=segments,
        resumo_edicao=(
            f"Removi {removed:.1f}s de pausas e trechos sem fala, "
            f"montei {len(segments)} cortes no ritmo {profile.ritmo.value}."
        ),
        autor="heuristico",
    )


# --------------------------------------------------------------------------
# Diretor com Claude
# --------------------------------------------------------------------------

CLAUDE_MODEL = "claude-opus-5-5"

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "sequencia": {
            "type": "array",
            "description": "Frases que entram no vídeo final, na ordem em que devem aparecer.",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "zoom": {"type": "boolean", "description": "Punch-in de ênfase nesta frase."},
                    "texto_tela": {
                        "type": "string",
                        "description": "Texto curto de tela (até 6 palavras) ou vazio.",
                    },
                },
                "required": ["id", "zoom", "texto_tela"],
                "additionalProperties": False,
            },
        },
        "destaques": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Palavras-chave para destacar na legenda.",
        },
        "titulo": {"type": "string"},
        "descricao": {"type": "string"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
        "resumo_edicao": {
            "type": "string",
            "description": "2 a 3 frases, em português simples, explicando as decisões de edição.",
        },
    },
    "required": ["sequencia", "destaques", "titulo", "descricao", "hashtags", "resumo_edicao"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """Você é o diretor de edição da Elotake, um editor de vídeo automático.
Você recebe a transcrição de um vídeo bruto dividida em frases numeradas, o estilo
de edição do criador e o pedido para este vídeo. Sua tarefa é decidir a montagem:
quais frases entram, em que ordem, onde dar ênfase e qual texto vai na tela.

Como decidir:
- Remova frases repetidas, tropeços, falsos começos, frases incompletas e trechos
  que não servem ao objetivo. Quando a mesma ideia foi dita duas vezes, fique com a
  melhor versão (normalmente a última).
- Mantenha o sentido: a sequência final precisa soar natural, como se a pessoa
  tivesse falado assim de primeira.
- Se o gancho inicial estiver ativo, você pode mover a frase mais forte para o
  começo. Só faça isso se ela fizer sentido fora de contexto.
- Respeite a duração máxima, somando as durações das frases escolhidas.
- Use zoom com intenção: frases de impacto, números, promessas, viradas. Em ritmo
  rápido, cerca de uma a cada duas frases; em ritmo calmo, raramente.
- Texto de tela é raro e curto: só para reforçar a ideia central ou um número.
- Título, descrição e hashtags devem servir à plataforma de destino, no idioma do vídeo.
"""


def _sentences_payload(sentences: list[Sentence]) -> str:
    return "\n".join(
        f"[{s.id}] ({s.start:.2f}s–{s.end:.2f}s, {s.end - s.start:.1f}s) {s.text}" for s in sentences
    )


def build_claude_request(analysis: Analysis, profile: StyleProfile, brief: Brief, sentences: list[Sentence]) -> dict:
    fx = effective_effects(profile, brief)
    spec = PLATFORMS[brief.plataforma]
    limit = max_duration(brief)
    user = f"""## Estilo do criador
Preset: {profile.preset} | Ritmo: {profile.ritmo.value} | Clima da música: {profile.clima_musica}
Gancho inicial: {"ativo" if fx.gancho_inicial else "desativado"}
Referências que o criador gosta: {", ".join(profile.referencias) or "nenhuma informada"}
Observações do criador: {profile.observacoes or "nenhuma"}

## Pedido deste vídeo
Destino: {spec.nome}. {spec.dica}
Objetivo: {brief.objetivo or "não informado"}
Duração máxima: {f"{limit:.0f}s" if limit else "sem limite"}
Duração do bruto: {analysis.media.duration:.1f}s

## Transcrição em frases
{_sentences_payload(sentences)}
"""
    return {
        "model": CLAUDE_MODEL,
        "max_tokens": 16000,
        "thinking": {"type": "adaptive"},
        "output_config": {
            "effort": "medium",
            "format": {"type": "json_schema", "schema": PLAN_SCHEMA},
        },
        "betas": ["server-side-fallback-2026-07-01"],
        "fallbacks": "default",
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user}],
    }


def plan_from_decision(
    decision: dict, sentences: list[Sentence], analysis: Analysis, profile: StyleProfile, brief: Brief,
) -> EditPlan:
    fx = effective_effects(profile, brief)
    by_id = {s.id: s for s in sentences}
    max_gap = PACE_MAX_GAP[profile.ritmo]
    pad = PACE_PADDING[profile.ritmo]
    strength = zoom_strength(profile)
    segments: list[Segment] = []
    overlays: list[TextOverlay] = []
    seen: set[int] = set()
    for item in decision["sequencia"]:
        sentence = by_id.get(item["id"])
        if sentence is None or sentence.id in seen:
            continue
        seen.add(sentence.id)
        words = remove_fillers(sentence.words) if fx.remover_vicios else sentence.words
        if not words:
            continue
        runs = runs_from_words(words, max_gap) if fx.cortar_silencios else [(sentence.start, sentence.end)]
        runs = pad_and_merge(runs, pad, analysis.media.duration)
        out_start = sum(s.duration for s in segments)
        zoom = strength if (item["zoom"] and fx.zoom_dinamico) else 1.0
        for start, end in runs:
            segments.append(Segment(start=start, end=end, zoom=zoom, motivo=f"frase {sentence.id}"))
        text = item["texto_tela"].strip()
        if text:
            out_end = sum(s.duration for s in segments)
            overlays.append(TextOverlay(text=text, start=out_start, end=min(out_end, out_start + 2.5)))

    if not segments:
        raise ValueError("o diretor não escolheu nenhuma frase")
    segments = cap_duration(segments, max_duration(brief))
    return EditPlan(
        segments=segments,
        overlays=overlays,
        destaques=decision.get("destaques", []),
        titulo=decision.get("titulo", ""),
        descricao=decision.get("descricao", ""),
        hashtags=decision.get("hashtags", []),
        resumo_edicao=decision.get("resumo_edicao", ""),
        autor="claude",
    )


def plan_with_claude(analysis: Analysis, profile: StyleProfile, brief: Brief, client=None) -> EditPlan:
    import anthropic

    words = analysis.transcript.words if analysis.transcript else []
    sentences = split_sentences(words)
    if not sentences:
        raise ValueError("sem transcrição: o diretor com IA precisa das falas")
    client = client or anthropic.Anthropic()
    request = build_claude_request(analysis, profile, brief, sentences)
    with client.beta.messages.stream(**request) as stream:
        response = stream.get_final_message()
    if response.stop_reason == "refusal":
        raise RuntimeError("o modelo recusou o pedido de edição")
    if response.stop_reason == "max_tokens":
        raise RuntimeError("resposta do diretor truncada")
    text = next(b.text for b in response.content if b.type == "text")
    return plan_from_decision(json.loads(text), sentences, analysis, profile, brief)


def make_plan(analysis: Analysis, profile: StyleProfile, brief: Brief, use_ai: bool = True, client=None) -> EditPlan:
    """Usa o Claude quando possível; cai para as regras se não houver fala ou se a IA falhar."""
    has_words = bool(analysis.transcript and analysis.transcript.words)
    if use_ai and has_words:
        try:
            return plan_with_claude(analysis, profile, brief, client=client)
        except Exception as exc:  # a edição nunca pode parar por causa da IA
            log.warning("diretor com IA falhou (%s); usando regras", exc)
    return plan_heuristic(analysis, profile, brief)
