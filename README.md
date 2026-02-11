# 小説読み上げ（COEIROINK連携）

ハーメルン（syosetu.org）の小説ページを COEIROINK または Chrome TTS で音声読み上げする Chrome 拡張機能。

## 機能

- **COEIROINK 連携** — ローカルで動作する COEIROINK（localhost:50032）の TTS API を使って高品質な音声合成
- **Chrome TTS フォールバック** — COEIROINK が不要な場合はブラウザ内蔵 TTS でも動作
- **フローティング UI** — 読み上げ中のページ右下に操作パネルを表示
  - ▶ 再生 / ⏸ 一時停止・再開 / ⏹ 停止
  - ⏪ 前の段落 / ⏩ 次の段落
  - ⏮ 前話 / ⏭ 次話
  - 進捗バー・段落カウント表示
- **ハイライト** — 現在読み上げ中の段落をハイライト
- **設定パネル**（⚙ ボタン）
  - 本文クリックでその段落からシーク
  - 最終段落まで読み終えたら自動で次話へ移動
  - 速度リアルタイム調整
- **ポップアップ設定** — 話者・スタイル・速度・音量・ピッチ・抑揚の変更

## 必要なもの

- [COEIROINK](https://coeiroink.com/)（ローカル起動、ポート 50032）※ Chrome TTS を使う場合は不要
- Google Chrome

## インストール

```bash
npm install
npm run build
```

1. Chrome で `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」を ON にする
3. 「パッケージ化されていない拡張機能を読み込む」→ `dist/` フォルダを選択

## 使い方

1. COEIROINK を起動する
2. 拡張アイコンをクリックしてポップアップを開き、話者を選択して「設定を保存」
3. ハーメルンの小説本文ページ（例: `https://syosetu.org/novel/123456/1/`）を開く
4. 右下にフローティング UI が表示されるので ▶ ボタンで読み上げ開始

## 開発

```bash
npm run dev     # popup / service-worker をウォッチビルド
npm run build   # 本番ビルド（dist/ 出力）
```

### ファイル構成

```
src/
├── background/service-worker.ts   # COEIROINK API プロキシ
├── content/
│   ├── index.ts                   # コンテントスクリプト本体
│   ├── floating-ui.ts             # フローティング操作パネル（Shadow DOM）
│   └── highlighter.ts             # 段落ハイライト
├── popup/popup.ts                 # 拡張アイコンクリック時の設定 UI
├── adapters/
│   ├── adapter-interface.ts       # INovelAdapter インターフェース
│   ├── adapter-registry.ts        # アダプター登録・URL マッチング
│   └── hameln.ts                  # ハーメルン用アダプター
├── audio/
│   ├── audio-queue.ts             # 再生キュー・先読みバッファリング
│   └── audio-player.ts            # Web Audio API ラッパー
├── api/coeiroink.ts               # COEIROINK REST API クライアント
├── storage/settings.ts            # chrome.storage.local ラッパー
└── types/                         # 型定義
```

### 新しいサイトへの対応方法

1. `src/adapters/{サイト名}.ts` を作成して `INovelAdapter` を実装
2. `src/adapters/adapter-registry.ts` の `adapters[]` に追加
3. `public/manifest.json` の `content_scripts.matches` に URL パターンを追加
