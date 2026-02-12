import type { INovelAdapter } from './adapter-interface';
import { HamelnAdapter } from './hameln';
import { KakuyomuAdapter } from './kakuyomu';
import { NarouAdapter } from './narou';
import { AlphapolisAdapter } from './alphapolis';

// 新しいサイトに対応する際はここにimportして追加するだけ
const adapters: INovelAdapter[] = [
  new HamelnAdapter(),
  new KakuyomuAdapter(),
  new NarouAdapter(),
  new AlphapolisAdapter(),
];

export function detectAdapter(url: string): INovelAdapter | null {
  return adapters.find((a) => a.matches(url)) ?? null;
}
