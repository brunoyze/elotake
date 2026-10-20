import json
import subprocess

import pytest

from elotake_engine.captions import ass_color, ass_time, build_ass, remap_words
from elotake_engine.models import (
    Brief, CaptionStyle, EditPlan, Effects, Platform, ReframeMode, Segment, Transcript, Word,
)
from elotake_engine.pipeline import edit_video, learn_from_reference
from elotake_engine.presets import profile_from_preset
from elotake_engine.render import crop_box


def stream_info(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    data = json.loads(out)
    video = next(s for s in data["streams"] if s["codec_type"] == "video")
    audio = [s for s in data["streams"] if s["codec_type"] == "audio"]
    return int(video["width"]), int(video["height"]), float(data["format"]["duration"]), bool(audio)


def test_ass_helpers():
    assert ass_time(3661.256) == "1:01:01.26"
    assert ass_color("#FFD400") == "&H0000D4FF"


def test_crop_box_vertical_from_horizontal():
    assert crop_box(1920, 1080, 1080, 1920, 1.0) == (606, 1080)
    w, h = crop_box(1920, 1080, 1080, 1920, 1.2)
    assert h == 900


def test_remap_words_follows_segment_order():
    t = Transcript(words=[Word(text="a", start=1.0, end=1.2), Word(text="b", start=5.0, end=5.3)])
    plan = EditPlan(segments=[Segment(start=4.9, end=5.5), Segment(start=0.9, end=1.4)])
    remapped = remap_words(t, plan)
    assert [w.text for w in remapped] == ["b", "a"]
    assert remapped[0].start == pytest.approx(0.1)
    assert remapped[1].start == pytest.approx(0.6 + 0.1)


def test_build_ass_highlights_active_word():
    ws = [Word(text="isso", start=0, end=0.3), Word(text="funciona", start=0.3, end=0.8)]
    ass = build_ass(ws, CaptionStyle.destaque, 1080, 1920)
    assert "PlayResY: 1920" in ass
    assert ass.count("Dialogue:") == 2
    assert "ISSO" in ass and "FUNCIONA" in ass


def test_edit_video_end_to_end_vertical_with_captions(raw_video, tmp_path):
    video, transcript = raw_video
    profile = profile_from_preset("dinamico")
    brief = Brief(plataforma=Platform.reels)
    result = edit_video(video, profile, brief, tmp_path / "job", transcript=transcript, use_ai=False)

    w, h, dur, has_audio = stream_info(result.output)
    assert (w, h) == (1080, 1920)
    assert has_audio
    assert dur < result.analysis.media.duration - 3  # cortou as pausas longas
    assert dur == pytest.approx(result.plan.duration, abs=0.3)
    assert (tmp_path / "job" / "captions.ass").is_file()
    assert result.thumbnail.is_file()
    assert "Um." not in [w.text for w in remap_words(transcript, result.plan)]


def test_edit_video_blur_reframe_with_effects_and_music(raw_video, tmp_path):
    video, transcript = raw_video
    music = tmp_path / "musica.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                    "sine=frequency=220:duration=4", str(music)], check=True)
    profile = profile_from_preset("cinematografico")
    brief = Brief(
        plataforma=Platform.feed,
        reenquadrar=ReframeMode.blur,
        efeitos=Effects(flash_transicao=True, granulado=True, barras_cinema=True, vinheta=True),
    )
    result = edit_video(video, profile, brief, tmp_path / "job", music=music,
                        transcript=transcript, use_ai=False)
    w, h, _, has_audio = stream_info(result.output)
    assert (w, h) == (1080, 1350) and has_audio


def test_edit_video_youtube_without_transcript(raw_video, tmp_path):
    video, _ = raw_video
    result = edit_video(video, profile_from_preset("clean"), Brief(plataforma=Platform.youtube),
                        tmp_path / "job", use_ai=False,
                        transcript=Transcript(words=[]))
    w, h, dur, _ = stream_info(result.output)
    assert (w, h) == (1920, 1080)
    assert dur < result.analysis.media.duration


def test_learn_from_reference(raw_video):
    video, _ = raw_video
    info = learn_from_reference(video)
    assert info["formato"] == "horizontal"
    assert info["ritmo_sugerido"] in {"calmo", "equilibrado", "rapido"}
