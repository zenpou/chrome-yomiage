import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSpeakers, isVoicevox, synthesize, VOICEVOX_PREFIX } from './voicevox';

const PARAMS = {
  speakerUuid: `${VOICEVOX_PREFIX}uuid-1`,
  styleId: 3,
  text: 'こんにちは',
  speedScale: 1.2,
  volumeScale: 0.8,
  pitchScale: 0.05,
  intonationScale: 1.5,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.2,
  outputSamplingRate: 24000,
};

/** 44バイトヘッダー + 任意のPCMを持つ最小のWAVを作る */
function wav(pcm: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(buf);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  ascii(36, 'data');
  view.setUint32(40, pcm.length, true);
  new Uint8Array(buf).set(pcm, 44);
  return buf;
}

interface FetchCall {
  url: string;
  init?: RequestInit;
}

/** GET /speakers のレスポンスを差し替える */
function stubSpeakers(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => body })));
}

/** audio_query → synthesis の2段を模したfetchモック */
function stubFetch(options: { queryStatus?: number; synthesisStatus?: number } = {}) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes('/audio_query')) {
      const status = options.queryStatus ?? 200;
      if (status !== 200) return { ok: false, status };
      return { ok: true, status, json: async () => ({ accent_phrases: ['dummy'], speedScale: 1.0 }) };
    }
    const status = options.synthesisStatus ?? 200;
    if (status !== 200) return { ok: false, status };
    return { ok: true, status, arrayBuffer: async () => wav([1, 2, 3, 4]) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

describe('VOICEVOXクライアント', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('話者UUIDの接頭辞でVOICEVOXの話者を判別する', () => {
    expect(isVoicevox(`${VOICEVOX_PREFIX}abc`)).toBe(true);
    // COEIROINKの話者は接頭辞なしのUUIDで保存されている
    expect(isVoicevox('3c37646f-3881-5374-2a83-149267990abc')).toBe(false);
    expect(isVoicevox('chrome-tts:Google 日本語')).toBe(false);
  });

  it('話者一覧をSpeaker型へ変換し、UUIDに接頭辞を付ける', async () => {
    stubSpeakers([
      {
        name: 'ずんだもん',
        speaker_uuid: 'uuid-z',
        styles: [
          { name: 'ノーマル', id: 3, type: 'talk' },
          // typeが無い場合はtalk扱い（古いエンジン・互換エンジン向け）
          { name: 'あまあま', id: 1 },
        ],
      },
    ]);

    const speakers = await fetchSpeakers();

    expect(speakers).toEqual([
      {
        speakerName: 'ずんだもん',
        speakerUuid: `${VOICEVOX_PREFIX}uuid-z`,
        styles: [
          { styleName: 'ノーマル', styleId: 3 },
          { styleName: 'あまあま', styleId: 1 },
        ],
      },
    ]);
  });

  // /speakers は talk_styles + sing_styles を返すため、歌唱用スタイルが混ざる。
  // それらは audio_query を作れないので読み上げには使えない。
  it('歌唱用スタイルを除外する', async () => {
    stubSpeakers([
      {
        name: 'ずんだもん',
        speaker_uuid: 'uuid-z',
        styles: [
          { name: 'ノーマル', id: 3, type: 'talk' },
          { name: 'ノーマル', id: 22, type: 'singing_teacher' },
          { name: 'ノーマル', id: 75, type: 'frame_decode' },
          { name: 'ノーマル', id: 76, type: 'sing' },
        ],
      },
    ]);

    const speakers = await fetchSpeakers();

    expect(speakers[0].styles).toEqual([{ styleName: 'ノーマル', styleId: 3 }]);
  });

  it('読み上げ可能なスタイルが無いキャラクターは一覧に含めない', async () => {
    stubSpeakers([
      { name: '波音リツ', speaker_uuid: 'uuid-r', styles: [{ name: 'クイーン', id: 65, type: 'sing' }] },
      { name: 'ずんだもん', speaker_uuid: 'uuid-z', styles: [{ name: 'ノーマル', id: 3, type: 'talk' }] },
    ]);

    const speakers = await fetchSpeakers();

    expect(speakers.map((s) => s.speakerName)).toEqual(['ずんだもん']);
  });

  it('audio_query→synthesisの順に呼び、話者はスタイルIDで指定する', async () => {
    const calls = stubFetch();

    await synthesize(PARAMS);

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain('/audio_query');
    expect(calls[0].url).toContain('text=%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF');
    expect(calls[0].url).toContain('speaker=3');
    expect(calls[1].url).toBe('http://localhost:50021/synthesis?speaker=3');
  });

  it('audio_queryの結果にユーザー設定を上書きして合成させる', async () => {
    const calls = stubFetch();

    await synthesize(PARAMS);

    const body = JSON.parse(calls[1].init!.body as string);
    // audio_queryが返したフィールドは維持する
    expect(body.accent_phrases).toEqual(['dummy']);
    // 設定値で上書きされる
    expect(body.speedScale).toBe(1.2);
    expect(body.volumeScale).toBe(0.8);
    expect(body.pitchScale).toBe(0.05);
    expect(body.intonationScale).toBe(1.5);
    expect(body.prePhonemeLength).toBe(0.1);
    expect(body.postPhonemeLength).toBe(0.2);
    expect(body.outputSamplingRate).toBe(24000);
    expect(body.outputStereo).toBe(false);
  });

  it('audio_queryが失敗したらsynthesisを呼ばずにエラーを投げる', async () => {
    const calls = stubFetch({ queryStatus: 422 });

    await expect(synthesize(PARAMS)).rejects.toThrow('synthesis failed: 422');
    expect(calls).toHaveLength(1);
  });

  it('synthesisが失敗したらエラーを投げる', async () => {
    stubFetch({ synthesisStatus: 500 });

    await expect(synthesize(PARAMS)).rejects.toThrow('synthesis failed: 500');
  });

  it('長文は分割して合成し、1つのWAVに結合する', async () => {
    const calls = stubFetch();
    // 150文字を超えるので分割される
    const text = 'あ'.repeat(120) + '。' + 'い'.repeat(120) + '。';

    const merged = await synthesize({ ...PARAMS, text });

    // audio_query + synthesis が2チャンク分
    expect(calls).toHaveLength(4);
    // ヘッダー44バイト + PCM 4バイト × 2チャンク
    expect(merged.byteLength).toBe(44 + 8);
    const view = new DataView(merged);
    expect(view.getUint32(4, true)).toBe(merged.byteLength - 8);
    expect(view.getUint32(40, true)).toBe(8);
    expect([...new Uint8Array(merged, 44)]).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
  });
});
