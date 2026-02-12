import { DEFAULT_SETTINGS, type UserSettings } from '../types/settings';

/** 拡張機能コンテキストが有効かどうかを確認する */
export function isExtensionContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

export async function loadSettings(): Promise<UserSettings> {
  if (!isExtensionContextValid()) return { ...DEFAULT_SETTINGS };
  try {
    const data = await chrome.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  if (!isExtensionContextValid()) return;
  try {
    await chrome.storage.local.set({ settings });
  } catch {
    // コンテキスト無効化などは無視
  }
}
