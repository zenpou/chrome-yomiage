import { ENGINES, engineFor, isEngineId, type EngineId } from '../api/tts-engine';
import type { Speaker } from '../types/coeiroink';

// 話者一覧のメモリキャッシュ（Service Workerのライフサイクル内、エンジンごと）
const speakersCache = new Map<EngineId, Speaker[]>();

async function getSpeakers(engineId: EngineId, forceReload: boolean): Promise<Speaker[]> {
  if (forceReload) speakersCache.delete(engineId);

  const cached = speakersCache.get(engineId);
  if (cached) return cached;

  const speakers = await ENGINES[engineId].fetchSpeakers();
  speakersCache.set(engineId, speakers);
  return speakers;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'GET_SPEAKERS' || message.type === 'RELOAD_SPEAKERS') {
        // engine 未指定は従来通り COEIROINK 扱い
        const engineId: EngineId = isEngineId(message.engine) ? message.engine : 'coeiroink';
        const speakers = await getSpeakers(engineId, message.type === 'RELOAD_SPEAKERS');
        sendResponse({ speakers });

      } else if (message.type === 'SYNTHESIZE') {
        // 話者UUIDからエンジンを判定するので、役割別音声で別エンジンが混ざっても振り分けられる
        const buffer = await engineFor(message.payload.speakerUuid).synthesize(message.payload);
        // ArrayBufferをUint8Arrayに変換して送信（シリアライズのため）
        const uint8 = new Uint8Array(buffer);
        sendResponse({ audioData: Array.from(uint8) });
      }
    } catch (e) {
      sendResponse({ error: (e as Error).message });
    }
  })();

  // 非同期sendResponseを有効にするためtrueを返す
  return true;
});
