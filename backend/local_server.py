import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
from urllib.parse import parse_qs, urlparse

from subtitle_core import build_translated_subtitles, extract_video_id


HOST = "127.0.0.1"
PORT = 8765
LOCAL_API_KEY = "youtube-subtitle-local-v1"
CACHE_VERSION = "v3"
CACHE = {}
CACHE_LOCK = Lock()
PROGRESS = {}
PROGRESS_LOCK = Lock()


def update_progress(job_id, payload):
    with PROGRESS_LOCK:
        PROGRESS[job_id] = {
            **PROGRESS.get(job_id, {}),
            **payload,
            "job_id": job_id,
            "updated_at": time.time(),
        }
        if len(PROGRESS) > 100:
            oldest = sorted(
                PROGRESS,
                key=lambda key: PROGRESS[key].get("updated_at", 0),
            )[:20]
            for key in oldest:
                PROGRESS.pop(key, None)


class LocalSubtitleHandler(BaseHTTPRequestHandler):
    server_version = "SubtitleLocalAPI/1.0"

    def log_message(self, format_string, *args):
        print(f"[{self.log_date_time_string()}] {format_string % args}")

    def cors_headers(self):
        origin = self.headers.get("Origin", "*")
        if not origin.startswith(("chrome-extension://", "moz-extension://")):
            origin = "*"
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Local-Subtitle-Key",
        )

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_json(200, {
                "status": "ok",
                "service": "youtube-subtitle-local-api",
            })
            return
        if parsed.path == "/api/progress":
            if self.headers.get("X-Local-Subtitle-Key") != LOCAL_API_KEY:
                self.send_json(401, {"detail": "Invalid local API key"})
                return
            job_id = parse_qs(parsed.query).get("job_id", [""])[0]
            with PROGRESS_LOCK:
                progress = PROGRESS.get(job_id)
            if not progress:
                self.send_json(404, {"detail": "Progress job not found"})
                return
            self.send_json(200, progress)
            return
        self.send_json(404, {"detail": "Not found"})

    def do_POST(self):
        if self.headers.get("X-Local-Subtitle-Key") != LOCAL_API_KEY:
            self.send_json(401, {"detail": "Invalid local API key"})
            return
        if self.path == "/api/cache/clear":
            with CACHE_LOCK:
                CACHE.clear()
            self.send_json(200, {"status": "ok"})
            return
        if self.path != "/api/subtitles":
            self.send_json(404, {"detail": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            request = json.loads(self.rfile.read(length) or b"{}")
            video_id = extract_video_id(request.get("video_id"))
            target_language = str(request.get("target_language", "vi"))
            pacing = str(request.get("pacing", "natural"))
            force_refresh = bool(request.get("force_refresh", False))
            job_id = str(request.get("job_id") or f"{video_id}-{time.time_ns()}")[:128]
            if not video_id:
                self.send_json(422, {"detail": "Invalid YouTube video ID"})
                return
            if pacing not in {"short", "natural", "long"}:
                pacing = "natural"

            key = (CACHE_VERSION, video_id, target_language, pacing)
            if not force_refresh:
                with CACHE_LOCK:
                    cached = CACHE.get(key)
                if cached:
                    update_progress(job_id, {
                        "phase": "done",
                        "completed": cached.get("sentence_count", 0),
                        "total": cached.get("sentence_count", 0),
                        "eta_seconds": 0,
                    })
                    self.send_json(200, {**cached, "cached": True})
                    return

            update_progress(job_id, {
                "phase": "starting",
                "completed": 0,
                "total": 0,
                "eta_seconds": None,
            })
            result = build_translated_subtitles(
                video_id,
                target_language=target_language,
                pacing=pacing,
                progress_callback=lambda payload: update_progress(job_id, payload),
            )
            with CACHE_LOCK:
                CACHE[key] = result
            update_progress(job_id, {
                "phase": "done",
                "completed": result.get("sentence_count", 0),
                "total": result.get("sentence_count", 0),
                "eta_seconds": 0,
            })
            self.send_json(200, {**result, "cached": False})
        except Exception as error:
            if "job_id" in locals():
                update_progress(job_id, {
                    "phase": "error",
                    "error": str(error)[:300],
                    "eta_seconds": None,
                })
            self.send_json(502, {"detail": str(error)[:500]})


def main():
    server = ThreadingHTTPServer((HOST, PORT), LocalSubtitleHandler)
    print("=" * 58)
    print(f" YouTube Subtitle Local API: http://{HOST}:{PORT}")
    print(" Giu cua so nay mo trong khi xem YouTube.")
    print(" Nhan Ctrl+C de dung.")
    print("=" * 58)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDa dung Local API.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
