import type { Speaker, SynthesizeRequest } from '../types/coeiroink';
import { SynthesisHttpError, synthesizeChunked } from './synthesis-util';

const BASE_URL = 'http://localhost:50021';

/**
 * VOICEVOXの話者UUIDに付ける接頭辞。
 * COEIROINKの話者UUIDは接頭辞なしで保存されているため、これで経路を判別する。
 */
export const VOICEVOX_PREFIX = 'voicevox:';

export function isVoicevox(speakerUuid: string): boolean {
  return speakerUuid.startsWith(VOICEVOX_PREFIX);
}

interface VoicevoxStyle {
  name: string;
  id: number;
  /** talk / singing_teacher / frame_decode / sing。省略時は talk 扱い */
  type?: string;
}

interface VoicevoxSpeaker {
  name: string;
  speaker_uuid: string;
  styles: VoicevoxStyle[];
}

/**
 * /speakers は歌唱用スタイル（sing 系）も混ぜて返すが、
 * それらは audio_query を作れないため読み上げには使えない。
 */
function isTalkStyle(style: VoicevoxStyle): boolean {
  return (style.type ?? 'talk') === 'talk';
}

export async function fetchSpeakers(): Promise<Speaker[]> {
  const res = await fetch(`${BASE_URL}/speakers`);
  if (!res.ok) throw new Error(`speakers fetch failed: ${res.status}`);
  const data: VoicevoxSpeaker[] = await res.json();
  return data
    .map((s) => ({
      speakerName: s.name,
      speakerUuid: `${VOICEVOX_PREFIX}${s.speaker_uuid}`,
      styles: s.styles
        .filter(isTalkStyle)
        .map((st) => ({ styleName: st.name, styleId: st.id })),
    }))
    // 読み上げ可能なスタイルが1つもないキャラクターは選ばせない
    .filter((s) => s.styles.length > 0);
}

/** audio_query が返す音声パラメータ。上書きするフィールド以外はそのまま合成に渡す */
type AudioQuery = Record<string, unknown>;

/**
 * VOICEVOXは audio_query（テキスト→アクセント句）→ synthesis（→WAV）の2段構成。
 * 話者はUUIDではなくスタイルIDで指定するため、speakerUuid は経路判別にしか使わない。
 */
export function synthesize(req: SynthesizeRequest): Promise<ArrayBuffer> {
  return synthesizeChunked(req.text, async (text) => {
    const queryRes = await fetch(
      `${BASE_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${req.styleId}`,
      { method: 'POST' },
    );
    if (!queryRes.ok) throw new SynthesisHttpError(queryRes.status);
    const query: AudioQuery = await queryRes.json();

    const res = await fetch(`${BASE_URL}/synthesis?speaker=${req.styleId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...query,
        speedScale: req.speedScale,
        volumeScale: req.volumeScale,
        pitchScale: req.pitchScale,
        intonationScale: req.intonationScale,
        prePhonemeLength: req.prePhonemeLength,
        postPhonemeLength: req.postPhonemeLength,
        outputSamplingRate: req.outputSamplingRate,
        outputStereo: false,
      }),
    });
    if (!res.ok) throw new SynthesisHttpError(res.status);
    return res.arrayBuffer();
  });
}
