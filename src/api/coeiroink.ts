import type { Speaker, SynthesizeRequest } from '../types/coeiroink';

const BASE_URL = 'http://localhost:50032';

export async function fetchSpeakers(): Promise<Speaker[]> {
  const res = await fetch(`${BASE_URL}/v1/speakers`);
  if (!res.ok) throw new Error(`speakers fetch failed: ${res.status}`);
  const data = await res.json();
  // COEIROINKのレスポンスをSpeaker型に変換
  return data.map((s: {
    speakerName: string;
    speakerUuid: string;
    styles: { styleName: string; styleId: number }[];
  }) => ({
    speakerName: s.speakerName,
    speakerUuid: s.speakerUuid,
    styles: s.styles.map((st) => ({
      styleName: st.styleName,
      styleId: st.styleId,
    })),
  }));
}

const MAX_TEXT_LENGTH = 200;

/** テキストを句読点・改行で分割（最大 MAX_TEXT_LENGTH 文字ごと） */
function splitText(text: string): string[] {
  if (text.length <= MAX_TEXT_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > MAX_TEXT_LENGTH) {
    // 句読点・改行で区切れる位置を探す（後ろから）
    const slice = remaining.slice(0, MAX_TEXT_LENGTH);
    const breakIdx = Math.max(
      slice.lastIndexOf('。'),
      slice.lastIndexOf('、'),
      slice.lastIndexOf('！'),
      slice.lastIndexOf('？'),
      slice.lastIndexOf('\n'),
      slice.lastIndexOf('.'),
      slice.lastIndexOf(','),
    );
    const splitAt = breakIdx > 0 ? breakIdx + 1 : MAX_TEXT_LENGTH;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function synthesizeChunk(
  req: Omit<SynthesizeRequest, 'text'>,
  text: string,
): Promise<ArrayBuffer> {
  const res = await fetch(`${BASE_URL}/v1/synthesis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      speakerUuid: req.speakerUuid,
      styleId: req.styleId,
      text,
      speedScale: req.speedScale,
      volumeScale: req.volumeScale,
      pitchScale: req.pitchScale,
      intonationScale: req.intonationScale,
      prePhonemeLength: req.prePhonemeLength,
      postPhonemeLength: req.postPhonemeLength,
      outputSamplingRate: req.outputSamplingRate,
    }),
  });
  if (!res.ok) throw new Error(`synthesis failed: ${res.status}`);
  return res.arrayBuffer();
}

/** 複数のWAVファイルのPCMデータを結合して1つのWAVにする */
function mergeWavBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 1) return buffers[0];

  // 各WAVからPCMデータ部分（44バイト以降）を抽出
  const pcmChunks = buffers.map((buf) => new Uint8Array(buf, 44));
  const totalPcmSize = pcmChunks.reduce((sum, c) => sum + c.byteLength, 0);

  // 最初のWAVからヘッダー情報を流用
  const header = new DataView(buffers[0].slice(0, 44));
  // RIFFサイズ = ファイル全体 - 8
  header.setUint32(4, 36 + totalPcmSize, true);
  // dataチャンクサイズ
  header.setUint32(40, totalPcmSize, true);

  const merged = new Uint8Array(44 + totalPcmSize);
  merged.set(new Uint8Array(header.buffer), 0);
  let offset = 44;
  for (const chunk of pcmChunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

export async function synthesize(req: SynthesizeRequest): Promise<ArrayBuffer> {
  const chunks = splitText(req.text);

  if (chunks.length === 1) {
    return synthesizeChunk(req, chunks[0]);
  }

  // 複数チャンクの場合は順番に合成してWAVを結合
  const buffers: ArrayBuffer[] = [];
  for (const chunk of chunks) {
    buffers.push(await synthesizeChunk(req, chunk));
  }
  return mergeWavBuffers(buffers);
}
