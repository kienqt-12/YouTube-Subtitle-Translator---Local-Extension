import {
  API_BASE_URL,
  API_KEY,
  type RuntimeResponse,
  type SubtitleResponse,
} from '../lib/types';

interface RuntimeMessage {
  type: 'health' | 'fetch-subtitles' | 'clear-cache';
  videoId?: string;
  targetLanguage?: string;
  pacing?: string;
  forceRefresh?: boolean;
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
          return {
            ok: true,
            data: (await response.json()) as SubtitleResponse,
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
