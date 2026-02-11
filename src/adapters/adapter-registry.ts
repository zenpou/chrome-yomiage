import type { INovelAdapter } from './adapter-interface';
import { HamelnAdapter } from './hameln';

// 新しいサイトに対応する際はここにimportして追加するだけ
const adapters: INovelAdapter[] = [
  new HamelnAdapter(),
  // new NarouAdapter(),
  // new KakuyomuAdapter(),
];

export function detectAdapter(url: string): INovelAdapter | null {
  return adapters.find((a) => a.matches(url)) ?? null;
}
