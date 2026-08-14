import './popup.css';
import { loadSettings, saveSettings } from '../storage/settings';
import { CHROME_TTS_PREFIX } from '../audio/chrome-tts';
import { ENGINES, ENGINE_IDS, engineIdFor, type EngineId } from '../api/tts-engine';
import type { Speaker } from '../types/coeiroink';
import type { RoleVoice } from '../types/settings';

/** Chrome TTS は合成サーバーを持たないので EngineId とは別枠 */
type Engine = EngineId | 'chrome';

type ConnectionState = 'connected' | 'disconnected';

/**
 * 話者UUIDから表示するタブを決める。
 * 未設定のときは、インストール不要で必ず動く Chrome TTS を初期表示にする。
 * （合成時の振り分けは engineIdFor 側の既定＝COEIROINK のままで、既存設定との互換を保つ）
 */
function engineOf(speakerUuid: string): Engine {
  if (!speakerUuid || speakerUuid.startsWith(CHROME_TTS_PREFIX)) return 'chrome';
  return engineIdFor(speakerUuid);
}

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
  const roleVoicesSection = document.getElementById('role-voices-section')!;

  const tabs: Record<Engine, HTMLButtonElement> = {
    coeiroink: document.getElementById('engine-coeiroink') as HTMLButtonElement,
    voicevox: document.getElementById('engine-voicevox') as HTMLButtonElement,
    chrome: document.getElementById('engine-chrome') as HTMLButtonElement,
  };

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
  const savedEngine = engineOf(settings.speakerUuid);
  let currentEngine: Engine = savedEngine;

  // 各エンジンの話者一覧を並行取得（起動していないエンジンは空配列になる）
  const speakersByEngine = {} as Record<EngineId, Speaker[]>;
  const connectionByEngine = {} as Record<EngineId, ConnectionState>;
  const [, chromeTtsVoices] = await Promise.all([
    Promise.all(ENGINE_IDS.map(async (id) => {
      const { speakers, connected } = await fetchEngineSpeakers(id);
      speakersByEngine[id] = speakers;
      connectionByEngine[id] = connected ? 'connected' : 'disconnected';
    })),
    getChromeTtsVoices(),
  ]);

  /** 現在のエンジンの話者一覧（Chrome TTS のときは空） */
  const speakersOf = (engine: Engine): Speaker[] =>
    engine === 'chrome' ? [] : speakersByEngine[engine];

  const updateStyles = (engine: Engine, speakerUuid: string, selectedStyleId?: number) => {
    styleSel.innerHTML = '';
    const speaker = speakersOf(engine).find((s) => s.speakerUuid === speakerUuid);
    if (!speaker) {
      styleSel.add(new Option('-', '0'));
      return;
    }
    speaker.styles.forEach((st) => {
      styleSel.add(new Option(st.styleName, String(st.styleId)));
    });
    if (selectedStyleId !== undefined) styleSel.value = String(selectedStyleId);
  };

  // 役割別音声（会話文1/会話文2/心の声）のセレクト
  const roleSelects = ([
    { key: 'dialogue1Voice', speakerId: 'role-d1-speaker', styleId: 'role-d1-style', fallbackLabel: '全般と同じ' },
    { key: 'dialogue2Voice', speakerId: 'role-d2-speaker', styleId: 'role-d2-style', fallbackLabel: '会話文1と同じ' },
    { key: 'monologueVoice', speakerId: 'role-mono-speaker', styleId: 'role-mono-style', fallbackLabel: '全般と同じ' },
  ] as const).map((def) => ({
    key: def.key,
    speakerSel: document.getElementById(def.speakerId) as HTMLSelectElement,
    styleSel: document.getElementById(def.styleId) as HTMLSelectElement,
    fallbackLabel: def.fallbackLabel,
  }));

  const updateRoleStyles = (
    engine: Engine,
    sel: HTMLSelectElement,
    roleStyleSel: HTMLSelectElement,
    selectedStyleId?: number,
  ) => {
    roleStyleSel.innerHTML = '';
    const speaker = speakersOf(engine).find((s) => s.speakerUuid === sel.value);
    if (!speaker) {
      roleStyleSel.add(new Option('-', '0'));
      roleStyleSel.disabled = true;
      return;
    }
    roleStyleSel.disabled = false;
    speaker.styles.forEach((st) => {
      roleStyleSel.add(new Option(st.styleName, String(st.styleId)));
    });
    if (selectedStyleId !== undefined) roleStyleSel.value = String(selectedStyleId);
  };

  const renderRoleVoices = (engine: Engine) => {
    roleSelects.forEach(({ key, speakerSel: sel, styleSel: roleStyleSel, fallbackLabel }) => {
      sel.innerHTML = '';
      sel.add(new Option(fallbackLabel, ''));
      speakersOf(engine).forEach((s) => sel.add(new Option(s.speakerName, s.speakerUuid)));
      // 保存済みの役割別音声は、同じエンジンの話者のときだけ復元する
      const saved = settings[key];
      const restorable = !!saved?.speakerUuid && engineOf(saved.speakerUuid) === engine;
      if (restorable) sel.value = saved!.speakerUuid;
      updateRoleStyles(engine, sel, roleStyleSel, restorable ? saved!.styleId : undefined);
    });
  };

  roleSelects.forEach(({ speakerSel: sel, styleSel: roleStyleSel }) => {
    sel.addEventListener('change', () => updateRoleStyles(currentEngine, sel, roleStyleSel));
  });

  // エンジン切り替え処理
  const switchEngine = (engine: Engine) => {
    currentEngine = engine;
    (Object.keys(tabs) as Engine[]).forEach((id) => {
      tabs[id].classList.toggle('active', id === engine);
    });

    if (engine === 'chrome') {
      connectionEl.style.display = 'none';
      styleSection.classList.add('hidden');
      intonationSection.classList.add('hidden');
      roleVoicesSection.classList.add('hidden');
      renderChromeTtsSpeakers(chromeTtsVoices, speakerSel);
    } else {
      connectionEl.style.display = '';
      setConnectionBadge(connectionEl, engine, connectionByEngine[engine]);
      styleSection.classList.remove('hidden');
      intonationSection.classList.remove('hidden');
      roleVoicesSection.classList.remove('hidden');
      renderSpeakers(speakersOf(engine), ENGINES[engine].label, speakerSel);
      renderRoleVoices(engine);
    }

    // 保存済みのエンジンに戻ってきたときだけ、保存された話者・スタイルを復元する
    const savedSpeaker = engineOf(settings.speakerUuid) === engine ? settings.speakerUuid : '';
    if (savedSpeaker) speakerSel.value = savedSpeaker;
    if (engine !== 'chrome') {
      updateStyles(engine, speakerSel.value, savedSpeaker ? settings.styleId : undefined);
    }
  };

  (Object.keys(tabs) as Engine[]).forEach((id) => {
    tabs[id].addEventListener('click', () => switchEngine(id));
  });

  // 話者変更時にスタイル一覧を更新
  speakerSel.addEventListener('change', () => {
    if (currentEngine !== 'chrome') updateStyles(currentEngine, speakerSel.value);
  });

  switchEngine(savedEngine);

  // 設定保存
  saveBtn.addEventListener('click', async () => {
    const speakerUuid = speakerSel.value;
    const styleId = currentEngine === 'chrome' ? 0 : Number(styleSel.value) || 0;

    // 役割別音声を読み取る（Chrome TTSは非対応。話者一覧を取得できない時は保存済み設定を維持）
    const readRoleVoice = (i: number, saved: RoleVoice | null): RoleVoice | null => {
      if (currentEngine === 'chrome' || speakersOf(currentEngine).length === 0) return saved;
      const { speakerSel: sel, styleSel: roleStyleSel } = roleSelects[i];
      return sel.value ? { speakerUuid: sel.value, styleId: Number(roleStyleSel.value) || 0 } : null;
    };

    await saveSettings({
      dialogue1Voice: readRoleVoice(0, settings.dialogue1Voice),
      dialogue2Voice: readRoleVoice(1, settings.dialogue2Voice),
      monologueVoice: readRoleVoice(2, settings.monologueVoice),
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

function setConnectionBadge(el: HTMLElement, engine: EngineId, state: ConnectionState) {
  if (state === 'connected') {
    el.textContent = '接続中 ✓';
    el.className = 'status-badge connected';
  } else {
    el.textContent = `${ENGINES[engine].label} 未接続`;
    el.className = 'status-badge disconnected';
  }
}

function renderSpeakers(speakers: Speaker[], engineLabel: string, sel: HTMLSelectElement) {
  sel.innerHTML = '';
  if (speakers.length === 0) {
    sel.add(new Option(`話者なし（${engineLabel}を起動してください）`, ''));
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

async function fetchEngineSpeakers(
  engine: EngineId,
): Promise<{ speakers: Speaker[]; connected: boolean }> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SPEAKERS', engine });
    if (response.error) throw new Error(response.error);
    return { speakers: response.speakers as Speaker[], connected: true };
  } catch {
    return { speakers: [], connected: false };
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
