# 小説読み上げ（COEIROINK / VOICEVOX連携）

Web 小説サイトのテキストを COEIROINK・VOICEVOX・Chrome TTS で音声読み上げする Chrome 拡張機能。

## 対応サイト

| サイト | URL |
|---|---|
| ハーメルン | syosetu.org |
| カクヨム | kakuyomu.jp |
| 小説家になろう | ncode.syosetu.com |
| ノクターンノベルズ | novel18.syosetu.com |
| アルファポリス | www.alphapolis.co.jp |

## 機能

- **COEIROINK 連携** — ローカルで動作する COEIROINK（localhost:50032）の TTS API を使って高品質な音声合成
- **VOICEVOX 連携** — ローカルで動作する VOICEVOX（localhost:50021）にも対応。話者数が多く、役割別の声を割り当てやすい
- **Chrome TTS フォールバック** — エンジンを入れたくない場合はブラウザ内蔵 TTS でも動作
- **フローティング UI** — ページ右下に操作パネルを表示
  - ▶ 再生 / ⏸ 一時停止・再開 / ⏹ 停止
  - ⏪ 前の段落 / ⏩ 次の段落
  - ⏮ 前話 / ⏭ 次話
  - 進捗バー・段落カウント表示
- **ハイライト** — 現在読み上げ中の段落をハイライト
- **設定パネル**（⚙ ボタン）
  - 本文クリックでその段落からシーク
  - 最終段落まで読み終えたら自動で次話へ移動
  - 読んでいる箇所への自動スクロール ON/OFF
  - 速度リアルタイム調整
- **ポップアップ設定** — 話者・スタイル・速度・音量・ピッチ・抑揚の変更

## 必要なもの

- Google Chrome
- 音声合成エンジン（いずれか。Chrome TTS を使う場合は不要）
  - [COEIROINK](https://coeiroink.com/)（ローカル起動、ポート 50032）
  - [VOICEVOX](https://voicevox.hiroshiba.jp/)（ローカル起動、ポート 50021）

どちらも無償で、生成した音声を配布しない範囲（自分で聞くだけの読み上げ）ならクレジット表記も不要。

## インストール

```bash
npm install
npm run build
```

1. Chrome で `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」を ON にする
3. 「パッケージ化されていない拡張機能を読み込む」→ `dist/` フォルダを選択

## 使い方

1. COEIROINK または VOICEVOX を起動する
2. 拡張アイコンをクリックしてポップアップを開き、エンジンのタブを選んで話者を選択し「設定を保存」
3. 対応サイトの小説本文ページを開く
4. 右下にフローティング UI が表示されるので ▶ ボタンで読み上げ開始

VOICEVOX が「未接続」のままの場合、エンジン側が拡張機能からのアクセスを拒否している可能性がある。
その際は VOICEVOX ENGINE を `--allow_origin chrome-extension://<拡張機能ID>` を付けて起動する。

## 開発

```bash
npm run dev     # popup / service-worker をウォッチビルド
npm run build   # 本番ビルド（dist/ 出力）
```

### ファイル構成

```
src/
├── background/service-worker.ts   # 合成エンジン API プロキシ（話者一覧のキャッシュ・合成の振り分け）
├── content/
│   ├── index.ts                   # コンテントスクリプト本体
│   ├── floating-ui.ts             # フローティング操作パネル（Shadow DOM）
│   └── highlighter.ts             # 段落ハイライト
├── popup/popup.ts                 # 拡張アイコンクリック時の設定 UI
├── adapters/
│   ├── adapter-interface.ts       # INovelAdapter インターフェース
│   ├── adapter-registry.ts        # アダプター登録・URL マッチング
│   ├── hameln.ts                  # ハーメルン
│   ├── kakuyomu.ts                # カクヨム
│   ├── narou.ts                   # 小説家になろう / ノクターンノベルズ
│   └── alphapolis.ts              # アルファポリス
├── audio/
│   ├── audio-queue.ts             # 再生キュー・先読みバッファリング
│   ├── audio-player.ts            # Web Audio API ラッパー
│   └── chrome-tts.ts              # Chrome TTS ラッパー
├── api/
│   ├── tts-engine.ts              # エンジン定義と話者UUIDからの振り分け
│   ├── synthesis-util.ts          # テキスト整形・分割・WAV結合・リトライ（エンジン共通）
│   ├── coeiroink.ts               # COEIROINK REST API クライアント
│   └── voicevox.ts                # VOICEVOX REST API クライアント
├── storage/settings.ts            # chrome.storage.local ラッパー
└── types/                         # 型定義
```

### 新しい合成エンジンへの対応方法

1. `src/api/{エンジン名}.ts` に `fetchSpeakers()` と `synthesize()` を実装する
   - テキストの整形・分割・WAV 結合は `synthesizeChunked()` に任せる
   - 話者 UUID には他エンジンと衝突しない接頭辞を付ける（COEIROINK は互換性のため接頭辞なし）
2. `src/api/tts-engine.ts` の `ENGINES` と `engineIdFor()` に追加する
3. `public/manifest.json` の `host_permissions` にエンジンの URL を追加する
4. `popup/index.html` にエンジンタブのボタンを追加し、`src/popup/popup.ts` の `tabs` に登録する

### 新しいサイトへの対応方法

1. `src/adapters/{サイト名}.ts` を作成して `INovelAdapter` を実装
   - 本文が動的ロードされるサイトは `waitForContent()` を実装する
2. `src/adapters/adapter-registry.ts` の `adapters[]` に追加
3. `public/manifest.json` の `content_scripts.matches` と `web_accessible_resources.matches` に URL パターンを追加
