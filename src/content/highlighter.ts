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
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    this.current = element;
  }

  clearAll(): void {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
      el.classList.remove(HIGHLIGHT_CLASS);
    });
    this.current = null;
  }
}
