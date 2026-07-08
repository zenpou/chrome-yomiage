import type { Paragraph, ParagraphRole } from '../adapters/adapter-interface';

type Kind = 'dialogue' | 'monologue' | 'narration';

/** 段落先頭の文字で種別を判定する。「」『』=会話、（）=心の声、それ以外=地の文 */
function detectKind(text: string): Kind {
  const first = text.replace(/^[\s　]+/, '').charAt(0);
  if (first === '「' || first === '『') return 'dialogue';
  if (first === '（' || first === '(') return 'monologue';
  return 'narration';
}

/**
 * 各段落に役割を付与する。
 * 会話文が連続する間は 会話1→会話2→会話1→… と交互に割り当て、
 * 地の文・心の声を挟んだら次の会話文は会話1に戻る。
 */
export function assignRoles(paragraphs: Paragraph[]): void {
  let nextDialogue: ParagraphRole = 'dialogue1';
  for (const p of paragraphs) {
    const kind = detectKind(p.text);
    if (kind === 'dialogue') {
      p.role = nextDialogue;
      nextDialogue = nextDialogue === 'dialogue1' ? 'dialogue2' : 'dialogue1';
    } else {
      p.role = kind;
      nextDialogue = 'dialogue1';
    }
  }
}
