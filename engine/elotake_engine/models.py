"""Modelos de dados do motor Elotake.

O fluxo inteiro gira em torno de três objetos:

- ``StyleProfile``: o "DNA" de edição do usuário (configurado uma vez).
- ``Brief``: o pedido de um vídeo específico (destino, objetivo, efeitos).
- ``EditPlan``: a decisão de edição (o que cortar, em que ordem, zooms,
  legendas...). A IA produz o plano; o renderizador só executa.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class Platform(str, Enum):
    youtube = "youtube"
    reels = "reels"  # Reels / TikTok / Shorts
    ads = "ads"
    feed = "feed"  # post de feed 4:5
    podcast = "podcast"


class Pace(str, Enum):
    calmo = "calmo"
    equilibrado = "equilibrado"
    rapido = "rapido"


class CaptionStyle(str, Enum):
    nenhuma = "nenhuma"
    destaque = "destaque"  # caixa alta, palavra ativa colorida (estilo creator)
    limpa = "limpa"  # frase inteira, discreta
    karaoke = "karaoke"  # palavra a palavra, grande no centro


class ReframeMode(str, Enum):
    crop = "crop"  # corta no centro para preencher o quadro
    blur = "blur"  # encaixa o vídeo inteiro sobre fundo desfocado


class Effects(BaseModel):
    cortar_silencios: bool = True
    remover_vicios: bool = True  # "né", "tipo", "ahn"...
    zoom_dinamico: bool = True
    legendas: bool = True
    flash_transicao: bool = False
    granulado: bool = False
    barras_cinema: bool = False
    vinheta: bool = False
    musica: bool = True
    melhorar_audio: bool = True
    gancho_inicial: bool = True  # abre com a frase mais forte


class StyleProfile(BaseModel):
    """O DNA de edição do usuário."""

    id: str = "padrao"
    nome: str = "Meu estilo"
    preset: str = "dinamico"
    ritmo: Pace = Pace.equilibrado
    legenda: CaptionStyle = CaptionStyle.destaque
    cor_destaque: str = "#FFD400"  # cor da palavra ativa na legenda
    fonte: str = "Inter"
    cor: str = "natural"  # preset de color grading
    clima_musica: str = "energetico"
    referencias: list[str] = Field(default_factory=list)  # links de vídeos que a pessoa ama
    observacoes: str = ""  # instruções livres ("nunca use emojis", "fale com público jovem")
    efeitos: Effects = Field(default_factory=Effects)


class Brief(BaseModel):
    """O pedido de um vídeo específico."""

    plataforma: Platform = Platform.reels
    objetivo: str = ""  # "anúncio do curso X, público iniciante"
    duracao_max: float | None = None  # segundos; None = padrão da plataforma
    reenquadrar: ReframeMode = ReframeMode.crop
    efeitos: Effects | None = None  # None = usa os efeitos do StyleProfile


class Word(BaseModel):
    text: str
    start: float
    end: float


class Transcript(BaseModel):
    language: str = "pt"
    words: list[Word] = Field(default_factory=list)


class Silence(BaseModel):
    start: float
    end: float


class MediaInfo(BaseModel):
    duration: float
    width: int
    height: int
    fps: float
    has_audio: bool = True


class Analysis(BaseModel):
    media: MediaInfo
    silences: list[Silence] = Field(default_factory=list)
    scenes: list[float] = Field(default_factory=list)
    transcript: Transcript | None = None


class Segment(BaseModel):
    """Trecho do vídeo original que entra no corte final, na ordem de saída."""

    start: float
    end: float
    zoom: float = 1.0  # 1.0 = sem zoom; 1.15 = punch-in de 15%
    motivo: str = ""

    @property
    def duration(self) -> float:
        return self.end - self.start


class TextOverlay(BaseModel):
    text: str
    start: float  # na linha do tempo de saída
    end: float


class EditPlan(BaseModel):
    segments: list[Segment]
    overlays: list[TextOverlay] = Field(default_factory=list)
    destaques: list[str] = Field(default_factory=list)  # palavras enfatizadas na legenda
    titulo: str = ""
    descricao: str = ""
    hashtags: list[str] = Field(default_factory=list)
    resumo_edicao: str = ""  # explicação em linguagem simples do que foi feito
    autor: str = "heuristico"  # "heuristico" ou "claude"

    @property
    def duration(self) -> float:
        return sum(s.duration for s in self.segments)
