import { detectAdapter } from '../adapters/adapter-registry';
import { AudioQueue } from '../audio/audio-queue';
import { FloatingUI } from './floating-ui';
import { Highlighter } from './highlighter';
import { loadSettings, isExtensionContextValid } from '../storage/settings';

async function main() {
  const AUTOPLAY_KEY = 'yomiage-autoplay';

  const adapter = detectAdapter(location.href);
  if (!adapter) return;
  if (!adapter.isNovelPage()) return;

  // 動的ロードが必要なサイトはコンテンツ準備を待つ
  if (adapter.waitForContent) {
    await adapter.waitForContent();
  }

  const paragraphs = adapter.extractParagraphs();
  if (paragraphs.length === 0) return;

  const settings = await loadSettings();
  const queue = new AudioQueue();
  const ui = new FloatingUI();
  const highlighter = new Highlighter();

  // 前話・次話URLを取得してボタン状態を設定
  const prevChapterUrl = adapter.getPrevChapterUrl();
  const nextChapterUrl = adapter.getNextChapterUrl();

  highlighter.inject();
  ui.mount();
  ui.setChapterNav(prevChapterUrl !== null, nextChapterUrl !== null);
  ui.setClickToSeek(settings.clickToSeek);
  ui.setAutoNextChapter(settings.autoNextChapter);
  ui.setAutoScroll(settings.autoScroll);
  ui.setSpeed(settings.speedScale);

  let autoNextChapter = settings.autoNextChapter;
  highlighter.autoScroll = settings.autoScroll;

  let synthesizeParams = {
    speakerUuid: settings.speakerUuid,
    styleId: settings.styleId,
    speedScale: settings.speedScale,
    volumeScale: settings.volumeScale,
    pitchScale: settings.pitchScale,
    intonationScale: settings.intonationScale,
    prePhonemeLength: settings.prePhonemeLength,
    postPhonemeLength: settings.postPhonemeLength,
    outputSamplingRate: settings.outputSamplingRate,
  };

  queue.load(paragraphs, synthesizeParams);

  // 再生コールバック
  queue.onParagraphStart = (p) => {
    highlighter.highlight(p.element);
    ui.updateProgress(p.index + 1, paragraphs.length);
  };

  queue.onParagraphEnd = (_p) => {
    // ハイライトは次のonParagraphStartでクリアされる
  };

  queue.onQueueEnd = () => {
    highlighter.clearAll();
    if (autoNextChapter && nextChapterUrl) {
      sessionStorage.setItem(AUTOPLAY_KEY, '1');
      location.href = nextChapterUrl;
      return;
    }
    ui.setState('idle');
  };

  queue.onStateChange = (state) => {
    ui.setState(state);
  };

  queue.onError = (p, err) => {
    console.error(`[yomiage] 段落${p.index}の音声生成エラー:`, err);
    if (err.message?.includes('Failed to fetch')) {
      ui.showError('COEIROINKに接続できません');
    } else {
      ui.showError(err.message);
    }
  };

  // UIボタンのイベント
  ui.onPlay = () => {
    if (queue.state === 'paused') {
      queue.resume();
      return;
    }
    if (queue.state === 'idle') {
      // 最初から再生（設定を最新から取得）
      loadSettings().then(async (latestSettings) => {
        let { speakerUuid, styleId } = latestSettings;

        // 話者未設定の場合、COEIROINKから最初の話者を自動取得
        if (!speakerUuid) {
          try {
            const res = await chrome.runtime.sendMessage({ type: 'GET_SPEAKERS' });
            if (!res.error && res.speakers?.length > 0) {
              speakerUuid = res.speakers[0].speakerUuid;
              styleId = res.speakers[0].styles[0]?.styleId ?? 0;
              ui.showInfo(`話者未設定のため「${res.speakers[0].speakerName}」で読み上げます`);
            } else {
              ui.showError('話者を取得できません。拡張アイコンから設定してください');
              ui.setState('idle');
              return;
            }
          } catch {
            ui.showError('COEIROINKに接続できません');
            ui.setState('idle');
            return;
          }
        }

        synthesizeParams = {
          speakerUuid,
          styleId,
          speedScale: latestSettings.speedScale,
          volumeScale: latestSettings.volumeScale,
          pitchScale: latestSettings.pitchScale,
          intonationScale: latestSettings.intonationScale,
          prePhonemeLength: latestSettings.prePhonemeLength,
          postPhonemeLength: latestSettings.postPhonemeLength,
          outputSamplingRate: latestSettings.outputSamplingRate,
        };
        queue.updateParams(synthesizeParams);
        queue.play().catch((err) => {
          console.error('[yomiage] 再生エラー:', err);
          ui.showError(err.message);
          ui.setState('idle');
        });
      });
    }
  };

  ui.onPause = () => {
    if (queue.state === 'playing') {
      queue.pause();
    } else if (queue.state === 'paused') {
      queue.resume();
    }
  };

  ui.onStop = () => {
    queue.stop();
    highlighter.clearAll();
  };

  ui.onPrevParagraph = () => {
    const wasPlaying = queue.state === 'playing' || queue.state === 'paused';
    queue.seekTo(queue.index - 1);
    highlighter.clearAll();
    if (wasPlaying) {
      queue.play().catch((err) => {
        console.error('[yomiage] 再生エラー:', err);
        ui.showError(err.message);
        ui.setState('idle');
      });
    }
  };

  ui.onNextParagraph = () => {
    const wasPlaying = queue.state === 'playing' || queue.state === 'paused';
    queue.seekTo(queue.index + 1);
    highlighter.clearAll();
    if (wasPlaying) {
      queue.play().catch((err) => {
        console.error('[yomiage] 再生エラー:', err);
        ui.showError(err.message);
        ui.setState('idle');
      });
    }
  };

  ui.onPrevChapter = () => {
    if (prevChapterUrl) {
      if (queue.state === 'playing' || queue.state === 'loading') {
        sessionStorage.setItem(AUTOPLAY_KEY, '1');
      }
      location.href = prevChapterUrl;
    }
  };

  ui.onNextChapter = () => {
    if (nextChapterUrl) {
      if (queue.state === 'playing' || queue.state === 'loading') {
        sessionStorage.setItem(AUTOPLAY_KEY, '1');
      }
      location.href = nextChapterUrl;
    }
  };

  // 章移動後の自動再生
  if (sessionStorage.getItem(AUTOPLAY_KEY)) {
    sessionStorage.removeItem(AUTOPLAY_KEY);
    ui.onPlay?.();
  }

  // 段落クリックでシーク
  const paragraphClickHandlers = new Map<Element, (e: MouseEvent) => void>();

  const applyClickToSeek = (enabled: boolean) => {
    if (enabled) {
      paragraphs.forEach((p) => {
        if (!p.element || paragraphClickHandlers.has(p.element)) return;
        const handler = (e: MouseEvent) => {
          // テキスト選択中はシーク動作をしない
          if (window.getSelection()?.toString()) return;
          e.preventDefault();
          queue.seekTo(p.index);
          highlighter.clearAll();
          queue.play().catch((err) => {
            console.error('[yomiage] 再生エラー:', err);
            ui.showError(err.message);
            ui.setState('idle');
          });
        };
        p.element.addEventListener('click', handler);
        paragraphClickHandlers.set(p.element, handler);
        (p.element as HTMLElement).style.cursor = 'pointer';
      });
    } else {
      paragraphClickHandlers.forEach((handler, el) => {
        el.removeEventListener('click', handler);
        (el as HTMLElement).style.cursor = '';
      });
      paragraphClickHandlers.clear();
    }
  };

  applyClickToSeek(settings.clickToSeek);

  const saveSetting = (patch: Record<string, unknown>) => {
    if (!isExtensionContextValid()) return;
    loadSettings().then((s) => {
      if (!isExtensionContextValid()) return;
      chrome.storage.local.set({ settings: { ...s, ...patch } });
    });
  };

  ui.onClickToSeekChange = (enabled) => {
    applyClickToSeek(enabled);
    saveSetting({ clickToSeek: enabled });
  };

  ui.onAutoNextChapterChange = (enabled) => {
    autoNextChapter = enabled;
    saveSetting({ autoNextChapter: enabled });
  };

  ui.onAutoScrollChange = (enabled) => {
    highlighter.autoScroll = enabled;
    saveSetting({ autoScroll: enabled });
  };

  ui.onSpeedChange = (speed) => {
    synthesizeParams = { ...synthesizeParams, speedScale: speed };
    queue.updateParams(synthesizeParams);
    saveSetting({ speedScale: speed });
  };

  // ポップアップで設定変更された場合はパラメータを更新
  if (isExtensionContextValid()) chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings?.newValue) {
      const s = changes.settings.newValue;
      queue.updateParams({
        speakerUuid: s.speakerUuid,
        styleId: s.styleId,
        speedScale: s.speedScale,
        volumeScale: s.volumeScale,
        pitchScale: s.pitchScale,
        intonationScale: s.intonationScale,
        prePhonemeLength: s.prePhonemeLength,
        postPhonemeLength: s.postPhonemeLength,
        outputSamplingRate: s.outputSamplingRate,
      });
      applyClickToSeek(s.clickToSeek ?? false);
      ui.setClickToSeek(s.clickToSeek ?? false);
      autoNextChapter = s.autoNextChapter ?? false;
      ui.setAutoNextChapter(s.autoNextChapter ?? false);
      highlighter.autoScroll = s.autoScroll ?? true;
      ui.setAutoScroll(s.autoScroll ?? true);
      ui.setSpeed(s.speedScale);
    }
  });
}

main().catch(console.error);
