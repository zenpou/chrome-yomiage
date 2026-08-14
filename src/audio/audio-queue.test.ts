import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Paragraph } from '../adapters/adapter-interface';
import { AudioQueue } from './audio-queue';

vi.mock('./audio-player', () => ({
  playAudioData: vi.fn(() => Promise.resolve()),
  stopCurrentAudio: vi.fn(),
  suspendAudio: vi.fn(() => Promise.resolve()),
  resumeAudio: vi.fn(() => Promise.resolve()),
}));

// COEIROINK経路をテストするので isChromeTts は常に false
vi.mock('./chrome-tts', () => ({
  isChromeTts: vi.fn(() => false),
  getChromeTtsVoiceName: vi.fn(() => ''),
  speakWithChromeTts: vi.fn(() => Promise.resolve()),
  stopChromeTts: vi.fn(),
}));

const PARAMS = {
  speakerUuid: 'speaker-1',
  styleId: 0,
  speedScale: 1.0,
  volumeScale: 1.0,
  pitchScale: 0.0,
  intonationScale: 1.0,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.1,
  outputSamplingRate: 24000,
};

function paragraphs(count: number): Paragraph[] {
  return Array.from({ length: count }, (_, index) => ({
    text: `段落${index}`,
    element: null,
    index,
  }));
}

/**
 * chrome.runtime.sendMessage のモックを差し込む。
 * failFor に含まれるテキストの合成だけ失敗させる。
 */
function stubChrome(failFor: (text: string) => boolean) {
  const sendMessage = vi.fn(async (message: { payload: { text: string } }) => {
    const text = message.payload.text;
    if (failFor(text)) return { error: `合成失敗: ${text}` };
    return { audioData: [1, 2, 3] };
  });
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  return sendMessage;
}

/** 合成を要求されたテキストの一覧 */
function requestedTexts(sendMessage: ReturnType<typeof stubChrome>): string[] {
  return sendMessage.mock.calls.map((call) => call[0].payload.text);
}

describe('AudioQueue（COEIROINK経路）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('全段落の合成が成功すれば開始・終了通知が順に発火し、最後に onQueueEnd が呼ばれる', async () => {
    stubChrome(() => false);
    const queue = new AudioQueue();
    const started: string[] = [];
    const ended: string[] = [];
    const onQueueEnd = vi.fn();
    queue.onParagraphStart = (p) => started.push(p.text);
    queue.onParagraphEnd = (p) => ended.push(p.text);
    queue.onQueueEnd = onQueueEnd;

    queue.load(paragraphs(4), PARAMS);
    await queue.play();

    expect(started).toEqual(['段落0', '段落1', '段落2', '段落3']);
    expect(ended).toEqual(['段落0', '段落1', '段落2', '段落3']);
    expect(onQueueEnd).toHaveBeenCalledTimes(1);
    expect(queue.state).toBe('idle');
  });

  it('3段落連続で合成に失敗したら停止し、4段落目以降の合成を要求しない', async () => {
    const sendMessage = stubChrome(() => true);
    const queue = new AudioQueue();
    const onQueueEnd = vi.fn();
    const onError = vi.fn();
    queue.onQueueEnd = onQueueEnd;
    queue.onError = onError;

    queue.load(paragraphs(6), PARAMS);
    await queue.play();

    expect(queue.state).toBe('idle');
    expect(onQueueEnd).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    // 先読み分（3段落）だけが要求され、4段落目以降には到達しない
    expect(requestedTexts(sendMessage)).toEqual(['段落0', '段落1', '段落2']);
  });

  it('合成に失敗した段落では onParagraphEnd を発火しない', async () => {
    stubChrome(() => true);
    const queue = new AudioQueue();
    const onParagraphEnd = vi.fn();
    const onParagraphStart = vi.fn();
    queue.onParagraphEnd = onParagraphEnd;
    queue.onParagraphStart = onParagraphStart;

    queue.load(paragraphs(6), PARAMS);
    await queue.play();

    expect(onParagraphEnd).not.toHaveBeenCalled();
    expect(onParagraphStart).not.toHaveBeenCalled();
  });

  it('途中の1段落だけ失敗しても、後続の段落の再生は続く', async () => {
    stubChrome((text) => text === '段落1');
    const queue = new AudioQueue();
    const ended: string[] = [];
    const onQueueEnd = vi.fn();
    queue.onParagraphEnd = (p) => ended.push(p.text);
    queue.onQueueEnd = onQueueEnd;

    queue.load(paragraphs(4), PARAMS);
    await queue.play();

    expect(ended).toEqual(['段落0', '段落2', '段落3']);
    expect(onQueueEnd).toHaveBeenCalledTimes(1);
    expect(queue.state).toBe('idle');
  });

  it('失敗が連続しなければ3回失敗しても停止しない', async () => {
    stubChrome((text) => text === '段落1' || text === '段落3' || text === '段落5');
    const queue = new AudioQueue();
    const ended: string[] = [];
    const onQueueEnd = vi.fn();
    queue.onParagraphEnd = (p) => ended.push(p.text);
    queue.onQueueEnd = onQueueEnd;

    queue.load(paragraphs(7), PARAMS);
    await queue.play();

    expect(ended).toEqual(['段落0', '段落2', '段落4', '段落6']);
    expect(onQueueEnd).toHaveBeenCalledTimes(1);
  });
});
