"""Legendas animadas (ASS) na linha do tempo do vídeo final."""

from __future__ import annotations

import re

from .models import CaptionStyle, EditPlan, TextOverlay, Transcript, Word

# Palavras por bloco e caracteres máximos, por estilo.
CHUNKING = {
    CaptionStyle.destaque: (3, 18),
    CaptionStyle.limpa: (7, 42),
    CaptionStyle.karaoke: (1, 14),
}


def remap_words(transcript: Transcript, plan: EditPlan) -> list[Word]:
    """Converte o tempo das palavras do bruto para o tempo do vídeo editado."""
    out: list[Word] = []
    offset = 0.0
    for seg in plan.segments:
        for w in transcript.words:
            mid = (w.start + w.end) / 2
            if seg.start <= mid <= seg.end:
                start = offset + max(w.start, seg.start) - seg.start
                end = offset + min(w.end, seg.end) - seg.start
                out.append(Word(text=w.text, start=start, end=max(end, start + 0.05)))
        offset += seg.duration
    return out


def chunk_words(words: list[Word], style: CaptionStyle) -> list[list[Word]]:
    max_words, max_chars = CHUNKING[style]
    chunks: list[list[Word]] = []
    current: list[Word] = []
    for w in words:
        too_long = len(" ".join(x.text for x in current + [w])) > max_chars
        gap = current and w.start - current[-1].end > 0.35
        if current and (len(current) >= max_words or too_long or gap):
            chunks.append(current)
            current = []
        current.append(w)
        if w.text.endswith((".", "!", "?", ",")):
            chunks.append(current)
            current = []
    if current:
        chunks.append(current)
    return chunks


def ass_time(t: float) -> str:
    t = max(0.0, t)
    cs = int(round(t * 100))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def ass_color(hex_color: str, alpha: int = 0) -> str:
    h = hex_color.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def clean(text: str, upper: bool) -> str:
    text = re.sub(r"[{}\\]", "", text).strip()
    return text.upper() if upper else text


def _norm(text: str) -> str:
    return re.sub(r"[^\wà-ú]", "", text.lower())


def build_ass(
    words: list[Word],
    style: CaptionStyle,
    width: int,
    height: int,
    highlight: str = "#FFD400",
    font: str = "Inter",
    emphasis: list[str] | None = None,
    overlays: list[TextOverlay] | None = None,
) -> str:
    base = min(width, height)
    vertical = height > width
    hl = ass_color(highlight)
    emphasis_set = {_norm(e) for e in (emphasis or [])}

    sizes = {
        CaptionStyle.destaque: 0.085,
        CaptionStyle.limpa: 0.05,
        CaptionStyle.karaoke: 0.11,
    }
    size = int(base * sizes.get(style, 0.06))
    margin_v = int(height * (0.26 if vertical else 0.08))
    if style == CaptionStyle.karaoke:
        margin_v = int(height * (0.40 if vertical else 0.30))
    outline = max(2, size // 12)
    box = style == CaptionStyle.limpa
    border_style = 3 if box else 1  # 3 = caixa opaca atrás do texto

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Legenda,{font},{size},&H00FFFFFF,&H00FFFFFF,{"&H80000000" if box else "&H00000000"},&H80000000,-1,0,0,0,100,100,0,0,{border_style},{outline if not box else size // 5},{0 if box else 2},2,{int(width * 0.08)},{int(width * 0.08)},{margin_v},1
Style: Tela,{font},{int(base * 0.075)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,{max(3, base // 160)},3,8,{int(width * 0.06)},{int(width * 0.06)},{int(height * (0.12 if vertical else 0.08))},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines: list[str] = []
    upper = style in (CaptionStyle.destaque, CaptionStyle.karaoke)

    if style != CaptionStyle.nenhuma:
        for chunk in chunk_words(words, style):
            chunk_end = chunk[-1].end + 0.08
            if style == CaptionStyle.limpa:
                text = " ".join(
                    f"{{\\c{hl}}}{clean(w.text, False)}{{\\r}}" if _norm(w.text) in emphasis_set
                    else clean(w.text, False)
                    for w in chunk
                )
                lines.append(
                    f"Dialogue: 0,{ass_time(chunk[0].start)},{ass_time(chunk_end)},Legenda,,0,0,0,,{text}"
                )
                continue
            for i, w in enumerate(chunk):
                start = w.start
                end = chunk[i + 1].start if i + 1 < len(chunk) else chunk_end
                parts = []
                for j, other in enumerate(chunk):
                    token = clean(other.text, upper)
                    if j == i:
                        parts.append(
                            f"{{\\c{hl}\\fscx118\\fscy118\\t(0,110,\\fscx100\\fscy100)}}{token}{{\\r}}"
                        )
                    else:
                        parts.append(token)
                lines.append(
                    f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Legenda,,0,0,0,,{' '.join(parts)}"
                )

    for ov in overlays or []:
        lines.append(
            f"Dialogue: 1,{ass_time(ov.start)},{ass_time(ov.end)},Tela,,0,0,0,,"
            f"{{\\fad(150,150)}}{clean(ov.text, True)}"
        )
    return header + "\n".join(lines) + "\n"
