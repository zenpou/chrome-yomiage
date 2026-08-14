import { describe, it, expect } from 'vitest';
import { mergeWavBuffers, sanitizeText, splitText } from './synthesis-util';

function ascii(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

/** 標準的な44バイトヘッダーのWAV */
function wav(pcm: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(buf);
  ascii(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  ascii(view, 8, 'WAVE');
  ascii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  ascii(view, 36, 'data');
  view.setUint32(40, pcm.length, true);
  new Uint8Array(buf).set(pcm, 44);
  return buf;
}

/** fmt と data の間に LIST チャンクが挟まるWAV（ヘッダーが44バイトではない） */
function wavWithListChunk(pcm: number[]): ArrayBuffer {
  const listSize = 8; // 中身は使わない
  const headerSize = 44 + 8 + listSize;
  const buf = new ArrayBuffer(headerSize + pcm.length);
  const view = new DataView(buf);
  ascii(view, 0, 'RIFF');
  view.setUint32(4, headerSize - 8 + pcm.length, true);
  ascii(view, 8, 'WAVE');
  ascii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  ascii(view, 36, 'LIST');
  view.setUint32(40, listSize, true);
  ascii(view, 44 + listSize, 'data');
  view.setUint32(48 + listSize, pcm.length, true);
  new Uint8Array(buf).set(pcm, headerSize);
  return buf;
}

describe('sanitizeText', () => {
  it('絵文字・装飾記号・ゼロ幅文字を除去する', () => {
    expect(sanitizeText('こんにちは😀世界')).toBe('こんにちは世界');
    expect(sanitizeText('あ\u200Bい\uFEFFう')).toBe('あ い う');
  });

  it('制御文字を除去し、連続する空白を1つにまとめる', () => {
    expect(sanitizeText('あ\x00い   う')).toBe('あい う');
  });
});

describe('splitText', () => {
  it('150文字以下なら分割しない', () => {
    const text = 'あ'.repeat(150);
    expect(splitText(text)).toEqual([text]);
  });

  it('句点で区切って分割する', () => {
    const chunks = splitText('あ'.repeat(120) + '。' + 'い'.repeat(120) + '。');
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe('あ'.repeat(120) + '。');
    expect(chunks[1]).toBe('い'.repeat(120) + '。');
  });

  it('区切り文字がなければ最大長で切る', () => {
    const chunks = splitText('あ'.repeat(400));
    expect(chunks).toEqual(['あ'.repeat(150), 'あ'.repeat(150), 'あ'.repeat(100)]);
  });
});

describe('mergeWavBuffers', () => {
  it('1つだけならそのまま返す', () => {
    const buf = wav([1, 2]);
    expect(mergeWavBuffers([buf])).toBe(buf);
  });

  it('PCMを連結し、RIFFサイズとdataサイズを書き換える', () => {
    const merged = mergeWavBuffers([wav([1, 2]), wav([3, 4]), wav([5, 6])]);
    const view = new DataView(merged);

    expect(merged.byteLength).toBe(44 + 6);
    expect(view.getUint32(4, true)).toBe(merged.byteLength - 8);
    expect(view.getUint32(40, true)).toBe(6);
    expect([...new Uint8Array(merged, 44)]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('ヘッダーが44バイトでないWAV（LISTチャンク入り）でもdataチャンクを見つけて結合する', () => {
    const merged = mergeWavBuffers([wavWithListChunk([1, 2]), wavWithListChunk([3, 4])]);
    const headerSize = 44 + 8 + 8;
    const view = new DataView(merged);

    expect(merged.byteLength).toBe(headerSize + 4);
    expect(view.getUint32(4, true)).toBe(merged.byteLength - 8);
    expect(view.getUint32(headerSize - 4, true)).toBe(4);
    expect([...new Uint8Array(merged, headerSize)]).toEqual([1, 2, 3, 4]);
  });
});
