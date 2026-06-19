import html
import os
import re
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

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


TRAILING_CONNECTORS = {
    "a", "an", "the", "and", "or", "but", "so", "because", "if",
    "when", "while", "that", "which", "who", "whose", "where",
    "of", "to", "for", "with", "from", "in", "on", "at", "by",
    "as", "is", "are", "was", "were", "be", "been", "being",
    "this", "these", "those", "its", "their", "our", "your",
}


def ends_incomplete_phrase(text):
    words = re.findall(r"[A-Za-zÀ-ỹ0-9']+", text.lower())
    return bool(words and words[-1] in TRAILING_CONNECTORS)


def ends_clause_boundary(text):
    return bool(re.search(r"[,;:][\"'”’\])}]*$", text))


def _complete_sentence_parts(text):
    completed = []
    cursor = 0
    boundary_pattern = re.compile(r"[.!?…][\"'”’\])}]*\s+")
    for match in boundary_pattern.finditer(text):
        candidate = text[cursor:match.end()].strip()
        if candidate and ends_spoken_sentence(candidate):
            completed.append(candidate)
            cursor = match.end()
    trailing = text[cursor:].strip()
    if trailing and ends_spoken_sentence(trailing):
        completed.append(trailing)
        trailing = ""
    return completed, trailing


def refine_sentence_units(groups):
    """Carry unfinished clauses forward and split multi-sentence caption blocks."""
    refined = []
    pending_text = ""
    pending_start = None

    for index, group in enumerate(groups):
        group_start = float(group["start"])
        group_end = float(group["end"])
        if index + 1 < len(groups):
            next_start = float(groups[index + 1]["start"])
            if next_start > group_start:
                group_end = min(group_end, next_start)
        group_end = max(group_start + 0.35, group_end)
        text = normalize_caption_text(group["text"])

        is_sound_cue = bool(re.fullmatch(r"[\[(].+?[\])]", text))
        if is_sound_cue:
            if pending_text:
                refined.append({
                    "start": pending_start,
                    "end": group_start,
                    "duration": max(0.35, group_start - pending_start),
                    "text": pending_text,
                })
                pending_text = ""
                pending_start = None
            refined.append({
                "start": group_start,
                "end": group_end,
                "duration": group_end - group_start,
                "text": text,
            })
            continue

        combined = f"{pending_text} {text}".strip()
        combined_start = pending_start if pending_start is not None else group_start
        completed, trailing = _complete_sentence_parts(combined)
        total_chars = max(1, len(combined))
        cursor_time = combined_start
        consumed_chars = 0

        for sentence in completed:
            consumed_chars += len(sentence)
            sentence_end = combined_start + (
                (group_end - combined_start) * consumed_chars / total_chars
            )
            sentence_end = max(cursor_time + 0.35, min(group_end, sentence_end))
            refined.append({
                "start": cursor_time,
                "end": sentence_end,
                "duration": sentence_end - cursor_time,
                "text": sentence,
            })
            cursor_time = sentence_end

        pending_text = trailing
        pending_start = cursor_time if trailing else None

    if pending_text:
        final_end = max(pending_start + 0.35, float(groups[-1]["end"]))
        refined.append({
            "start": pending_start,
            "end": final_end,
            "duration": final_end - pending_start,
            "text": pending_text,
        })

    for index, unit in enumerate(refined[:-1]):
        next_start = refined[index + 1]["start"]
        if next_start > unit["start"]:
            unit["end"] = min(unit["end"], next_start)
            unit["duration"] = max(0.35, unit["end"] - unit["start"])
    return refined


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
            current_duration = current["end"] - current["start"]
            soft_limit = (
                current_duration >= max_duration
                or len(current["text"]) >= max_chars
            )
            hard_limit = (
                current_duration >= max_duration * 1.75
                or len(current["text"]) >= int(max_chars * 1.6)
            )
            emergency_limit = (
                current_duration >= max_duration * 2.2
                or len(current["text"]) >= max_chars * 2
            )
            incomplete = ends_incomplete_phrase(current["text"])
            should_break = (
                (gap >= pause_threshold and not incomplete)
                or (soft_limit and ends_clause_boundary(current["text"]))
                or (hard_limit and not incomplete)
                or emergency_limit
            )
            if should_break:
                flush_current()
                current = {"start": start, "end": end, "text": text}
            else:
                current["text"] = f"{current['text']} {unique_text}".strip()
                current["end"] = max(current["end"], end)

        is_sound_cue = bool(re.fullmatch(r"[\[(].+?[\])]", current["text"]))
        if ends_spoken_sentence(current["text"]) or is_sound_cue:
            flush_current()

    flush_current()
    return refine_sentence_units(merged)


DISPLAY_CONNECTORS = TRAILING_CONNECTORS | {
    "và", "hoặc", "nhưng", "mà", "của", "để", "với", "trong",
    "trên", "từ", "là", "một", "những", "các", "rằng", "khi",
    "vì", "nếu",
}


def _display_word_key(word):
    return re.sub(r"[^A-Za-zÀ-ỹ0-9']+", "", word).lower()


def split_subtitle_text(text, max_chars=78, min_chars=34):
    words = normalize_caption_text(text).split()
    chunks = []
    remaining = list(words)

    while remaining:
        if len(" ".join(remaining)) <= max_chars:
            chunks.append(" ".join(remaining))
            break

        fit = 1
        for index in range(1, len(remaining) + 1):
            if len(" ".join(remaining[:index])) <= max_chars:
                fit = index
            else:
                break

        minimum_length = min(min_chars, max_chars // 2)
        punctuation_break = None
        for index in range(fit, 0, -1):
            candidate = " ".join(remaining[:index])
            if len(candidate) < minimum_length:
                break
            if re.search(r"[,;:.!?…][\"'”’\])}]*$", remaining[index - 1]):
                punctuation_break = index
                break

        break_at = punctuation_break or fit
        while (
            break_at > 1
            and _display_word_key(remaining[break_at - 1]) in DISPLAY_CONNECTORS
        ):
            break_at -= 1
        if break_at <= 0:
            break_at = fit

        chunks.append(" ".join(remaining[:break_at]))
        remaining = remaining[break_at:]

    if len(chunks) > 1 and len(chunks[-1]) < min_chars // 2:
        combined = f"{chunks[-2]} {chunks[-1]}"
        if len(combined) <= int(max_chars * 1.3):
            chunks[-2:] = [combined]
    return chunks or [normalize_caption_text(text)]


def translate_segments(segments, target_language="vi", source_language="auto",
                       max_workers=2, max_request_chars=3500,
                       progress_callback=None):
    texts = [segment["text"] for segment in segments]

    packs = []
    current_pack = []
    current_length = 0
    marker_length = len("<<<SUBTITLE_BREAK_000000>>>") + 2
    for index, text in enumerate(texts):
        added_length = len(text) + (marker_length if current_pack else 0)
        if current_pack and current_length + added_length > max_request_chars:
            packs.append(current_pack)
            current_pack = []
            current_length = 0
        current_pack.append((index, text))
        current_length += len(text) + (marker_length if len(current_pack) > 1 else 0)
    if current_pack:
        packs.append(current_pack)

    def translate_text(text):
        last_error = None
        for attempt in range(2):
            try:
                return GoogleTranslator(
                    source=source_language,
                    target=target_language,
                ).translate(text)
            except Exception as error:
                last_error = error
                if attempt == 0:
                    time.sleep(0.35)
        raise RuntimeError(f"Google Translate request failed: {last_error}")

    def translate_pack(pack):
        markers = [
            f"<<<SUBTITLE_BREAK_{index:06d}>>>"
            for index in range(len(pack) - 1)
        ]
        payload_parts = []
        for item_index, (_original_index, text) in enumerate(pack):
            payload_parts.append(text)
            if item_index < len(markers):
                payload_parts.append(markers[item_index])
        payload = "\n".join(payload_parts)

        try:
            translated_payload = translate_text(payload)
            marker_pattern = r"\s*<<<SUBTITLE_BREAK_\d{6}>>>\s*"
            translated_parts = re.split(marker_pattern, translated_payload)
            if len(translated_parts) != len(pack):
                raise RuntimeError("Google Translate changed subtitle markers")
            return [
                (original_index, normalize_caption_text(translated))
                for (original_index, _text), translated in zip(
                    pack,
                    translated_parts,
                )
            ]
        except Exception:
            # Marker parsing can rarely fail. Retry only this small pack one
            # sentence at a time instead of silently returning English text.
            return [
                (original_index, normalize_caption_text(translate_text(text)))
                for original_index, text in pack
            ]

    translations = [None] * len(texts)
    worker_count = max(1, min(max_workers, len(packs)))
    started_at = time.perf_counter()
    completed_sentences = 0
    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        futures = {
            executor.submit(translate_pack, pack): pack
            for pack in packs
        }
        for future in as_completed(futures):
            completed_pack = future.result()
            for index, translated in completed_pack:
                translations[index] = translated
            completed_sentences += len(completed_pack)
            if progress_callback:
                elapsed = max(0.001, time.perf_counter() - started_at)
                remaining = max(0, len(texts) - completed_sentences)
                eta_seconds = (
                    elapsed / completed_sentences * remaining
                    if completed_sentences else None
                )
                progress_callback({
                    "phase": "translating",
                    "completed": completed_sentences,
                    "total": len(texts),
                    "elapsed_seconds": round(elapsed, 1),
                    "eta_seconds": round(eta_seconds, 1) if eta_seconds is not None else None,
                })

    if any(translation is None for translation in translations):
        raise RuntimeError("Translation returned incomplete subtitle data")

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
        max_cues = max(1, int(duration / 1.0))
        while len(chunks) > max_cues:
            merge_index = min(
                range(len(chunks) - 1),
                key=lambda index: len(chunks[index]) + len(chunks[index + 1]),
            )
            chunks[merge_index:merge_index + 2] = [
                f"{chunks[merge_index]} {chunks[merge_index + 1]}"
            ]
        weights = [max(1, len(chunk)) for chunk in chunks]
        total_weight = sum(weights)
        minimum_cue_duration = min(0.9, duration / len(chunks))
        flexible_duration = max(
            0.0,
            duration - minimum_cue_duration * len(chunks),
        )
        cue_durations = [
            minimum_cue_duration + flexible_duration * weight / total_weight
            for weight in weights
        ]
        cursor = start
        for index, (chunk, cue_duration) in enumerate(zip(chunks, cue_durations)):
            chunk_start = cursor
            chunk_end = end if index == len(chunks) - 1 else cursor + cue_duration
            cursor = chunk_end
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
                               pacing="natural", progress_callback=None):
    if progress_callback:
        progress_callback({"phase": "fetching", "completed": 0, "total": 0})
    raw_segments = fetch_transcript_segments(video_id)
    if progress_callback:
        progress_callback({
            "phase": "grouping",
            "completed": len(raw_segments),
            "total": len(raw_segments),
        })
    preset = PACING_PRESETS.get(pacing, PACING_PRESETS["natural"])
    sentences = merge_transcript_segments(raw_segments, **preset)
    if progress_callback:
        progress_callback({
            "phase": "translating",
            "completed": 0,
            "total": len(sentences),
            "eta_seconds": round(max(1.0, min(30.0, len(sentences) / 55.0)), 1),
        })
    translated = translate_segments(
        sentences,
        target_language=target_language,
        progress_callback=progress_callback,
    )
    if progress_callback:
        progress_callback({
            "phase": "formatting",
            "completed": len(sentences),
            "total": len(sentences),
            "eta_seconds": 0,
        })
    display_segments = prepare_subtitle_segments(translated)
    return {
        "video_id": video_id,
        "target_language": target_language,
        "pacing": pacing,
        "source_count": len(raw_segments),
        "sentence_count": len(sentences),
        "segments": display_segments,
    }
