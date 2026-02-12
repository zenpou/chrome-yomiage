import type { INovelAdapter, Paragraph } from './adapter-interface';

export class AlphapolisAdapter implements INovelAdapter {
  readonly siteName = 'アルファポリス';

  matches(url: string): boolean {
    return url.startsWith('https://www.alphapolis.co.jp/novel/');
  }

  isNovelPage(): boolean {
    // エピソードページのみ（/novel/XXXXX/XXXXX/episode/XXXXX）
    return /\/novel\/\d+\/\d+\/episode\/\d+/.test(location.pathname) &&
      document.getElementById('novelBody') !== null;
  }

  /** 本文は jQuery.load() で非同期挿入されるため、ローディングが消えるまで待機する */
  waitForContent(): Promise<void> {
    return new Promise((resolve) => {
      const el = document.getElementById('novelBody');
      if (!el) { resolve(); return; }

      const isLoaded = () => {
        // ローディングインジケーターが消えて、かつテキストが十分にある
        const loading = el.querySelector('#LoadingEpisode');
        return !loading && (el.textContent?.trim().length ?? 0) > 10;
      };

      if (isLoaded()) { resolve(); return; }

      const observer = new MutationObserver(() => {
        if (isLoaded()) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(el, { childList: true, subtree: true });

      // 15秒でタイムアウト
      setTimeout(() => { observer.disconnect(); resolve(); }, 15000);
    });
  }

  extractParagraphs(): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    let index = 0;

    // チャプタータイトル（章タイトル）
    const chapterEl = document.querySelector<HTMLElement>('div.chapter-title');
    if (chapterEl) {
      const text = this.extractText(chapterEl);
      if (text.length > 0) {
        paragraphs.push({ text, element: chapterEl, index: index++ });
      }
    }

    // 話タイトル
    const titleEl = document.querySelector<HTMLElement>('h2.episode-title');
    if (titleEl) {
      const text = this.extractText(titleEl);
      if (text.length > 0) {
        paragraphs.push({ text, element: titleEl, index: index++ });
      }
    }

    // 本文
    const body = document.getElementById('novelBody');
    if (!body) return paragraphs;

    // まず <p> タグを試す
    const pEls = body.querySelectorAll('p');
    if (pEls.length > 0) {
      pEls.forEach((el) => {
        const text = this.extractText(el);
        if (text.length === 0) return;
        paragraphs.push({ text, element: el, index: index++ });
      });
      return paragraphs;
    }

    // <p> がない場合: <br> で区切られたテキストを段落化する
    // まず <br> を改行文字に置換してテキストを分割
    this.wrapBrSeparatedText(body).forEach((el) => {
      const text = this.extractText(el);
      if (text.length === 0) return;
      paragraphs.push({ text, element: el, index: index++ });
    });

    return paragraphs;
  }

  getContainerElement(): Element {
    return document.getElementById('novelBody') ?? document.body;
  }

  getPrevChapterUrl(): string | null {
    const link = document.querySelector<HTMLAnchorElement>('div.novel-navigation-link-prev a');
    return link?.href ?? null;
  }

  getNextChapterUrl(): string | null {
    const link = document.querySelector<HTMLAnchorElement>('div.novel-navigation-link-next a');
    return link?.href ?? null;
  }

  /**
   * <br> で区切られたテキストノードを <span> で囲んで段落として扱えるようにする。
   * 空行（連続 <br>）を段落区切りとする。
   */
  private wrapBrSeparatedText(container: HTMLElement): HTMLElement[] {
    const result: HTMLElement[] = [];
    let currentNodes: Node[] = [];

    const flush = () => {
      const text = currentNodes.map((n) => n.textContent ?? '').join('').trim();
      if (text.length > 0) {
        const span = document.createElement('span');
        currentNodes.forEach((n) => {
          const ref = n.nextSibling;
          span.appendChild(n);
          // 元の位置に span を挿入（最初のノードの位置）
          if (result.length === 0 || !span.parentNode) {
            container.insertBefore(span, ref);
          }
        });
        result.push(span);
      }
      currentNodes = [];
    };

    // childNodes を配列化して走査
    const nodes = Array.from(container.childNodes);
    for (const node of nodes) {
      if (node.nodeName === 'BR') {
        flush();
        continue;
      }
      // ブロック要素（div 等）は独立した段落として扱う
      if (node.nodeType === Node.ELEMENT_NODE &&
        ['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.nodeName)) {
        flush();
        const el = node as HTMLElement;
        if ((el.textContent?.trim().length ?? 0) > 0) {
          result.push(el);
        }
        continue;
      }
      currentNodes.push(node);
    }
    flush();

    return result;
  }

  private extractText(el: Element): string {
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('rp, rt').forEach((node) => node.remove());
    return clone.textContent?.trim() ?? '';
  }
}
