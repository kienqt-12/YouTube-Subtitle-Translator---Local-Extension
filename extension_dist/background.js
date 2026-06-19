const API_BASE_URL = 'http://127.0.0.1:8765';
const API_KEY = 'youtube-subtitle-local-v1';

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
    if (message.type === 'clear-cache') {
      const response = await fetch(`${API_BASE_URL}/api/cache/clear`, {
        method: 'POST',
        headers: { 'X-Local-Subtitle-Key': API_KEY },
      });
      if (!response.ok) throw new Error(await parseError(response));
      return { ok: true, data: await response.json() };
    }
    if (message.type === 'fetch-subtitles' && message.videoId) {
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
        }),
      });
      if (!response.ok) throw new Error(await parseError(response));
      return { ok: true, data: await response.json() };
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
