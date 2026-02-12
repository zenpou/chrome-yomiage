import type { Paragraph } from '../adapters/adapter-interface';
import type { SynthesizeRequest } from '../types/coeiroink';
import { playAudioData, stopCurrentAudio, suspendAudio, resumeAudio } from './audio-player';
import {
  isChromeTts,
  getChromeTtsVoiceName,
  speakWithChromeTts,
  stopChromeTts,
} from './chrome-tts';

type EntryState = 'pending' | 'fetching' | 'ready' | 'playing' | 'done' | 'error';

interface QueueEntry {
  paragraph: Paragraph;
  state: EntryState;
  audioData?: number[];
}

export type QueueState = 'idle' | 'playing' | 'paused' | 'loading';

export class AudioQueue {
  private queue: QueueEntry[] = [];
  private currentIndex = 0;
  private synthesizeParams: Omit<SynthesizeRequest, 'text'> | null = null;
  private prefetchAhead = 2;
  private _state: QueueState = 'idle';
  private stopRequested = false;
  private pauseRequested = false;
  private playGeneration = 0;

  onParagraphStart?: (paragraph: Paragraph) => void;
  onParagraphEnd?: (paragraph: Paragraph) => void;
  onQueueEnd?: () => void;
  onError?: (paragraph: Paragraph, error: Error) => void;
  onStateChange?: (state: QueueState) => void;

  get state(): QueueState {
    return this._state;
  }

  get index(): number {
    return this.currentIndex;
  }

  get length(): number {
    return this.queue.length;
  }

  private get isChromeTtsMode(): boolean {
    return !!this.synthesizeParams && isChromeTts(this.synthesizeParams.speakerUuid);
  }

  load(paragraphs: Paragraph[], params: Omit<SynthesizeRequest, 'text'>): void {
    this.queue = paragraphs.map((p) => ({ paragraph: p, state: 'pending' }));
    this.currentIndex = 0;
    this.synthesizeParams = params;
    this.stopRequested = false;
    this.pauseRequested = false;
  }

  async play(): Promise<void> {
    if (!this.synthesizeParams) return;
    this.stopRequested = false;
    this.pauseRequested = false;
    const generation = ++this.playGeneration;
    this.setState('loading');

    // Chrome TTSはプリフェッチ不要（リアルタイム合成）
    if (!this.isChromeTtsMode) {
      this.prefetch();
    }
    await this.playFrom(this.currentIndex, generation);
  }

  async pause(): Promise<void> {
    this.pauseRequested = true;
    if (this.isChromeTtsMode) {
      speechSynthesis.pause();
    } else {
      await suspendAudio();
    }
    this.setState('paused');
  }

  async resume(): Promise<void> {
    if (this._state !== 'paused') return;
    this.pauseRequested = false;
    if (this.isChromeTtsMode) {
      speechSynthesis.resume();
    } else {
      await resumeAudio();
    }
    this.setState('playing');
  }

  stop(): void {
    this.stopRequested = true;
    if (this.isChromeTtsMode) {
      stopChromeTts();
    } else {
      stopCurrentAudio();
    }
    this.currentIndex = 0;
    this.queue.forEach((e) => {
      e.state = 'pending';
      e.audioData = undefined;
    });
    this.setState('idle');
  }

  seekTo(index: number): void {
    this.stop();
    this.currentIndex = Math.max(0, Math.min(index, this.queue.length - 1));
    this.queue[this.currentIndex].state = 'pending';
  }

  updateParams(params: Omit<SynthesizeRequest, 'text'>): void {
    this.synthesizeParams = params;
    this.queue.forEach((e) => {
      if (e.state === 'ready' || e.state === 'fetching') {
        e.state = 'pending';
        e.audioData = undefined;
      }
    });
  }

  private setState(state: QueueState): void {
    this._state = state;
    this.onStateChange?.(state);
  }

  private prefetch(): void {
    if (!this.synthesizeParams || this.isChromeTtsMode) return;
    const targets = this.queue
      .slice(this.currentIndex, this.currentIndex + this.prefetchAhead)
      .filter((e) => e.state === 'pending');

    targets.forEach((entry) => this.fetchEntry(entry));
  }

  private async fetchEntry(entry: QueueEntry): Promise<void> {
    if (!this.synthesizeParams) return;
    entry.state = 'fetching';
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SYNTHESIZE',
        payload: { ...this.synthesizeParams, text: entry.paragraph.text },
      });
      if (response.error) throw new Error(response.error);
      entry.audioData = response.audioData;
      entry.state = 'ready';
    } catch (e) {
      entry.state = 'error';
      // 拡張機能の再読み込みによりコンテキストが無効になった場合は再生を停止
      if ((e as Error).message?.includes('Extension context invalidated')) {
        this.stop();
        return;
      }
      this.onError?.(entry.paragraph, e as Error);
    }
  }

  private async playFrom(startIndex: number, generation: number): Promise<void> {
    let index = startIndex;
    let consecutiveErrors = 0;

    while (index < this.queue.length) {
      if (this.stopRequested || this.playGeneration !== generation) return;

      const entry = this.queue[index];

      if (entry.state === 'done') {
        index++;
        continue;
      }

      if (entry.state === 'error') {
        consecutiveErrors++;
        // 3回連続エラーなら接続障害とみなし停止
        if (consecutiveErrors >= 3) {
          this.setState('idle');
          return;
        }
        index++;
        continue;
      }

      consecutiveErrors = 0;

      // Chrome TTSモード: プリフェッチなしで直接再生
      if (this.isChromeTtsMode) {
        await this.playEntryWithChromeTts(entry, index);
      } else {
        await this.playEntryWithCoeiroink(entry, index);
      }

      if (this.stopRequested || this.playGeneration !== generation) return;
      if (this.pauseRequested) {
        while (this.pauseRequested && !this.stopRequested) {
          await sleep(100);
        }
        if (this.stopRequested || this.playGeneration !== generation) return;
      }

      entry.state = 'done';
      this.onParagraphEnd?.(entry.paragraph);
      index++;

      if (!this.isChromeTtsMode) {
        this.prefetch();
      }
    }

    if (!this.stopRequested && this.playGeneration === generation) {
      this.setState('idle');
      this.onQueueEnd?.();
    }
  }

  private async playEntryWithChromeTts(entry: QueueEntry, index: number): Promise<void> {
    if (!this.synthesizeParams) return;
    const voiceName = getChromeTtsVoiceName(this.synthesizeParams.speakerUuid);

    entry.state = 'playing';
    this.currentIndex = index;
    this.setState('playing');
    this.onParagraphStart?.(entry.paragraph);

    try {
      await speakWithChromeTts(
        entry.paragraph.text,
        voiceName,
        this.synthesizeParams.speedScale,
        this.synthesizeParams.volumeScale,
        this.synthesizeParams.pitchScale,
      );
    } catch (e) {
      this.onError?.(entry.paragraph, e as Error);
    }
  }

  private async playEntryWithCoeiroink(entry: QueueEntry, index: number): Promise<void> {
    // バッファが準備できるまで待機
    while (entry.state === 'fetching' || entry.state === 'pending') {
      if (this.stopRequested) return;
      if (entry.state === 'pending') {
        await this.fetchEntry(entry);
      } else {
        await sleep(50);
      }
    }

    if (entry.state === 'error') return;
    if (!entry.audioData) return;

    entry.state = 'playing';
    this.currentIndex = index;
    this.setState('playing');
    this.onParagraphStart?.(entry.paragraph);

    try {
      await playAudioData(entry.audioData);
    } catch (e) {
      console.error('[yomiage] 再生エラー:', e);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
