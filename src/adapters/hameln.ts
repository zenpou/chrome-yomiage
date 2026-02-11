import type { INovelAdapter, Paragraph } from './adapter-interface';

export class HamelnAdapter implements INovelAdapter {
  readonly siteName = 'ハーメルン';

  matches(url: string): boolean {
    return url.startsWith('https://syosetu.org/');
  }

  isNovelPage(): boolean {
    // 本文コンテナが存在すれば1話完結・連載問わず対応
    return document.getElementById('honbun') !== null;
  }

  extractParagraphs(): Paragraph[] {
    const honbun = document.getElementById('honbun');
    if (!honbun) return [];

    const paragraphs: Paragraph[] = [];
    let index = 0;

    // div.ss 内で .novelnavi より後・#honbun より前にある要素（話タイトルなど）を取得
    const ssContainer = honbun.closest('div.ss');
    if (ssContainer) {
      const navEl = ssContainer.querySelector('.novelnavi');
      let afterNav = navEl === null; // naviがなければ最初から対象
      for (const child of Array.from(ssContainer.children)) {
        if (child === honbun) break;
        if (!afterNav) {
          if (child === navEl) afterNav = true;
          continue;
        }
        const text = this.extractText(child);
        if (text.length > 0) {
          paragraphs.push({ text, element: child, index: index++ });
        }
      }
    }

    // #honbun 内の <p> タグ
    honbun.querySelectorAll('p').forEach((el) => {
      const text = this.extractText(el);
      if (text.length === 0) return;
      paragraphs.push({ text, element: el, index: index++ });
    });

    return paragraphs;
  }

  getContainerElement(): Element {
    return document.getElementById('honbun') ?? document.body;
  }

  getPrevChapterUrl(): string | null {
    return this.findAdjacentChapterUrl(-1);
  }

  getNextChapterUrl(): string | null {
    return this.findAdjacentChapterUrl(1);
  }

  private findAdjacentChapterUrl(direction: -1 | 1): string | null {
    if (direction === 1) {
      const link = document.querySelector<HTMLAnchorElement>('a.next_page_link');
      return link?.href ?? null;
    }

    // 前話: 章URLパターンに一致するリンクのみ（目次リンクを除外）
    const match = location.pathname.match(/\/novel\/(\d+)\/(\d+)\//);
    if (!match) return null;
    const [, novelId] = match;
    const chapterPattern = new RegExp(`/novel/${novelId}/\\d+/`);

    const candidates = document.querySelectorAll<HTMLAnchorElement>('.novelnavi .novelnb a:not(.next_page_link)');
    for (const a of Array.from(candidates)) {
      if (chapterPattern.test(a.href)) return a.href;
    }
    return null;
  }

  private extractText(el: Element): string {
    // ルビ（rp, rt）を除いたテキストを取得
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('rp, rt').forEach((node) => node.remove());
    return clone.textContent?.trim() ?? '';
  }
}
