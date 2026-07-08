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

const MAX_TEXT_LENGTH = 150;

/** COEIROINKが処理できない文字を除去・変換 */
function sanitizeText(text: string): string {
  return text
    // 制御文字を除去（改行・タブ以外）
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // 特殊な空白をスペースに統一
    .replace(/[\u00A0\u2000-\u200B\u3000\uFEFF]/g, ' ')
    // 装飾記号・特殊記号を除去
    .replace(/[\u2600-\u27BF\uFE00-\uFE0F\u200C\u200D]/g, '')
    // サロゲートペア（絵文字等）を除去
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    // 連続する空白を1つに
    .replace(/ {2,}/g, ' ')
    .trim();
}

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

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function synthesizeChunk(
  req: Omit<SynthesizeRequest, 'text'>,
  text: string,
): Promise<ArrayBuffer> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
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
    } catch (e) {
      lastError = e as Error;
      // 500系はテキスト起因なのでリトライしない
      if (lastError.message?.includes('synthesis failed:')) throw lastError;
      // ネットワークエラー（Failed to fetch）のみリトライ
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }
  throw lastError!;
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
  const cleaned = sanitizeText(req.text);
  if (!cleaned) throw new Error('テキストが空です');

  const chunks = splitText(cleaned);

  if (chunks.length === 1) {
    return synthesizeChunk(req, chunks[0]);
  }

  // 複数チャンクの場合は順番に合成してWAVを結合
  // 500エラーのチャンクはスキップして残りを再生
  const buffers: ArrayBuffer[] = [];
  for (const chunk of chunks) {
    try {
      buffers.push(await synthesizeChunk(req, chunk));
    } catch (e) {
      const msg = (e as Error).message || '';
      if (msg.includes('500')) {
        console.warn('[yomiage] チャンク合成スキップ (500):', chunk.slice(0, 30));
        continue;
      }
      throw e;
    }
  }
  if (buffers.length === 0) throw new Error('synthesis failed: all chunks returned 500');
  return mergeWavBuffers(buffers);
}
