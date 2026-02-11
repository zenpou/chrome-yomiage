import { DEFAULT_SETTINGS, type UserSettings } from '../types/settings';

export async function loadSettings(): Promise<UserSettings> {
  const data = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await chrome.storage.local.set({ settings });
}
