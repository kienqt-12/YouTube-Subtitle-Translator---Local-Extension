import {
  API_BASE_URL,
  API_KEY,
  type RuntimeResponse,
  type SubtitleResponse,
} from '../lib/types';

const CACHE_PREFIX = 'subtitle-cache-v3:';
const CACHE_INDEX = 'subtitle-cache-index-v3';
const MAX_CACHED_VIDEOS = 12;

interface RuntimeMessage {
  type: 'health' | 'fetch-subtitles' | 'clear-cache' | 'get-progress';
  videoId?: string;
  targetLanguage?: string;
  pacing?: string;
  forceRefresh?: boolean;
  jobId?: string;
}

interface CacheIndexItem {
  key: string;
  savedAt: number;
}

function subtitleCacheKey(message: RuntimeMessage) {
  return `${CACHE_PREFIX}${message.videoId}:${message.targetLanguage || 'vi'}:${message.pacing || 'natural'}`;
}

async function getCachedSubtitles(message: RuntimeMessage) {
  const key = subtitleCacheKey(message);
  const stored = await browser.storage.local.get(key);
  return stored[key]?.data as SubtitleResponse | undefined;
}

async function saveCachedSubtitles(
  message: RuntimeMessage,
  data: SubtitleResponse,
) {
  const key = subtitleCacheKey(message);
  const stored = await browser.storage.local.get(CACHE_INDEX);
  const previousIndex = Array.isArray(stored[CACHE_INDEX])
    ? (stored[CACHE_INDEX] as CacheIndexItem[])
    : [];
  const nextIndex = [
    { key, savedAt: Date.now() },
    ...previousIndex.filter((item) => item.key !== key),
  ];
  const removed = nextIndex.splice(MAX_CACHED_VIDEOS).map((item) => item.key);
  await browser.storage.local.set({
    [key]: { savedAt: Date.now(), data },
    [CACHE_INDEX]: nextIndex,
  });
  if (removed.length) await browser.storage.local.remove(removed);
}

async function clearExtensionCache() {
  const stored = await browser.storage.local.get(CACHE_INDEX);
  const index = Array.isArray(stored[CACHE_INDEX])
    ? (stored[CACHE_INDEX] as CacheIndexItem[])
    : [];
  await browser.storage.local.remove([
    ...index.map((item) => item.key),
    CACHE_INDEX,
  ]);
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload.detail || `Local API returned ${response.status}`;
  } catch {
    return `Local API returned ${response.status}`;
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    async (message: RuntimeMessage): Promise<RuntimeResponse> => {
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
                data: {
                  ...cached,
                  cached: true,
                  cache_source: 'extension',
                },
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
          const data = (await response.json()) as SubtitleResponse;
          await saveCachedSubtitles(message, data);
          return {
            ok: true,
            data,
          };
        }

        return { ok: false, error: 'Unsupported extension message' };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Không thể kết nối backend local.',
        };
      }
    },
  );
});
