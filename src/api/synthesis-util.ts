/** 合成サーバーがHTTPエラーを返したことを表す（＝ネットワーク障害ではない） */
export class SynthesisHttpError extends Error {
  constructor(readonly status: number) {
    super(`synthesis failed: ${status}`);
    this.name = 'SynthesisHttpError';
  }
}

const MAX_TEXT_LENGTH = 150;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/** 合成エンジンが処理できない文字を除去・変換 */
export function sanitizeText(text: string): string {
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
export function splitText(text: string): string[] {
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

/**
 * WAVのdataチャンクの位置とサイズを求める。
 * ヘッダー長は44バイトとは限らない（エンジンによってLISTチャンク等が挟まる）ので走査する。
 */
function findDataChunk(buf: ArrayBuffer): { offset: number; size: number } {
  const view = new DataView(buf);
  // "RIFF"（4） + サイズ（4） + "WAVE"（4）の後からチャンクが並ぶ
  let pos = 12;
  while (pos + 8 <= buf.byteLength) {
    const id = String.fromCharCode(
      view.getUint8(pos),
      view.getUint8(pos + 1),
      view.getUint8(pos + 2),
      view.getUint8(pos + 3),
    );
    const size = view.getUint32(pos + 4, true);
    if (id === 'data') {
      // サイズ欄が実データより大きいWAVがあるので実長で丸める
      return { offset: pos + 8, size: Math.min(size, buf.byteLength - pos - 8) };
    }
    // チャンクは偶数バイト境界に揃う
    pos += 8 + size + (size % 2);
  }
  throw new Error('WAVのdataチャンクが見つかりません');
}

/** 複数のWAVのPCMデータを結合して1つのWAVにする（全て同じフォーマット前提） */
export function mergeWavBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 1) return buffers[0];

  const pcmChunks = buffers.map((buf) => {
    const { offset, size } = findDataChunk(buf);
    return new Uint8Array(buf, offset, size);
  });
  const totalPcmSize = pcmChunks.reduce((sum, c) => sum + c.byteLength, 0);

  // 先頭WAVのヘッダー（dataチャンク直前まで）を流用し、サイズ欄だけ書き換える
  const headerSize = findDataChunk(buffers[0]).offset;
  const merged = new Uint8Array(headerSize + totalPcmSize);
  merged.set(new Uint8Array(buffers[0], 0, headerSize), 0);

  const view = new DataView(merged.buffer);
  view.setUint32(4, merged.byteLength - 8, true); // RIFFサイズ = ファイル全体 - 8
  view.setUint32(headerSize - 4, totalPcmSize, true); // dataチャンクサイズ

  let offset = headerSize;
  for (const chunk of pcmChunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

/** ネットワークエラーのみリトライする。HTTPエラーはリトライしても直らないので即座に投げる */
async function withRetry(fn: () => Promise<ArrayBuffer>): Promise<ArrayBuffer> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      if (lastError instanceof SynthesisHttpError) throw lastError;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }
  throw lastError!;
}

/**
 * そのチャンクのテキストが合成できないだけと判断できるHTTPエラーか。
 * 422（リクエスト内容が不正）と5xx（エンジン内部エラー）は読み飛ばして続行する。
 */
function isSkippableChunkError(e: unknown): boolean {
  return e instanceof SynthesisHttpError && (e.status === 422 || e.status >= 500);
}

/**
 * テキストを整形・分割し、チャンクごとに合成して1つのWAVに結合する。
 * 特定のチャンクだけ合成に失敗した場合はそこを読み飛ばし、残りを再生する。
 */
export async function synthesizeChunked(
  text: string,
  synthesizeChunk: (chunk: string) => Promise<ArrayBuffer>,
): Promise<ArrayBuffer> {
  const cleaned = sanitizeText(text);
  if (!cleaned) throw new Error('テキストが空です');

  const chunks = splitText(cleaned);
  if (chunks.length === 1) return withRetry(() => synthesizeChunk(chunks[0]));

  const buffers: ArrayBuffer[] = [];
  for (const chunk of chunks) {
    try {
      buffers.push(await withRetry(() => synthesizeChunk(chunk)));
    } catch (e) {
      if (isSkippableChunkError(e)) {
        console.warn('[yomiage] チャンク合成スキップ:', chunk.slice(0, 30));
        continue;
      }
      throw e;
    }
  }
  if (buffers.length === 0) throw new Error('synthesis failed: all chunks failed');
  return mergeWavBuffers(buffers);
}
