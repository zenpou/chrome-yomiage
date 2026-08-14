import type { Speaker, SynthesizeRequest } from '../types/coeiroink';
import * as coeiroink from './coeiroink';
import * as voicevox from './voicevox';

/** HTTP API で音声を合成するローカルエンジン（Chrome TTS はここには含まない） */
export type EngineId = 'voicevox' | 'coeiroink';

export interface TtsEngine {
  readonly id: EngineId;
  readonly label: string;
  fetchSpeakers(): Promise<Speaker[]>;
  synthesize(req: SynthesizeRequest): Promise<ArrayBuffer>;
}

export const ENGINES: Record<EngineId, TtsEngine> = {
  voicevox: {
    id: 'voicevox',
    label: 'VOICEVOX',
    fetchSpeakers: voicevox.fetchSpeakers,
    synthesize: voicevox.synthesize,
  },
  coeiroink: {
    id: 'coeiroink',
    label: 'COEIROINK',
    fetchSpeakers: coeiroink.fetchSpeakers,
    synthesize: coeiroink.synthesize,
  },
};

/** 話者未設定時の自動選択は、この順にエンジンを試す */
export const ENGINE_IDS = Object.keys(ENGINES) as EngineId[];

/**
 * 話者UUIDから合成エンジンを判定する。
 * COEIROINKの話者は接頭辞なしのUUIDで保存済みなので、既存設定を壊さないよう既定とする。
 */
export function engineIdFor(speakerUuid: string): EngineId {
  return voicevox.isVoicevox(speakerUuid) ? 'voicevox' : 'coeiroink';
}

export function engineFor(speakerUuid: string): TtsEngine {
  return ENGINES[engineIdFor(speakerUuid)];
}

export function isEngineId(value: unknown): value is EngineId {
  return typeof value === 'string' && value in ENGINES;
}
