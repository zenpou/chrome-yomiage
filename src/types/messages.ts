import type { Speaker, SynthesizeRequest } from './coeiroink';
import type { UserSettings } from './settings';

export type RequestMessage =
  | { type: 'GET_SPEAKERS' }
  | { type: 'SYNTHESIZE'; payload: SynthesizeRequest }
  | { type: 'SAVE_SETTINGS'; settings: UserSettings };

export type ResponseMessage =
  | { type: 'SPEAKERS_RESULT'; speakers: Speaker[] }
  | { type: 'SYNTHESIZE_RESULT'; audioBuffer: ArrayBuffer }
  | { type: 'ERROR'; message: string };
