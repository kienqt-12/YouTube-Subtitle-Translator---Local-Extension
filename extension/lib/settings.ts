import { DEFAULT_SETTINGS, type ExtensionSettings } from './types';

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored } as ExtensionSettings;
}

export async function saveSettings(
  settings: Partial<ExtensionSettings>,
): Promise<void> {
  await browser.storage.sync.set(settings);
}
