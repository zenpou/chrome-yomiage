import { fetchSpeakers, synthesize } from '../api/coeiroink';
import type { Speaker } from '../types/coeiroink';

// 話者一覧のメモリキャッシュ（Service Workerのライフサイクル内）
let speakersCache: Speaker[] | null = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'GET_SPEAKERS') {
        if (!speakersCache) {
          speakersCache = await fetchSpeakers();
        }
        sendResponse({ speakers: speakersCache });

      } else if (message.type === 'SYNTHESIZE') {
        const buffer = await synthesize(message.payload);
        // ArrayBufferをUint8Arrayに変換して送信（シリアライズのため）
        const uint8 = new Uint8Array(buffer);
        sendResponse({ audioData: Array.from(uint8) });

      } else if (message.type === 'RELOAD_SPEAKERS') {
        speakersCache = null;
        speakersCache = await fetchSpeakers();
        sendResponse({ speakers: speakersCache });
      }
    } catch (e) {
      sendResponse({ error: (e as Error).message });
    }
  })();

  // 非同期sendResponseを有効にするためtrueを返す
  return true;
});
