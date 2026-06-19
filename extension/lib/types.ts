export type SubtitlePosition = 'top' | 'bottom';
export type SubtitlePacing = 'short' | 'natural' | 'long';

export interface ExtensionSettings {
  enabled: boolean;
  targetLanguage: string;
  pacing: SubtitlePacing;
  fontSize: number;
  textColor: string;
  backgroundOpacity: number;
  position: SubtitlePosition;
  hideNativeCaptions: boolean;
}

export interface SubtitleSegment {
  start: number;
  end: number;
  duration: number;
  text: string;
  translated: string;
}

export interface SubtitleResponse {
  video_id: string;
  target_language: string;
  pacing: SubtitlePacing;
  source_count: number;
  sentence_count: number;
  segments: SubtitleSegment[];
  cached: boolean;
}

export interface RuntimeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  targetLanguage: 'vi',
  pacing: 'natural',
  fontSize: 30,
  textColor: '#ffffff',
  backgroundOpacity: 72,
  position: 'bottom',
  hideNativeCaptions: true,
};

export const API_BASE_URL = 'http://127.0.0.1:8765';
export const API_KEY = 'youtube-subtitle-local-v1';
