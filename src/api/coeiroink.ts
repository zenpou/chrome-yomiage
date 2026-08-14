import type { Speaker, SynthesizeRequest } from '../types/coeiroink';
import { SynthesisHttpError, synthesizeChunked } from './synthesis-util';

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

export function synthesize(req: SynthesizeRequest): Promise<ArrayBuffer> {
  return synthesizeChunked(req.text, async (text) => {
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
    if (!res.ok) throw new SynthesisHttpError(res.status);
    return res.arrayBuffer();
  });
}
