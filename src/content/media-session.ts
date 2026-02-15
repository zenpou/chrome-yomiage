/**
 * Media Session API を使ってイヤホンやOS のメディアボタンを拾う。
 * ブラウザがメディアセッションをアクティブにするには <audio> 再生が必要なため、
 * 無音 WAV をループ再生するダミー要素を使う。
 */

export interface MediaSessionCallbacks {
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
}

let silentAudio: HTMLAudioElement | null = null;

function createSilentWav(): Blob {
  const sampleRate = 44100;
  const numSamples = sampleRate; // 1秒
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);      // PCM
  view.setUint16(22, 1, true);      // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);      // block align
  view.setUint16(34, 16, true);     // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  // サンプルはすべて0（無音）

  return new Blob([buffer], { type: 'audio/wav' });
}

export function setupMediaSession(callbacks: MediaSessionCallbacks): void {
  if (!('mediaSession' in navigator)) return;

  const blob = createSilentWav();
  silentAudio = new Audio(URL.createObjectURL(blob));
  silentAudio.loop = true;
  silentAudio.volume = 0.01;

  navigator.mediaSession.setActionHandler('play', callbacks.onPlay);
  navigator.mediaSession.setActionHandler('pause', callbacks.onPause);
  navigator.mediaSession.setActionHandler('stop', callbacks.onStop);
  navigator.mediaSession.setActionHandler('previoustrack', callbacks.onPrevTrack);
  navigator.mediaSession.setActionHandler('nexttrack', callbacks.onNextTrack);
}

/** 再生開始時に呼ぶ — メディアセッションをアクティブにする */
export function activateMediaSession(title?: string): void {
  if (silentAudio && silentAudio.paused) {
    silentAudio.play().catch(() => {});
  }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'playing';
    if (title) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: '小説読み上げ',
      });
    }
  }
}

/** 一時停止時に呼ぶ */
export function pauseMediaSession(): void {
  if (silentAudio && !silentAudio.paused) {
    silentAudio.pause();
  }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'paused';
  }
}

/** 停止時に呼ぶ — メディアセッションを無効にする */
export function deactivateMediaSession(): void {
  if (silentAudio && !silentAudio.paused) {
    silentAudio.pause();
  }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none';
  }
}

/** 段落再生開始時にメタデータを更新 */
export function updateMediaMetadata(title: string, chapter?: string): void {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist: chapter || '小説読み上げ',
  });
}
