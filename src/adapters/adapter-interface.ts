export interface Paragraph {
  text: string;
  element: Element | null;
  index: number;
}

export interface INovelAdapter {
  readonly siteName: string;
  matches(url: string): boolean;
  isNovelPage(): boolean;
  extractParagraphs(): Paragraph[];
  getContainerElement(): Element;
  getPrevChapterUrl(): string | null;
  getNextChapterUrl(): string | null;
}
