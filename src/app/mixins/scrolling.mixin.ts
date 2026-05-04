import { signal, ElementRef, ViewChild } from "@angular/core";

export class ScrollingMixin {
  processedIds = signal<Set<string>>(new Set());
  isFirstLoad = signal(true);
  shouldScroll = signal(false);

  scrollContainer?: ElementRef;
  protected observer?: IntersectionObserver;

  protected initIntersectionObserver(
    getUnreadSelector: string,
    getIdAttribute: string,
    onUnreadObserved: (id: string) => void
  ): void {
    if (typeof window === "undefined") return;

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute(getIdAttribute);
            if (id) {
              this.processedIds.update((ids) => {
                const newIds = new Set(ids);
                newIds.add(id);
                return newIds;
              });
              onUnreadObserved(id);
              this.observer?.unobserve(entry.target);
            }
          }
        });
      },
      { threshold: 1.0 }
    );
  }

  protected updateObservedElements(getUnreadSelector: string, getIdAttribute: string): void {
    setTimeout(() => {
      const list = this.scrollContainer?.nativeElement;
      if (list) {
        const unreadElements = list.querySelectorAll(getUnreadSelector);
        unreadElements.forEach((el: Element) => {
          const id = el.getAttribute(getIdAttribute);
          if (!id || !this.processedIds().has(id)) {
            this.observer?.observe(el);
          }
        });
      }
    }, 100);
  }

  protected scrollToBottom(): void {
    setTimeout(() => {
      const list = this.scrollContainer?.nativeElement;
      if (list) {
        list.scrollTop = list.scrollHeight;
      }
    }, 50);
  }

  protected smartScroll(): void {
    setTimeout(() => {
      const list = this.scrollContainer?.nativeElement;
      if (list) {
        const isNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 100;
        if (isNearBottom || this.isFirstLoad()) {
          list.scrollTop = list.scrollHeight;
        }
        this.isFirstLoad.set(false);
      }
    }, 100);
  }

  protected destroyObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = undefined;
    }
  }
}
