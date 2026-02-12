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
};
