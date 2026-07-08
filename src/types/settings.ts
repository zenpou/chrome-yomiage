/** 役割別の声設定（話者+スタイルのみ。他パラメータは全役割共通） */
export interface RoleVoice {
  speakerUuid: string;
  styleId: number;
}

export interface UserSettings {
  speakerUuid: string;
  styleId: number;
  speedScale: number;
  volumeScale: number;
  pitchScale: number;
  intonationScale: number;
  prePhonemeLength: number;
  postPhonemeLength: number;
  outputSamplingRate: number;
  clickToSeek: boolean;
  autoNextChapter: boolean;
  autoScroll: boolean;
  /** 会話文1の声（null = 全般と同じ） */
  dialogue1Voice: RoleVoice | null;
  /** 会話文2（連続時）の声（null = 会話文1と同じ） */
  dialogue2Voice: RoleVoice | null;
  /** 心の声（null = 全般と同じ） */
  monologueVoice: RoleVoice | null;
}

export const DEFAULT_SETTINGS: UserSettings = {
  speakerUuid: '',
  styleId: 0,
  speedScale: 1.0,
  volumeScale: 1.0,
  pitchScale: 0.0,
  intonationScale: 1.0,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.1,
  outputSamplingRate: 24000,
  clickToSeek: false,
  autoNextChapter: false,
  autoScroll: true,
  dialogue1Voice: null,
  dialogue2Voice: null,
  monologueVoice: null,
};
