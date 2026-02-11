import { defineConfig } from 'vite';
import { resolve } from 'path';

// コンテントスクリプト専用ビルド設定
// Chrome拡張のcontent_scriptsはimport文が使えないため、
// IIFE形式（自己完結バンドル）で出力する
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        'content/index': resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        format: 'iife',
        entryFileNames: '[name].js',
        // IIFEはchunk分割不可のため全モジュールをインライン化
        inlineDynamicImports: false,
      },
    },
    outDir: 'dist',
    emptyOutDir: false, // メインビルドのファイルを消さない
    target: 'esnext',
    minify: false,
  },
  publicDir: false, // publicはメインビルドでコピー済みのため不要
});
