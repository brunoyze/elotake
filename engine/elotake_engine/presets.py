"""Presets de estilo e destinos (plataformas).

Um preset é um ponto de partida para o StyleProfile. Uma plataforma define
formato de saída, duração e regras de ritmo.
"""

from __future__ import annotations

from dataclasses import dataclass

from .models import CaptionStyle, Effects, Pace, Platform, StyleProfile


@dataclass(frozen=True)
class PlatformSpec:
    nome: str
    width: int
    height: int
    duracao_max: float | None
    loudness: float  # LUFS alvo
    dica: str  # orientação para o diretor de IA


PLATFORMS: dict[Platform, PlatformSpec] = {
    Platform.youtube: PlatformSpec(
        "YouTube", 1920, 1080, None, -14.0,
        "Vídeo horizontal longo. Mantenha o raciocínio completo, corte pausas e repetições, "
        "abra com uma promessa clara nos primeiros 30 segundos.",
    ),
    Platform.reels: PlatformSpec(
        "Reels / TikTok / Shorts", 1080, 1920, 90.0, -14.0,
        "Vídeo vertical curto. Gancho forte no primeiro segundo, ritmo alto, "
        "uma ideia só, termine com chamada para ação ou frase de impacto.",
    ),
    Platform.ads: PlatformSpec(
        "Anúncio", 1080, 1920, 45.0, -14.0,
        "Anúncio pago. Estrutura gancho (0-3s) → problema → solução → prova → chamada para ação. "
        "Corte tudo que não vende. Clareza acima de tudo.",
    ),
    Platform.feed: PlatformSpec(
        "Feed 4:5", 1080, 1350, 60.0, -14.0,
        "Post de feed. Direto ao ponto, legível sem som.",
    ),
    Platform.podcast: PlatformSpec(
        "Podcast / entrevista", 1920, 1080, None, -16.0,
        "Conversa longa. Corte só silêncios longos e tropeços; preserve o tom natural.",
    ),
}


@dataclass(frozen=True)
class StylePreset:
    id: str
    nome: str
    descricao: str
    ritmo: Pace
    legenda: CaptionStyle
    cor: str
    clima_musica: str
    efeitos: Effects
    zoom_forca: float  # intensidade do punch-in


STYLE_PRESETS: dict[str, StylePreset] = {
    p.id: p
    for p in [
        StylePreset(
            "dinamico", "Dinâmico (creator)",
            "Cortes secos, zoom a cada frase, legenda grande com palavra destacada.",
            Pace.rapido, CaptionStyle.destaque, "vivo", "energetico",
            Effects(flash_transicao=False), 1.15,
        ),
        StylePreset(
            "cinematografico", "Cinematográfico",
            "Ritmo respirado, cor fílmica, barras de cinema, granulado e legenda discreta.",
            Pace.calmo, CaptionStyle.limpa, "filme", "emocional",
            Effects(zoom_dinamico=False, barras_cinema=True, granulado=True, vinheta=True), 1.06,
        ),
        StylePreset(
            "clean", "Clean / corporativo",
            "Profissional e sóbrio. Cortes de pausas, legenda limpa, cor natural.",
            Pace.equilibrado, CaptionStyle.limpa, "natural", "corporativo",
            Effects(zoom_dinamico=False), 1.0,
        ),
        StylePreset(
            "ugc_ads", "UGC para anúncios",
            "Cara de conteúdo orgânico que converte: gancho forte, legenda karaokê, flash nos cortes.",
            Pace.rapido, CaptionStyle.karaoke, "vivo", "energetico",
            Effects(flash_transicao=True), 1.12,
        ),
        StylePreset(
            "podcast", "Podcast",
            "Natural e fluido. Remove só silêncios longos e tropeços.",
            Pace.calmo, CaptionStyle.limpa, "natural", "sem_musica",
            Effects(zoom_dinamico=False, remover_vicios=False, musica=False, gancho_inicial=False), 1.0,
        ),
    ]
}


def profile_from_preset(preset_id: str, **overrides) -> StyleProfile:
    p = STYLE_PRESETS[preset_id]
    data = dict(
        preset=p.id,
        nome=p.nome,
        ritmo=p.ritmo,
        legenda=p.legenda,
        cor=p.cor,
        clima_musica=p.clima_musica,
        efeitos=p.efeitos.model_copy(),
    )
    data.update(overrides)
    return StyleProfile(**data)


# Quanto silêncio tolerar entre falas, por ritmo (segundos).
PACE_MAX_GAP: dict[Pace, float] = {
    Pace.calmo: 0.6,
    Pace.equilibrado: 0.35,
    Pace.rapido: 0.15,
}

# Respiro mantido antes/depois de cada trecho de fala (segundos).
PACE_PADDING: dict[Pace, float] = {
    Pace.calmo: 0.15,
    Pace.equilibrado: 0.08,
    Pace.rapido: 0.04,
}

# Color grading: filtros FFmpeg por preset de cor.
COLOR_GRADES: dict[str, str] = {
    "natural": "eq=contrast=1.03:saturation=1.05",
    "vivo": "eq=contrast=1.08:saturation=1.25:gamma=0.98",
    "filme": "eq=contrast=1.06:saturation=0.85:gamma=1.02,"
    "colorbalance=rs=0.04:bs=-0.04:rh=-0.02:bh=0.05",
    "pb": "hue=s=0,eq=contrast=1.15",
}

# Vícios de linguagem removidos quando aparecem isolados.
FILLER_WORDS = {
    "ahn", "ah", "eh", "éh", "hum", "hmm", "uh", "um", "ãh", "ã", "tipo", "né",
    "então", "assim", "sabe",
}
# Destes, só removemos com segurança quando a palavra é curta e "solta" (pausa ao redor).
SOFT_FILLERS = {"tipo", "né", "então", "assim", "sabe"}


def catalog() -> dict:
    """Tudo que a interface precisa saber sobre estilos e destinos (exportado para web/)."""
    from .models import CaptionStyle

    return {
        "estilos": [
            {
                "id": p.id, "nome": p.nome, "descricao": p.descricao, "ritmo": p.ritmo.value,
                "legenda": p.legenda.value, "cor": p.cor, "efeitos": p.efeitos.model_dump(),
            }
            for p in STYLE_PRESETS.values()
        ],
        "perfis": {pid: profile_from_preset(pid, id=pid).model_dump(mode="json") for pid in STYLE_PRESETS},
        "plataformas": [
            {"id": k.value, "nome": v.nome, "largura": v.width, "altura": v.height, "duracao_max": v.duracao_max}
            for k, v in PLATFORMS.items()
        ],
        "cores": list(COLOR_GRADES),
        "legendas": [c.value for c in CaptionStyle],
        "ritmos": [p.value for p in Pace],
    }
