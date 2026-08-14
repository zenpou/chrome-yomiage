import { describe, it, expect } from 'vitest';
import type { Paragraph } from '../adapters/adapter-interface';
import { assignRoles } from './voice-classifier';

/** テキスト配列から段落配列を作る */
function paragraphs(...texts: string[]): Paragraph[] {
  return texts.map((text, index) => ({ text, element: null, index }));
}

/** assignRoles を適用して role だけ取り出す */
function rolesOf(...texts: string[]): (string | undefined)[] {
  const ps = paragraphs(...texts);
  assignRoles(ps);
  return ps.map((p) => p.role);
}

describe('assignRoles', () => {
  it('段落先頭の文字で種別を判定する', () => {
    expect(rolesOf('普通の地の文。')).toEqual(['narration']);
    expect(rolesOf('「かぎ括弧の会話」')).toEqual(['dialogue1']);
    expect(rolesOf('『二重かぎ括弧も会話』')).toEqual(['dialogue1']);
    expect(rolesOf('（全角括弧は心の声）')).toEqual(['monologue']);
    expect(rolesOf('(半角括弧も心の声)')).toEqual(['monologue']);
  });

  it('会話文が連続する間は 会話1→会話2→会話1 と交互に割り当てる', () => {
    expect(rolesOf('「一つ目」', '「二つ目」', '「三つ目」', '「四つ目」')).toEqual([
      'dialogue1',
      'dialogue2',
      'dialogue1',
      'dialogue2',
    ]);
  });

  it('「」と『』が混在しても会話として交互に扱う', () => {
    expect(rolesOf('「一つ目」', '『二つ目』', '「三つ目」')).toEqual([
      'dialogue1',
      'dialogue2',
      'dialogue1',
    ]);
  });

  it('地の文を挟むと次の会話文は会話1に戻る', () => {
    expect(rolesOf('「一つ目」', '地の文。', '「二つ目」')).toEqual([
      'dialogue1',
      'narration',
      'dialogue1',
    ]);
  });

  it('心の声を挟んでも次の会話文は会話1に戻る', () => {
    expect(rolesOf('「一つ目」', '（心の声）', '「二つ目」')).toEqual([
      'dialogue1',
      'monologue',
      'dialogue1',
    ]);
  });

  it('先頭の空白（半角・全角）を無視して判定する', () => {
    expect(rolesOf('　「全角空白のあとの会話」')).toEqual(['dialogue1']);
    expect(rolesOf('  「半角空白のあとの会話」')).toEqual(['dialogue1']);
    expect(rolesOf(' 　（空白混在のあとの心の声）')).toEqual(['monologue']);
  });

  it('空文字列の段落は地の文として扱う', () => {
    expect(rolesOf('')).toEqual(['narration']);
    expect(rolesOf('   ')).toEqual(['narration']);
  });

  it('空文字列を挟んでも会話の連続はリセットされる', () => {
    expect(rolesOf('「一つ目」', '', '「二つ目」')).toEqual([
      'dialogue1',
      'narration',
      'dialogue1',
    ]);
  });

  it('空配列を渡しても例外にならない', () => {
    const ps: Paragraph[] = [];
    expect(() => assignRoles(ps)).not.toThrow();
    expect(ps).toEqual([]);
  });
});
