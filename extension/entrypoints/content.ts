import { getSettings } from '../lib/settings';
import {
  type ExtensionSettings,
  type RuntimeResponse,
  type SubtitleResponse,
  type SubtitleSegment,
} from '../lib/types';

const HOST_ID = 'youtube-subtitle-translator-host';
const NATIVE_CAPTION_STYLE_ID = 'youtube-subtitle-hide-native';

let settings: ExtensionSettings;
let segments: SubtitleSegment[] = [];
let currentVideoId = '';
let currentRequestKey = '';
let requestVersion = 0;
let host: HTMLDivElement | null = null;
let subtitleWrapper: HTMLDivElement | null = null;
let subtitleBox: HTMLDivElement | null = null;
let statusBox: HTMLDivElement | null = null;
let statusTimer: number | undefined;

function getVideoId(): string | null {
  const url = new URL(window.location.href);
  if (url.pathname === '/watch') return url.searchParams.get('v');
  const match = url.pathname.match(/^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})/);
  return match?.[1] || null;
}

function getActiveVideo(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
  return (
    videos
      .filter((video) => video.clientWidth > 0 && video.clientHeight > 0)
      .sort(
        (left, right) =>
          right.clientWidth * right.clientHeight -
          left.clientWidth * left.clientHeight,
      )[0] || null
  );
}

function ensureOverlay(): boolean {
  if (host?.isConnected && subtitleBox && statusBox && subtitleWrapper) return true;
  const video = getActiveVideo();
  const player = video?.closest<HTMLElement>('.html5-video-player');
  if (!player) return false;

  document.getElementById(HOST_ID)?.remove();
  host = document.createElement('div');
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: 'absolute',
    inset: '0',
    zIndex: '61',
    pointerEvents: 'none',
  });

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .subtitle-wrapper {
      position: absolute;
      left: 5%;
      right: 5%;
      display: flex;
      justify-content: center;
      pointer-events: none;
      transition: top .18s ease, bottom .18s ease;
    }
    .subtitle-box {
      max-width: min(90%, 1100px);
      padding: .24em .58em .3em;
      border-radius: .34em;
      color: #fff;
      font-family: Arial, "Segoe UI", sans-serif;
      font-weight: 750;
      line-height: 1.28;
      letter-spacing: .005em;
      text-align: center;
      text-wrap: balance;
      text-shadow: 0 2px 3px rgba(0, 0, 0, .82);
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
    .status-box {
      position: absolute;
      top: 18px;
      right: 18px;
      max-width: min(360px, 70%);
      padding: 9px 13px;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 10px;
      color: #fff;
      background: rgba(15, 23, 42, .88);
      box-shadow: 0 10px 28px rgba(0,0,0,.24);
      font: 600 13px/1.4 Arial, sans-serif;
      opacity: 0;
      transform: translateY(-6px);
      transition: opacity .18s ease, transform .18s ease;
    }
    .status-box.visible { opacity: 1; transform: translateY(0); }
    .status-box.error { background: rgba(153, 27, 27, .92); }
  `;
  subtitleWrapper = document.createElement('div');
  subtitleWrapper.className = 'subtitle-wrapper';
  subtitleBox = document.createElement('div');
  subtitleBox.className = 'subtitle-box';
  subtitleWrapper.append(subtitleBox);
  statusBox = document.createElement('div');
  statusBox.className = 'status-box';
  shadow.append(style, subtitleWrapper, statusBox);
  player.append(host);
  applySettings();
  return true;
}

function applySettings() {
  if (!settings || !ensureOverlay() || !subtitleBox || !subtitleWrapper) return;
  subtitleBox.style.fontSize = `${settings.fontSize}px`;
  subtitleBox.style.color = settings.textColor;
  subtitleBox.style.background = `rgba(0, 0, 0, ${settings.backgroundOpacity / 100})`;
  subtitleWrapper.style.top = settings.position === 'top' ? '8%' : 'auto';
  subtitleWrapper.style.bottom = settings.position === 'bottom' ? '12%' : 'auto';
  host!.style.display = settings.enabled ? 'block' : 'none';
  updateNativeCaptionVisibility();
}

function updateNativeCaptionVisibility() {
  let style = document.getElementById(NATIVE_CAPTION_STYLE_ID) as HTMLStyleElement | null;
  if (settings.enabled && settings.hideNativeCaptions) {
    if (!style) {
      style = document.createElement('style');
      style.id = NATIVE_CAPTION_STYLE_ID;
      style.textContent = '.ytp-caption-window-container { display: none !important; }';
      document.documentElement.append(style);
    }
  } else {
    style?.remove();
  }
}

function showStatus(message: string, error = false, duration = 3500) {
  if (!ensureOverlay() || !statusBox) return;
  window.clearTimeout(statusTimer);
  statusBox.textContent = message;
  statusBox.className = `status-box visible${error ? ' error' : ''}`;
  if (duration > 0) {
    statusTimer = window.setTimeout(() => {
      if (statusBox) statusBox.className = 'status-box';
    }, duration);
  }
}

function findSegment(time: number): SubtitleSegment | null {
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const segment = segments[middle];
    if (time < segment.start) high = middle - 1;
    else if (time > segment.end) low = middle + 1;
    else return segment;
  }
  return null;
}

function renderLoop() {
  if (ensureOverlay() && subtitleBox) {
    const video = getActiveVideo();
    const active =
      settings?.enabled && video ? findSegment(video.currentTime) : null;
    subtitleBox.textContent = active?.translated || '';
    subtitleBox.style.visibility = active ? 'visible' : 'hidden';
  }
  window.requestAnimationFrame(renderLoop);
}

async function loadForCurrentVideo(forceRefresh = false) {
  settings = await getSettings();
  applySettings();
  const videoId = getVideoId();
  if (!settings.enabled || !videoId) {
    segments = [];
    currentVideoId = videoId || '';
    return;
  }

  const requestKey = `${videoId}:${settings.targetLanguage}:${settings.pacing}`;
  if (!forceRefresh && requestKey === currentRequestKey && segments.length) return;
  currentVideoId = videoId;
  currentRequestKey = requestKey;
  segments = [];
  const version = ++requestVersion;
  showStatus('Đang ghép câu và dịch phụ đề...', false, 0);

  const response = (await browser.runtime.sendMessage({
    type: 'fetch-subtitles',
    videoId,
    targetLanguage: settings.targetLanguage,
    pacing: settings.pacing,
    forceRefresh,
  })) as RuntimeResponse<SubtitleResponse>;

  if (version !== requestVersion || currentVideoId !== videoId) return;
  if (!response?.ok || !response.data) {
    showStatus(
      response?.error || 'Backend chưa chạy. Hãy mở run_extension_backend.bat.',
      true,
      8000,
    );
    return;
  }
  segments = response.data.segments;
  showStatus(
    `Đã dịch ${response.data.sentence_count} câu${response.data.cached ? ' (từ cache)' : ''}.`,
  );
}

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_idle',
  async main() {
    settings = await getSettings();
    ensureOverlay();
    renderLoop();
    await loadForCurrentVideo();

    document.addEventListener('yt-navigate-finish', () => {
      window.setTimeout(() => loadForCurrentVideo(), 350);
    });

    browser.runtime.onMessage.addListener(async (message) => {
      if (message?.type === 'reload-subtitles') {
        await loadForCurrentVideo(Boolean(message.forceRefresh));
        return { ok: true };
      }
      return undefined;
    });

    browser.storage.onChanged.addListener(async (_changes, areaName) => {
      if (areaName !== 'sync') return;
      const previous = settings;
      settings = await getSettings();
      applySettings();
      const translationChanged =
        previous.targetLanguage !== settings.targetLanguage ||
        previous.pacing !== settings.pacing ||
        previous.enabled !== settings.enabled;
      if (translationChanged) await loadForCurrentVideo();
    });
  },
});
