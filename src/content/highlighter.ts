const HIGHLIGHT_CLASS = 'yomiage-highlight';

const styleEl = document.createElement('style');
styleEl.textContent = `
  .${HIGHLIGHT_CLASS} {
    background: rgba(255, 220, 50, 0.35) !important;
    border-radius: 3px;
    outline: 2px solid rgba(255, 200, 0, 0.5);
    scroll-margin-top: 120px;
  }
`;

export class Highlighter {
  private current: Element | null = null;
  autoScroll = true;

  inject(): void {
    if (!document.head.contains(styleEl)) {
      document.head.appendChild(styleEl);
    }
  }

  highlight(element: Element | null): void {
    if (this.current) {
      this.current.classList.remove(HIGHLIGHT_CLASS);
    }
    if (element) {
      element.classList.add(HIGHLIGHT_CLASS);
      if (this.autoScroll) {
        this.scrollToElement(element);
      }
    }
    this.current = element;
  }

  private scrollToElement(element: Element): void {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    // 要素が画面上半分（上から40%の位置）に来るようにスクロール
    // → 下に約60%の余白ができ、続きを目で読める
    const targetY = viewportHeight * 0.4;
    if (rect.top < 0 || rect.top > viewportHeight * 0.8) {
      window.scrollBy({ top: rect.top - targetY, behavior: 'smooth' });
    }
  }

  clearAll(): void {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
      el.classList.remove(HIGHLIGHT_CLASS);
    });
    this.current = null;
  }
}
