# 会話文ごとの声切り替え機能 設計

日付: 2026-07-07

## 目的

小説の段落を「地の文(全般)」「会話文1」「会話文2(連続時)」「心の声」に分類し、
役割ごとに別のCOEIROINK話者で読み上げる。類似アプリの
「日本語全般 / 日本語会話文1 / 日本語会話文2(連続時) / 日本語心の声」設定を再現する。

## 決定事項

- **判定単位**: 段落単位。段落先頭の文字で役割を決める(段落内分割はしない)
- **会話文の判定**: 先頭が `「` または `『`(『』は会話扱い、交互切り替えの対象)
- **心の声の判定**: 先頭が `（` または `(`
- **交互切り替え**: 会話文が連続する間は 会話1→会話2→会話1→… と交互。
  地の文・心の声を挟んだら次の会話文は会話1に戻る
- **設定範囲**: 役割ごとに話者+スタイルのみ。速度・音量・ピッチ・抑揚は全役割共通
- **エンジン**: COEIROINK専用。Chrome TTSエンジン選択時は従来どおり単一voice

## 設定モデル (`src/types/settings.ts`)

```ts
interface RoleVoice { speakerUuid: string; styleId: number; }
// UserSettings に追加(デフォルトはすべて null = 全般と同じ)
dialogue1Voice: RoleVoice | null;
dialogue2Voice: RoleVoice | null;
monologueVoice: RoleVoice | null;
```

- 既存の `speakerUuid`/`styleId` は「全般」の声としてそのまま使用(後方互換)
- フォールバック: 会話2未設定→会話1、会話1未設定→全般、心の声未設定→全般

## コンポーネント

### voice-classifier (`src/content/voice-classifier.ts`) — 新規

純関数 `assignRoles(paragraphs)`。段落配列を走査し各段落に
`role: 'narration' | 'dialogue1' | 'dialogue2' | 'monologue'` を付与する。

### AudioQueue (`src/audio/audio-queue.ts`)

- `load()` / `updateParams()` に `voiceMap`(役割→RoleVoice)を追加で渡せるようにする
- `fetchEntry()` で段落の `role` に応じて `speakerUuid`/`styleId` のみ上書き
- プリフェッチ・キャッシュ破棄は既存ロジックのまま

### コンテンツスクリプト (`src/content/index.ts`)

- 段落抽出後に `assignRoles()` を実行
- 設定から voiceMap を構築して `queue.load()` / `updateParams()` に渡す
- `storage.onChanged` でも voiceMap を再構築

### ポップアップ (`popup/index.html`, `src/popup/popup.ts`)

- COEIROINKタブ選択時のみ、会話文1 / 会話文2(連続時) / 心の声 の
  話者+スタイルのセレクトを表示。先頭オプションは「全般と同じ」(=null)

## エラー処理

役割の声の話者がCOEIROINK側に存在しない場合は合成エラーになるが、
既存の「連続3エラーで停止」で対処する(自動フォールバック再試行はYAGNIで見送り)。
