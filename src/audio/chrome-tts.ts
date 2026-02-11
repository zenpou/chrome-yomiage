// Chrome TTS (Web Speech API) のスピーカーUUIDプレフィックス
export const CHROME_TTS_PREFIX = 'chrome-tts:';

export function isChromeTts(speakerUuid: string): boolean {
  return speakerUuid.startsWith(CHROME_TTS_PREFIX);
}

export function getChromeTtsVoiceName(speakerUuid: string): string {
  return speakerUuid.slice(CHROME_TTS_PREFIX.length);
}

/** Web Speech APIで利用可能な音声一覧を取得 */
export function getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
    } else {
      // voiceschangedイベントを待つ（初回ロード時）
      speechSynthesis.onvoiceschanged = () => {
        resolve(speechSynthesis.getVoices());
      };
      // タイムアウト保険
      setTimeout(() => resolve(speechSynthesis.getVoices()), 1000);
    }
  });
}

/** Web Speech APIでテキストを読み上げる */
export function speakWithChromeTts(
  text: string,
  voiceName: string,
  speedScale: number,
  volumeScale: number,
  pitchScale: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // 前の発話をキャンセル
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // 音声を選択
    const voices = speechSynthesis.getVoices();
    const voice = voices.find((v) => v.name === voiceName);
    if (voice) utterance.voice = voice;

    // パラメータ変換（COEIROINKのスケールをWeb Speech APIに近似変換）
    utterance.rate = Math.max(0.1, Math.min(10, speedScale));
    utterance.volume = Math.max(0, Math.min(1, volumeScale / 2));
    utterance.pitch = Math.max(0, Math.min(2, 1.0 + pitchScale * 5));

    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
      // 'interrupted'は停止操作なので正常終了扱い
      if (e.error === 'interrupted' || e.error === 'canceled') {
        resolve();
      } else {
        reject(new Error(`Chrome TTS error: ${e.error}`));
      }
    };

    speechSynthesis.speak(utterance);
  });
}

/** Chrome TTSの再生を停止 */
export function stopChromeTts(): void {
  speechSynthesis.cancel();
}
