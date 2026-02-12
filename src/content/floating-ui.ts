import type { QueueState } from '../audio/audio-queue';

const SHADOW_CSS = `
:host {
  all: initial;
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif;
  font-size: 13px;
}

.container {
  background: rgba(20, 20, 20, 0.92);
  color: #fff;
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  min-width: 240px;
  max-width: 300px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.1);
  user-select: none;
}

.header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.title {
  font-size: 11px;
  color: rgba(255,255,255,0.6);
  flex: 1;
}

.btn-settings {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  font-size: 13px;
  cursor: pointer;
  padding: 3px 5px;
  border-radius: 5px;
  line-height: 1;
  transition: color 0.15s, background 0.15s;
}

.btn-settings:hover {
  color: #fff;
  background: rgba(255,255,255,0.1);
}

.btn-settings.active {
  color: #64b5f6;
}

.controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  padding: 5px 7px;
  border-radius: 6px;
  transition: background 0.15s;
  line-height: 1;
}

.btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.15);
}

.btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.btn.active {
  color: #64b5f6;
}

.btn-chapter {
  font-size: 14px;
  color: rgba(255,255,255,0.7);
}

.btn-para {
  font-size: 15px;
}

.separator {
  width: 1px;
  height: 18px;
  background: rgba(255,255,255,0.15);
  margin: 0 3px;
}

.progress-wrap {
  height: 3px;
  background: rgba(255,255,255,0.15);
  border-radius: 2px;
  margin: 6px 0;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #64b5f6;
  border-radius: 2px;
  transition: width 0.3s ease;
  width: 0%;
}

.status {
  font-size: 11px;
  color: rgba(255,255,255,0.5);
  text-align: right;
}

.status.loading {
  color: #ffb74d;
}

.status.error {
  color: #ef5350;
}

.status.info {
  color: #ffb74d;
}

.settings-panel {
  display: none;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255,255,255,0.1);
}

.settings-panel.open {
  display: block;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.settings-row:last-child {
  margin-bottom: 0;
}

.settings-label {
  font-size: 11px;
  color: rgba(255,255,255,0.7);
}

.toggle-track {
  position: relative;
  width: 32px;
  height: 18px;
  background: #444;
  border-radius: 9px;
  flex-shrink: 0;
  cursor: pointer;
  transition: background 0.2s;
}

.toggle-track.on {
  background: #1565c0;
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  transition: left 0.2s;
  pointer-events: none;
}

.toggle-track.on .toggle-thumb {
  left: 16px;
}

.settings-slider-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.settings-range {
  width: 90px;
  height: 4px;
  accent-color: #64b5f6;
  cursor: pointer;
}

.settings-val {
  font-size: 11px;
  color: rgba(255,255,255,0.6);
  min-width: 28px;
  text-align: right;
}
`;

export class FloatingUI {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private playBtn!: HTMLButtonElement;
  private pauseBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private prevParaBtn!: HTMLButtonElement;
  private nextParaBtn!: HTMLButtonElement;
  private prevChapterBtn!: HTMLButtonElement;
  private nextChapterBtn!: HTMLButtonElement;
  private progressFill!: HTMLElement;
  private statusEl!: HTMLElement;
  private settingsBtn!: HTMLButtonElement;
  private settingsPanel!: HTMLElement;
  private clickToSeekToggle!: HTMLElement;
  private autoNextChapterToggle!: HTMLElement;
  private autoScrollToggle!: HTMLElement;
  private speedRange!: HTMLInputElement;
  private speedVal!: HTMLElement;

  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onPrevParagraph?: () => void;
  onNextParagraph?: () => void;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  onClickToSeekChange?: (enabled: boolean) => void;
  onAutoNextChapterChange?: (enabled: boolean) => void;
  onAutoScrollChange?: (enabled: boolean) => void;
  onSpeedChange?: (speed: number) => void;

  constructor() {
    this.host = document.createElement('div');
    this.host.id = 'yomiage-host';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.buildDOM();
    this.bindEvents();
  }

  mount(): void {
    document.body.appendChild(this.host);
  }

  unmount(): void {
    this.host.remove();
  }

  setState(state: QueueState): void {
    const isPlaying = state === 'playing';
    const isPaused = state === 'paused';
    const isLoading = state === 'loading';
    const isIdle = state === 'idle';

    this.playBtn.disabled = isPlaying || isLoading;
    this.pauseBtn.disabled = isIdle || isLoading;
    this.stopBtn.disabled = isIdle;
    this.prevParaBtn.disabled = isIdle || isLoading;
    this.nextParaBtn.disabled = isIdle || isLoading;

    this.playBtn.classList.toggle('active', isIdle || isPaused);
    this.pauseBtn.classList.toggle('active', isPlaying || isPaused);

    if (isLoading) {
      this.statusEl.textContent = '読み込み中...';
      this.statusEl.className = 'status loading';
    } else if (isIdle) {
      this.statusEl.textContent = '待機中';
      this.statusEl.className = 'status';
    }
  }

  setChapterNav(hasPrev: boolean, hasNext: boolean): void {
    this.prevChapterBtn.disabled = !hasPrev;
    this.nextChapterBtn.disabled = !hasNext;
  }

  setClickToSeek(enabled: boolean): void {
    this.clickToSeekToggle.classList.toggle('on', enabled);
  }

  setAutoNextChapter(enabled: boolean): void {
    this.autoNextChapterToggle.classList.toggle('on', enabled);
  }

  setAutoScroll(enabled: boolean): void {
    this.autoScrollToggle.classList.toggle('on', enabled);
  }

  setSpeed(speed: number): void {
    this.speedRange.value = String(speed);
    this.speedVal.textContent = speed.toFixed(1);
  }

  updateProgress(current: number, total: number): void {
    const pct = total > 0 ? (current / total) * 100 : 0;
    this.progressFill.style.width = `${pct}%`;
    this.statusEl.textContent = `${current} / ${total} 段落`;
    this.statusEl.className = 'status';
  }

  showError(message: string): void {
    this.statusEl.textContent = `エラー: ${message}`;
    this.statusEl.className = 'status error';
  }

  showInfo(message: string): void {
    this.statusEl.textContent = message;
    this.statusEl.className = 'status info';
    setTimeout(() => {
      if (this.statusEl.className === 'status info') {
        this.statusEl.className = 'status';
      }
    }, 4000);
  }

  private buildDOM(): void {
    this.shadow.innerHTML = `
      <style>${SHADOW_CSS}</style>
      <div class="container">
        <div class="header">
          <span class="title">🔊 小説読み上げ</span>
          <button class="btn-settings" title="設定">⚙</button>
        </div>
        <div class="controls">
          <button class="btn btn-chapter btn-prev-chapter" title="前話">⏮</button>
          <div class="separator"></div>
          <button class="btn btn-para btn-prev-para" title="前の段落" disabled>⏪</button>
          <button class="btn btn-play" title="再生">▶</button>
          <button class="btn btn-pause" title="一時停止/再開" disabled>⏸</button>
          <button class="btn btn-stop" title="停止" disabled>⏹</button>
          <button class="btn btn-para btn-next-para" title="次の段落" disabled>⏩</button>
          <div class="separator"></div>
          <button class="btn btn-chapter btn-next-chapter" title="次話">⏭</button>
        </div>
        <div class="progress-wrap">
          <div class="progress-fill"></div>
        </div>
        <div class="status">待機中</div>
        <div class="settings-panel">
          <div class="settings-row">
            <span class="settings-label">本文クリックでシーク</span>
            <div class="toggle-track" id="click-to-seek-toggle">
              <div class="toggle-thumb"></div>
            </div>
          </div>
          <div class="settings-row">
            <span class="settings-label">最終話で次話へ自動移動</span>
            <div class="toggle-track" id="auto-next-chapter-toggle">
              <div class="toggle-thumb"></div>
            </div>
          </div>
          <div class="settings-row">
            <span class="settings-label">読んでいる箇所へ自動スクロール</span>
            <div class="toggle-track on" id="auto-scroll-toggle">
              <div class="toggle-thumb"></div>
            </div>
          </div>
          <div class="settings-row">
            <span class="settings-label">速度</span>
            <div class="settings-slider-wrap">
              <input type="range" class="settings-range" id="speed-range" min="0.5" max="2.0" step="0.1" value="1.0">
              <span class="settings-val" id="speed-val">1.0</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.playBtn = this.shadow.querySelector('.btn-play') as HTMLButtonElement;
    this.pauseBtn = this.shadow.querySelector('.btn-pause') as HTMLButtonElement;
    this.stopBtn = this.shadow.querySelector('.btn-stop') as HTMLButtonElement;
    this.prevParaBtn = this.shadow.querySelector('.btn-prev-para') as HTMLButtonElement;
    this.nextParaBtn = this.shadow.querySelector('.btn-next-para') as HTMLButtonElement;
    this.prevChapterBtn = this.shadow.querySelector('.btn-prev-chapter') as HTMLButtonElement;
    this.nextChapterBtn = this.shadow.querySelector('.btn-next-chapter') as HTMLButtonElement;
    this.progressFill = this.shadow.querySelector('.progress-fill') as HTMLElement;
    this.statusEl = this.shadow.querySelector('.status') as HTMLElement;
    this.settingsBtn = this.shadow.querySelector('.btn-settings') as HTMLButtonElement;
    this.settingsPanel = this.shadow.querySelector('.settings-panel') as HTMLElement;
    this.clickToSeekToggle = this.shadow.querySelector('#click-to-seek-toggle') as HTMLElement;
    this.autoNextChapterToggle = this.shadow.querySelector('#auto-next-chapter-toggle') as HTMLElement;
    this.autoScrollToggle = this.shadow.querySelector('#auto-scroll-toggle') as HTMLElement;
    this.speedRange = this.shadow.querySelector('#speed-range') as HTMLInputElement;
    this.speedVal = this.shadow.querySelector('#speed-val') as HTMLElement;
  }

  private bindEvents(): void {
    this.playBtn.addEventListener('click', () => this.onPlay?.());
    this.pauseBtn.addEventListener('click', () => this.onPause?.());
    this.stopBtn.addEventListener('click', () => this.onStop?.());
    this.prevParaBtn.addEventListener('click', () => this.onPrevParagraph?.());
    this.nextParaBtn.addEventListener('click', () => this.onNextParagraph?.());
    this.prevChapterBtn.addEventListener('click', () => this.onPrevChapter?.());
    this.nextChapterBtn.addEventListener('click', () => this.onNextChapter?.());

    this.settingsBtn.addEventListener('click', () => {
      const open = this.settingsPanel.classList.toggle('open');
      this.settingsBtn.classList.toggle('active', open);
    });

    this.clickToSeekToggle.addEventListener('click', () => {
      const enabled = !this.clickToSeekToggle.classList.contains('on');
      this.clickToSeekToggle.classList.toggle('on', enabled);
      this.onClickToSeekChange?.(enabled);
    });

    this.autoNextChapterToggle.addEventListener('click', () => {
      const enabled = !this.autoNextChapterToggle.classList.contains('on');
      this.autoNextChapterToggle.classList.toggle('on', enabled);
      this.onAutoNextChapterChange?.(enabled);
    });

    this.autoScrollToggle.addEventListener('click', () => {
      const enabled = !this.autoScrollToggle.classList.contains('on');
      this.autoScrollToggle.classList.toggle('on', enabled);
      this.onAutoScrollChange?.(enabled);
    });

    this.speedRange.addEventListener('input', () => {
      const val = Number(this.speedRange.value);
      this.speedVal.textContent = val.toFixed(1);
      this.onSpeedChange?.(val);
    });
  }
}
