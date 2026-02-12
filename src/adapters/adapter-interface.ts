export interface Paragraph {
  text: string;
  element: Element | null;
  index: number;
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
