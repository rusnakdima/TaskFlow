import { Injectable, Signal, signal } from "@angular/core";
import { CdkDragEnter, CdkDragDrop, CdkDropList, DragRef } from "@angular/cdk/drag-drop";

export interface DragDropHandlers<T> {
  onDrop: (event: CdkDragDrop<T[]>) => void;
}

@Injectable({
  providedIn: "root",
})
export class DragDropHandlerService {
  private _dragTarget: CdkDropList | null = null;
  private _dragTargetIndex = 0;
  private _dragSource: CdkDropList | null = null;
  private _dragSourceIndex = 0;
  private _dragRef: DragRef | null = null;

  get dragTarget(): CdkDropList | null {
    return this._dragTarget;
  }
  get dragTargetIndex(): number {
    return this._dragTargetIndex;
  }
  get dragSource(): CdkDropList | null {
    return this._dragSource;
  }
  get dragSourceIndex(): number {
    return this._dragSourceIndex;
  }
  get dragRef(): DragRef | null {
    return this._dragRef;
  }

  onListEntered<T>(event: CdkDragEnter, placeholder: CdkDropList): void {
    const { item, container } = event;
    if (container === placeholder) return;
    if (!placeholder?.element?.nativeElement) return;

    const placeholderEl = placeholder.element.nativeElement as HTMLElement;
    const sourceEl = item.dropContainer.element.nativeElement as HTMLElement;
    const dropEl = container.element.nativeElement as HTMLElement;
    const parent = dropEl.parentElement;
    if (!parent) return;

    const dragIndex = Array.prototype.indexOf.call(
      parent.children,
      this._dragSource ? placeholderEl : sourceEl
    );
    const dropIndex = Array.prototype.indexOf.call(parent.children, dropEl);

    if (!this._dragSource) {
      this._dragSourceIndex = dragIndex;
      this._dragSource = item.dropContainer;
      placeholderEl.style.width = sourceEl.offsetWidth + "px";
      placeholderEl.style.minHeight = sourceEl.offsetHeight + "px";
      sourceEl.parentElement?.removeChild(sourceEl);
    }

    this._dragTargetIndex = dropIndex;
    this._dragTarget = container;
    this._dragRef = item._dragRef;

    placeholderEl.style.display = "";
    parent.insertBefore(placeholderEl, dropIndex > dragIndex ? dropEl.nextSibling : dropEl);

    placeholder._dropListRef.enter(
      item._dragRef,
      item.element.nativeElement.offsetLeft,
      item.element.nativeElement.offsetTop
    );
  }

  onListDropped<T>(
    placeholder: CdkDropList,
    onReorder: (prev: number, curr: number) => void
  ): void {
    if (!this._dragTarget || !placeholder?.element?.nativeElement) return;

    const placeholderEl = placeholder.element.nativeElement as HTMLElement;
    const parent = placeholderEl.parentElement;
    if (parent) {
      placeholderEl.style.display = "none";
      parent.removeChild(placeholderEl);
      parent.appendChild(placeholderEl);
      const sourceEl = this._dragSource?.element.nativeElement as HTMLElement;
      if (sourceEl) {
        parent.insertBefore(sourceEl, parent.children[this._dragSourceIndex]);
      }
    }

    if (placeholder._dropListRef.isDragging() && this._dragRef) {
      placeholder._dropListRef.exit(this._dragRef);
    }

    const prev = this._dragSourceIndex;
    const curr = this._dragTargetIndex;
    this._dragTarget = null;
    this._dragSource = null;
    this._dragRef = null;

    if (prev !== curr) {
      onReorder(prev, curr);
    }
  }
}
