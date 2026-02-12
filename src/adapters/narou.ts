import type { INovelAdapter, Paragraph } from './adapter-interface';

export class NarouAdapter implements INovelAdapter {
  readonly siteName = '小説家になろう';

  matches(url: string): boolean {
    return /^https:\/\/(ncode|novel18)\.syosetu\.com\//.test(url);
  }

  isNovelPage(): boolean {
    // 本文コンテナが存在するエピソードページのみ対象
    return document.querySelector('div.js-novel-text') !== null;
  }

  extractParagraphs(): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    let index = 0;

    // 話タイトル
    const titleEl = document.querySelector<HTMLElement>('h1.p-novel__title');
    if (titleEl) {
      const text = this.extractText(titleEl);
      if (text.length > 0) {
        paragraphs.push({ text, element: titleEl, index: index++ });
      }
    }

    // 本文段落（<br>のみの空行を除外）
    const body = document.querySelector('div.js-novel-text');
    if (!body) return paragraphs;

    body.querySelectorAll('p').forEach((el) => {
      const text = this.extractText(el);
      if (text.length === 0) return;
      paragraphs.push({ text, element: el, index: index++ });
    });

    return paragraphs;
  }

  getContainerElement(): Element {
    return document.querySelector('div.js-novel-text') ?? document.body;
  }

  getPrevChapterUrl(): string | null {
    const link = document.querySelector<HTMLAnchorElement>('a.c-pager__item--prev');
    return link?.href ?? null;
  }

  getNextChapterUrl(): string | null {
    const link = document.querySelector<HTMLAnchorElement>('a.c-pager__item--next');
    return link?.href ?? null;
  }

  private extractText(el: Element): string {
    // ルビ（rp, rt）を除いたテキストを取得
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('rp, rt').forEach((node) => node.remove());
    return clone.textContent?.trim() ?? '';
  }
}
