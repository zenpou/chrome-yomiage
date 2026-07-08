/** 段落の役割（声の切り替え単位） */
export type ParagraphRole = 'narration' | 'dialogue1' | 'dialogue2' | 'monologue';

export interface Paragraph {
  text: string;
  element: Element | null;
  index: number;
  /** voice-classifier が付与する。未付与なら地の文扱い */
  role?: ParagraphRole;
}

export interface INovelAdapter {
  readonly siteName: string;
  matches(url: string): boolean;
  isNovelPage(): boolean;
  /** 本文が動的ロードされるサイト向け。準備完了まで待機する（省略可） */
  waitForContent?(): Promise<void>;
  extractParagraphs(): Paragraph[];
  getContainerElement(): Element;
  getPrevChapterUrl(): string | null;
  getNextChapterUrl(): string | null;
}
