export interface SpeakerStyle {
  styleName: string;
  styleId: number;
}

export interface Speaker {
  speakerName: string;
  speakerUuid: string;
  styles: SpeakerStyle[];
}

export interface SynthesizeRequest {
  speakerUuid: string;
  styleId: number;
  text: string;
  speedScale: number;
  volumeScale: number;
  pitchScale: number;
  intonationScale: number;
  prePhonemeLength: number;
  postPhonemeLength: number;
  outputSamplingRate: number;
}
