const DEFAULT_SETTINGS = {
  enabled: true,
  targetLanguage: 'vi',
  pacing: 'natural',
  fontSize: 30,
  textColor: '#ffffff',
  backgroundOpacity: 72,
  position: 'bottom',
  hideNativeCaptions: true,
};
const HOST_ID = 'youtube-subtitle-translator-host';
const NATIVE_STYLE_ID = 'youtube-subtitle-hide-native';

let settings = { ...DEFAULT_SETTINGS };
let segments = [];
let currentRequestKey = '';
let requestVersion = 0;
let host = null;
let subtitleWrapper = null;
let subtitleBox = null;
let statusBox = null;
let statusTimer = 0;

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      resolve({ ...DEFAULT_SETTINGS, ...stored });
    });
  });
}

function getVideoId() {
  const url = new URL(location.href);
  if (url.pathname === '/watch') return url.searchParams.get('v');
  const match = url.pathname.match(/^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

function getActiveVideo() {
  return Array.from(document.querySelectorAll('video'))
    .filter((video) => video.clientWidth > 0 && video.clientHeight > 0)
    .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] || null;
}

function ensureOverlay() {
  if (host && host.isConnected && subtitleBox && statusBox && subtitleWrapper) return true;
  const video = getActiveVideo();
  const player = video && video.closest('.html5-video-player');
  if (!player) return false;

  document.getElementById(HOST_ID)?.remove();
  host = document.createElement('div');
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: 'absolute', inset: '0', zIndex: '61', pointerEvents: 'none',
  });
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .wrap { position:absolute;left:5%;right:5%;display:flex;justify-content:center;pointer-events:none; }
    .subtitle { max-width:min(90%,1100px);padding:.24em .58em .3em;border-radius:.34em;color:#fff;
      font-family:Arial,"Segoe UI",sans-serif;font-weight:750;line-height:1.28;letter-spacing:.005em;
      text-align:center;text-wrap:balance;text-shadow:0 2px 3px rgba(0,0,0,.82); }
    .status { position:absolute;top:18px;right:18px;max-width:min(360px,70%);padding:9px 13px;
      border:1px solid rgba(255,255,255,.16);border-radius:10px;color:#fff;background:rgba(15,23,42,.9);
      box-shadow:0 10px 28px rgba(0,0,0,.24);font:600 13px/1.4 Arial,sans-serif;opacity:0;
      transform:translateY(-6px);transition:.18s ease; }
    .status.visible { opacity:1;transform:translateY(0); }
    .status.error { background:rgba(153,27,27,.94); }
  `;
  subtitleWrapper = document.createElement('div');
  subtitleWrapper.className = 'wrap';
  subtitleBox = document.createElement('div');
  subtitleBox.className = 'subtitle';
  subtitleWrapper.append(subtitleBox);
  statusBox = document.createElement('div');
  statusBox.className = 'status';
  shadow.append(style, subtitleWrapper, statusBox);
  player.append(host);
  applySettings();
  return true;
}

function applySettings() {
  if (!ensureOverlay()) return;
  subtitleBox.style.fontSize = `${settings.fontSize}px`;
  subtitleBox.style.color = settings.textColor;
  subtitleBox.style.background = `rgba(0,0,0,${settings.backgroundOpacity / 100})`;
  subtitleWrapper.style.top = settings.position === 'top' ? '8%' : 'auto';
  subtitleWrapper.style.bottom = settings.position === 'bottom' ? '12%' : 'auto';
  host.style.display = settings.enabled ? 'block' : 'none';
  let nativeStyle = document.getElementById(NATIVE_STYLE_ID);
  if (settings.enabled && settings.hideNativeCaptions) {
    if (!nativeStyle) {
      nativeStyle = document.createElement('style');
      nativeStyle.id = NATIVE_STYLE_ID;
      nativeStyle.textContent = '.ytp-caption-window-container{display:none!important}';
      document.documentElement.append(nativeStyle);
    }
  } else {
    nativeStyle?.remove();
  }
}

function showStatus(message, isError = false, duration = 3500) {
  if (!ensureOverlay()) return;
  clearTimeout(statusTimer);
  statusBox.textContent = message;
  statusBox.className = `status visible${isError ? ' error' : ''}`;
  if (duration > 0) {
    statusTimer = setTimeout(() => { statusBox.className = 'status'; }, duration);
  }
}

function findSegment(time) {
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

function createJobId() {
  return globalThis.crypto?.randomUUID?.() || `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function progressLabel(progress) {
  if (!progress) return null;
  if (progress.phase === 'fetching') return 'Đang lấy caption từ YouTube...';
  if (progress.phase === 'grouping') return 'Đang ghép caption thành câu hoàn chỉnh...';
  if (progress.phase === 'formatting') return 'Đang căn thời gian phụ đề...';
  if (progress.phase === 'translating') {
    if (!progress.total) return 'Đang chuẩn bị dịch và ước tính thời gian...';
    if (!progress.completed) return `Đang dịch 0/${progress.total} câu · đang ước tính...`;
    const eta = progress.eta_seconds == null ? null : Math.max(1, Math.ceil(progress.eta_seconds));
    return `Đã dịch ${progress.completed}/${progress.total} câu${eta ? ` · còn khoảng ${eta}s` : ' · gần xong'}`;
  }
  return null;
}

function renderLoop() {
  if (ensureOverlay()) {
    const video = getActiveVideo();
    const active = settings.enabled && video ? findSegment(video.currentTime) : null;
    subtitleBox.textContent = active ? active.translated : '';
    subtitleBox.style.visibility = active ? 'visible' : 'hidden';
  }
  requestAnimationFrame(renderLoop);
}

async function loadForCurrentVideo(forceRefresh = false) {
  settings = await getSettings();
  applySettings();
  const videoId = getVideoId();
  if (!settings.enabled || !videoId) {
    segments = [];
    return;
  }
  const key = `${videoId}:${settings.targetLanguage}:${settings.pacing}`;
  if (!forceRefresh && key === currentRequestKey && segments.length) return;
  currentRequestKey = key;
  segments = [];
  const version = ++requestVersion;
  const jobId = createJobId();
  showStatus('Đang lấy caption và ước tính thời gian...', false, 0);
  let polling = true;
  let pollTimer = 0;
  const pollProgress = async () => {
    if (!polling || version !== requestVersion) return;
    const progressResponse = await chrome.runtime.sendMessage({ type: 'get-progress', jobId });
    const label = progressResponse?.ok ? progressLabel(progressResponse.data) : null;
    if (label) showStatus(label, false, 0);
    if (polling) pollTimer = setTimeout(pollProgress, 400);
  };
  pollTimer = setTimeout(pollProgress, 300);
  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: 'fetch-subtitles', videoId,
      targetLanguage: settings.targetLanguage,
      pacing: settings.pacing,
      forceRefresh,
      jobId,
    });
  } finally {
    polling = false;
    clearTimeout(pollTimer);
  }
  if (version !== requestVersion || key !== currentRequestKey) return;
  if (!response?.ok || !response.data) {
    showStatus(response?.error || 'Backend chưa chạy.', true, 8000);
    return;
  }
  segments = response.data.segments;
  showStatus(`Đã dịch ${response.data.sentence_count} câu${response.data.cached ? ' (cache)' : ''}.`);
}

async function initialize() {
  settings = await getSettings();
  ensureOverlay();
  renderLoop();
  loadForCurrentVideo();
  document.addEventListener('yt-navigate-finish', () => setTimeout(loadForCurrentVideo, 50));
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'reload-subtitles') {
      loadForCurrentVideo(Boolean(message.forceRefresh)).then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });
  chrome.storage.onChanged.addListener(async (_changes, area) => {
    if (area !== 'sync') return;
    const previous = settings;
    settings = await getSettings();
    applySettings();
    if (previous.targetLanguage !== settings.targetLanguage ||
        previous.pacing !== settings.pacing || previous.enabled !== settings.enabled) {
      loadForCurrentVideo();
    }
  });
}

initialize();
