const API_BASE_URL = 'http://127.0.0.1:8765';
const API_KEY = 'youtube-subtitle-local-v1';
const CACHE_PREFIX = 'subtitle-cache-v3:';
const CACHE_INDEX = 'subtitle-cache-index-v3';
const MAX_CACHED_VIDEOS = 12;

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function storageRemove(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

function subtitleCacheKey(message) {
  return `${CACHE_PREFIX}${message.videoId}:${message.targetLanguage || 'vi'}:${message.pacing || 'natural'}`;
}

async function getCachedSubtitles(message) {
  const key = subtitleCacheKey(message);
  const stored = await storageGet(key);
  return stored[key]?.data || null;
}

async function saveCachedSubtitles(message, data) {
  const key = subtitleCacheKey(message);
  const stored = await storageGet(CACHE_INDEX);
  const previousIndex = Array.isArray(stored[CACHE_INDEX]) ? stored[CACHE_INDEX] : [];
  const nextIndex = [
    { key, savedAt: Date.now() },
    ...previousIndex.filter((item) => item.key !== key),
  ];
  const removed = nextIndex.splice(MAX_CACHED_VIDEOS).map((item) => item.key);
  await storageSet({
    [key]: { savedAt: Date.now(), data },
    [CACHE_INDEX]: nextIndex,
  });
  if (removed.length) await storageRemove(removed);
}

async function clearExtensionCache() {
  const stored = await storageGet(CACHE_INDEX);
  const index = Array.isArray(stored[CACHE_INDEX]) ? stored[CACHE_INDEX] : [];
  await storageRemove([...index.map((item) => item.key), CACHE_INDEX]);
}

async function parseError(response) {
  try {
    const payload = await response.json();
    return payload.detail || `Local API returned ${response.status}`;
  } catch {
    return `Local API returned ${response.status}`;
  }
}

async function handleMessage(message) {
  try {
    if (message.type === 'health') {
      const response = await fetch(`${API_BASE_URL}/health`);
      if (!response.ok) throw new Error(await parseError(response));
      return { ok: true, data: await response.json() };
    }
    if (message.type === 'get-progress' && message.jobId) {
      const response = await fetch(
        `${API_BASE_URL}/api/progress?job_id=${encodeURIComponent(message.jobId)}`,
        { headers: { 'X-Local-Subtitle-Key': API_KEY } },
      );
      if (response.status === 404) return { ok: true, data: null };
      if (!response.ok) throw new Error(await parseError(response));
      return { ok: true, data: await response.json() };
    }
    if (message.type === 'clear-cache') {
      await clearExtensionCache();
      const response = await fetch(`${API_BASE_URL}/api/cache/clear`, {
        method: 'POST',
        headers: { 'X-Local-Subtitle-Key': API_KEY },
      });
      if (!response.ok) throw new Error(await parseError(response));
      return { ok: true, data: await response.json() };
    }
    if (message.type === 'fetch-subtitles' && message.videoId) {
      if (!message.forceRefresh) {
        const cached = await getCachedSubtitles(message);
        if (cached) {
          return {
            ok: true,
            data: { ...cached, cached: true, cache_source: 'extension' },
          };
        }
      }
      const response = await fetch(`${API_BASE_URL}/api/subtitles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Local-Subtitle-Key': API_KEY,
        },
        body: JSON.stringify({
          video_id: message.videoId,
          target_language: message.targetLanguage || 'vi',
          pacing: message.pacing || 'natural',
          force_refresh: Boolean(message.forceRefresh),
          job_id: message.jobId,
        }),
      });
      if (!response.ok) throw new Error(await parseError(response));
      const data = await response.json();
      await saveCachedSubtitles(message, data);
      return { ok: true, data };
    }
    return { ok: false, error: 'Unsupported extension message' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Không thể kết nối backend local.',
    };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});
