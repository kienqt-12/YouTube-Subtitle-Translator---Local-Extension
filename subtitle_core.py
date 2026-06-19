import html
import os
import re
import urllib.parse

from deep_translator import GoogleTranslator
from youtube_transcript_api import YouTubeTranscriptApi


def clear_dead_loopback_proxy():
    proxy_names = (
        "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
        "http_proxy", "https_proxy", "all_proxy",
    )
    for name in proxy_names:
        value = os.environ.get(name)
        if not value:
            continue
        try:
            parsed = urllib.parse.urlparse(
                value if "://" in value else f"http://{value}"
            )
            if parsed.hostname in {"127.0.0.1", "localhost", "::1"} and parsed.port == 9:
                os.environ.pop(name, None)
        except (TypeError, ValueError):
            continue


clear_dead_loopback_proxy()


def extract_video_id(url_or_id):
    if not url_or_id:
        return None
    value = str(url_or_id).strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", value):
        return value
    pattern = (
        r"[?&]v=([a-zA-Z0-9_-]{11})|"
        r"/(?:embed|shorts|live|v)/([a-zA-Z0-9_-]{11})|"
        r"youtu\.be/([a-zA-Z0-9_-]{11})"
    )
    match = re.search(pattern, value)
    return next((group for group in match.groups() if group), None) if match else None


def fetch_transcript_segments(video_id, preferred_languages=("en",)):
    transcript_list = YouTubeTranscriptApi().list(video_id)
    try:
        transcript = transcript_list.find_transcript(list(preferred_languages))
    except Exception:
        try:
            transcript = transcript_list.find_generated_transcript(
                list(preferred_languages)
            )
        except Exception:
            transcript = next(iter(transcript_list))

    formatted = []
    for entry in transcript.fetch().to_raw_data():
        start = float(entry["start"])
        duration = max(0.35, float(entry["duration"]))
        text = normalize_caption_text(entry["text"])
        if text:
            formatted.append({
                "start": start,
                "end": start + duration,
                "duration": duration,
                "text": text,
            })
    return formatted


def normalize_caption_text(text):
    value = html.unescape(str(text or ""))
    value = re.sub(r"<[^>]+>", "", value)
    return re.sub(r"\s+", " ", value).strip()


def remove_caption_overlap(existing_text, new_text, max_words=12):
    existing_words = existing_text.split()
    new_words = new_text.split()
    existing_keys = [re.sub(r"\W+", "", word).lower() for word in existing_words]
    new_keys = [re.sub(r"\W+", "", word).lower() for word in new_words]
    max_overlap = min(len(existing_words), len(new_words), max_words)
    for size in range(max_overlap, 0, -1):
        if existing_keys[-size:] == new_keys[:size]:
            return " ".join(new_words[size:])
    return new_text


def ends_spoken_sentence(text):
    abbreviations = {
        "mr.", "mrs.", "ms.", "dr.", "prof.", "sr.", "jr.",
        "vs.", "etc.", "e.g.", "i.e.",
    }
    words = text.lower().split()
    if words and words[-1].strip("\"'”’)]}") in abbreviations:
        return False
    return bool(re.search(r"[.!?…][\"'”’\])}]*$", text))


def merge_transcript_segments(segments, pause_threshold=0.8,
                              max_duration=11.0, max_chars=220):
    merged = []
    current = None

    def flush_current():
        nonlocal current
        if current and current["text"]:
            current["duration"] = max(
                0.35, current["end"] - current["start"]
            )
            merged.append(current)
        current = None

    for segment in segments:
        text = normalize_caption_text(segment.get("text"))
        if not text:
            continue
        start = max(0.0, float(segment.get("start", 0)))
        end = max(start + 0.35, float(segment.get("end", start + 2)))

        if current is None:
            current = {"start": start, "end": end, "text": text}
        else:
            gap = start - current["end"]
            unique_text = remove_caption_overlap(current["text"], text)
            combined = f"{current['text']} {unique_text}".strip()
            too_long = (
                end - current["start"] > max_duration
                or len(combined) > max_chars
            )
            if gap >= pause_threshold or too_long:
                flush_current()
                current = {"start": start, "end": end, "text": text}
            else:
                current["text"] = combined
                current["end"] = max(current["end"], end)

        is_sound_cue = bool(re.fullmatch(r"[\[(].+?[\])]", current["text"]))
        if ends_spoken_sentence(current["text"]) or is_sound_cue:
            flush_current()

    flush_current()
    return merged


def split_subtitle_text(text, max_chars=78, min_chars=34):
    words = normalize_caption_text(text).split()
    chunks = []
    current_words = []
    for word in words:
        candidate = " ".join(current_words + [word])
        if current_words and len(candidate) > max_chars:
            chunks.append(" ".join(current_words))
            current_words = [word]
            continue
        current_words.append(word)
        current_text = " ".join(current_words)
        if len(current_text) >= min_chars and re.search(
            r"[,;:.!?…][\"'”’\])}]*$", word
        ):
            chunks.append(current_text)
            current_words = []
    if current_words:
        chunks.append(" ".join(current_words))
    return chunks or [normalize_caption_text(text)]


def translate_segments(segments, target_language="vi", source_language="auto",
                       batch_size=25):
    translator = GoogleTranslator(
        source=source_language,
        target=target_language,
    )
    texts = [segment["text"] for segment in segments]
    translations = []
    for index in range(0, len(texts), batch_size):
        batch = texts[index:index + batch_size]
        try:
            translated_batch = translator.translate_batch(batch) or []
            if len(translated_batch) != len(batch):
                raise RuntimeError("Translation batch returned incomplete data")
            translations.extend(translated_batch)
        except Exception:
            for text in batch:
                try:
                    translations.append(translator.translate(text))
                except Exception:
                    translations.append(text)

    result = []
    for segment, translated in zip(segments, translations):
        item = dict(segment)
        item["translated"] = normalize_caption_text(translated)
        result.append(item)
    return result


def prepare_subtitle_segments(segments, max_chars=78):
    prepared = []
    for segment in segments:
        translated = normalize_caption_text(
            segment.get("translated", segment.get("text", ""))
        )
        if not translated:
            continue
        chunks = split_subtitle_text(translated, max_chars=max_chars)
        start = float(segment["start"])
        end = max(start + 0.35, float(segment.get("end", start + 2)))
        duration = end - start
        weights = [max(1, len(chunk)) for chunk in chunks]
        total_weight = sum(weights)
        elapsed_weight = 0
        for index, (chunk, weight) in enumerate(zip(chunks, weights)):
            chunk_start = start + duration * elapsed_weight / total_weight
            elapsed_weight += weight
            chunk_end = (
                end if index == len(chunks) - 1
                else start + duration * elapsed_weight / total_weight
            )
            prepared.append({
                "start": round(chunk_start, 3),
                "end": round(chunk_end, 3),
                "duration": round(chunk_end - chunk_start, 3),
                "text": segment.get("text", ""),
                "translated": chunk,
            })
    return prepared


PACING_PRESETS = {
    "short": {"pause_threshold": 0.55, "max_duration": 8.5},
    "natural": {"pause_threshold": 0.8, "max_duration": 11.0},
    "long": {"pause_threshold": 1.1, "max_duration": 14.0},
}


def build_translated_subtitles(video_id, target_language="vi",
                               pacing="natural"):
    raw_segments = fetch_transcript_segments(video_id)
    preset = PACING_PRESETS.get(pacing, PACING_PRESETS["natural"])
    sentences = merge_transcript_segments(raw_segments, **preset)
    translated = translate_segments(sentences, target_language=target_language)
    display_segments = prepare_subtitle_segments(translated)
    return {
        "video_id": video_id,
        "target_language": target_language,
        "pacing": pacing,
        "source_count": len(raw_segments),
        "sentence_count": len(sentences),
        "segments": display_segments,
    }
