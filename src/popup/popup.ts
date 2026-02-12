import './popup.css';
import { loadSettings, saveSettings } from '../storage/settings';
import { CHROME_TTS_PREFIX } from '../audio/chrome-tts';
import type { Speaker } from '../types/coeiroink';

type Engine = 'coeiroink' | 'chrome';

async function init() {
  const connectionEl = document.getElementById('connection-status')!;
  const speakerSel = document.getElementById('speaker-select') as HTMLSelectElement;
  const styleSel = document.getElementById('style-select') as HTMLSelectElement;
  const styleSection = document.getElementById('style-section')!;
  const intonationSection = document.getElementById('intonation-section')!;
  const speedInput = document.getElementById('speed') as HTMLInputElement;
  const volumeInput = document.getElementById('volume') as HTMLInputElement;
  const pitchInput = document.getElementById('pitch') as HTMLInputElement;
  const intonationInput = document.getElementById('intonation') as HTMLInputElement;
  const speedVal = document.getElementById('speed-val')!;
  const volumeVal = document.getElementById('volume-val')!;
  const pitchVal = document.getElementById('pitch-val')!;
  const intonationVal = document.getElementById('intonation-val')!;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const saveStatus = document.getElementById('save-status')!;
  const tabCoeiroink = document.getElementById('engine-coeiroink') as HTMLButtonElement;
  const tabChrome = document.getElementById('engine-chrome') as HTMLButtonElement;

  // スライダーの値表示
  speedInput.addEventListener('input', () => { speedVal.textContent = Number(speedInput.value).toFixed(1); });
  volumeInput.addEventListener('input', () => { volumeVal.textContent = Number(volumeInput.value).toFixed(1); });
  pitchInput.addEventListener('input', () => { pitchVal.textContent = Number(pitchInput.value).toFixed(2); });
  intonationInput.addEventListener('input', () => { intonationVal.textContent = Number(intonationInput.value).toFixed(1); });

  // 設定を読み込む
  const settings = await loadSettings();
  speedInput.value = String(settings.speedScale);
  speedVal.textContent = settings.speedScale.toFixed(1);
  volumeInput.value = String(settings.volumeScale);
  volumeVal.textContent = settings.volumeScale.toFixed(1);
  pitchInput.value = String(settings.pitchScale);
  pitchVal.textContent = settings.pitchScale.toFixed(2);
  intonationInput.value = String(settings.intonationScale);
  intonationVal.textContent = settings.intonationScale.toFixed(1);
  // 現在のエンジンを判定
  const savedEngine: Engine = settings.speakerUuid.startsWith(CHROME_TTS_PREFIX) ? 'chrome' : 'coeiroink';
  let currentEngine: Engine = savedEngine;

  // COEIROINK話者一覧・Chrome TTS音声一覧を並行取得
  const [speakers, chromeTtsVoices] = await Promise.all([
    fetchCoeiroinkSpeakers(connectionEl),
    getChromeTtsVoices(),
  ]);

  // エンジン切り替え処理
  const switchEngine = (engine: Engine) => {
    currentEngine = engine;
    tabCoeiroink.classList.toggle('active', engine === 'coeiroink');
    tabChrome.classList.toggle('active', engine === 'chrome');

    if (engine === 'coeiroink') {
      connectionEl.style.display = '';
      styleSection.classList.remove('hidden');
      intonationSection.classList.remove('hidden');
      renderCoeiroinkSpeakers(speakers, speakerSel);
      updateStyles(speakerSel.value);
    } else {
      connectionEl.style.display = 'none';
      styleSection.classList.add('hidden');
      intonationSection.classList.add('hidden');
      renderChromeTtsSpeakers(chromeTtsVoices, speakerSel);
    }
  };

  tabCoeiroink.addEventListener('click', () => switchEngine('coeiroink'));
  tabChrome.addEventListener('click', () => switchEngine('chrome'));

  // 話者変更時にCOEIROINKのスタイル一覧を更新
  speakerSel.addEventListener('change', () => {
    if (currentEngine === 'coeiroink') {
      updateStyles(speakerSel.value);
    }
  });

  const updateStyles = (speakerUuid: string) => {
    styleSel.innerHTML = '';
    const speaker = speakers.find((s) => s.speakerUuid === speakerUuid);
    if (speaker) {
      speaker.styles.forEach((st) => {
        styleSel.add(new Option(st.styleName, String(st.styleId)));
      });
    } else {
      styleSel.add(new Option('-', '0'));
    }
  };

  // 初期エンジンで表示（保存済み設定を復元）
  switchEngine(savedEngine);

  // 保存済み話者を選択
  if (settings.speakerUuid) {
    speakerSel.value = settings.speakerUuid;
    if (savedEngine === 'coeiroink') {
      updateStyles(settings.speakerUuid);
      styleSel.value = String(settings.styleId);
    }
  }

  // 設定保存
  saveBtn.addEventListener('click', async () => {
    const speakerUuid = speakerSel.value;
    const styleId = currentEngine === 'coeiroink' ? Number(styleSel.value) || 0 : 0;

    await saveSettings({
      speakerUuid,
      styleId,
      speedScale: Number(speedInput.value),
      volumeScale: Number(volumeInput.value),
      pitchScale: Number(pitchInput.value),
      intonationScale: Number(intonationInput.value),
      prePhonemeLength: settings.prePhonemeLength,
      postPhonemeLength: settings.postPhonemeLength,
      outputSamplingRate: settings.outputSamplingRate,
      clickToSeek: settings.clickToSeek,
      autoNextChapter: settings.autoNextChapter,
      autoScroll: settings.autoScroll,
    });

    saveStatus.textContent = '保存しました ✓';
    saveStatus.classList.add('visible');
    setTimeout(() => saveStatus.classList.remove('visible'), 2000);
  });
}

function renderCoeiroinkSpeakers(speakers: Speaker[], sel: HTMLSelectElement) {
  sel.innerHTML = '';
  if (speakers.length === 0) {
    sel.add(new Option('話者なし（COEIROINKを起動してください）', ''));
    return;
  }
  speakers.forEach((s) => sel.add(new Option(s.speakerName, s.speakerUuid)));
}

function renderChromeTtsSpeakers(voices: SpeechSynthesisVoice[], sel: HTMLSelectElement) {
  sel.innerHTML = '';
  if (voices.length === 0) {
    sel.add(new Option('音声なし', ''));
    return;
  }
  voices.forEach((v) => {
    const label = v.lang ? `${v.name} (${v.lang})` : v.name;
    sel.add(new Option(label, `${CHROME_TTS_PREFIX}${v.name}`));
  });
}

async function fetchCoeiroinkSpeakers(statusEl: HTMLElement): Promise<Speaker[]> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SPEAKERS' });
    if (response.error) throw new Error(response.error);
    statusEl.textContent = '接続中 ✓';
    statusEl.className = 'status-badge connected';
    return response.speakers as Speaker[];
  } catch {
    statusEl.textContent = '未接続';
    statusEl.className = 'status-badge disconnected';
    return [];
  }
}

function getChromeTtsVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(sortVoices(voices));
    } else {
      speechSynthesis.onvoiceschanged = () => resolve(sortVoices(speechSynthesis.getVoices()));
      setTimeout(() => resolve(sortVoices(speechSynthesis.getVoices())), 500);
    }
  });
}

function sortVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const ja = voices.filter((v) => v.lang.startsWith('ja'));
  const others = voices.filter((v) => !v.lang.startsWith('ja'));
  return [...ja, ...others];
}

init().catch(console.error);
