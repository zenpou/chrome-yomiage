import type { INovelAdapter, Paragraph } from './adapter-interface';

export class KakuyomuAdapter implements INovelAdapter {
  readonly siteName = 'カクヨム';

  matches(url: string): boolean {
    return url.startsWith('https://kakuyomu.jp/');
  }

  isNovelPage(): boolean {
    // エピソードページのみ対象（/works/XXX/episodes/YYY）
    return /\/works\/\d+\/episodes\/\d+/.test(location.pathname) &&
      document.querySelector('div.widget-episodeBody') !== null;
  }

  extractParagraphs(): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    let index = 0;

    // 話タイトル
    const titleEl = document.querySelector<HTMLElement>('p.widget-episodeTitle');
    if (titleEl) {
      const text = this.extractText(titleEl);
      if (text.length > 0) {
        paragraphs.push({ text, element: titleEl, index: index++ });
      }
    }

    // 本文段落
    const body = document.querySelector('div.widget-episodeBody');
    if (!body) return paragraphs;

    body.querySelectorAll('p').forEach((el) => {
      const text = this.extractText(el);
      if (text.length === 0) return;
      paragraphs.push({ text, element: el, index: index++ });
    });

    return paragraphs;
  }

  getContainerElement(): Element {
    return document.querySelector('div.widget-episodeBody') ?? document.body;
  }

  getPrevChapterUrl(): string | null {
    const link = document.querySelector<HTMLAnchorElement>('a#contentMain-readPreviousEpisode');
    if (!link) return null;
    // href に #end などのハッシュが付く場合があるので除去
    return link.href.replace(/#.*$/, '') || null;
  }

  getNextChapterUrl(): string | null {
    const link = document.querySelector<HTMLAnchorElement>('a#contentMain-readNextEpisode');
    return link?.href ?? null;
  }

  private extractText(el: Element): string {
    // ルビ（rp, rt）を除いたテキストを取得
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('rp, rt').forEach((node) => node.remove());
    return clone.textContent?.trim() ?? '';
  }
}
