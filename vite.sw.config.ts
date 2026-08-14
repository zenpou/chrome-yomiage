import { defineConfig } from 'vite';
import { resolve } from 'path';

// Service Worker専用ビルド設定
// ポップアップと同じrollupビルドに入れると共有モジュールがchunks/へ切り出され、
// Service Workerが外部ファイルのimportに依存してしまう。
// 読み込みに失敗するとSW全体が起動しなくなるため、単体ファイルとして出力する。
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        inlineDynamicImports: true,
      },
    },
    outDir: 'dist',
    emptyOutDir: false, // ポップアップビルドの出力を消さない
    target: 'esnext',
    minify: false,
  },
  publicDir: false, // publicはポップアップビルドでコピー済み
});
