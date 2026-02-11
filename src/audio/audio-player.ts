let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function playAudioData(audioData: number[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const buffer = new Uint8Array(audioData).buffer;
    const ctx = getAudioContext();

    ctx.decodeAudioData(
      buffer.slice(0),
      (decoded) => {
        // 前の再生を止める
        if (currentSource) {
          try { currentSource.stop(); } catch { /* already stopped */ }
        }

        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.connect(ctx.destination);
        source.onended = () => {
          currentSource = null;
          resolve();
        };
        currentSource = source;
        source.start();
      },
      (err) => reject(err)
    );
  });
}

export function stopCurrentAudio(): void {
  if (currentSource) {
    try { currentSource.stop(); } catch { /* already stopped */ }
    currentSource = null;
  }
}

export function suspendAudio(): Promise<void> {
  return audioContext?.suspend() ?? Promise.resolve();
}

export function resumeAudio(): Promise<void> {
  return audioContext?.resume() ?? Promise.resolve();
}
