import { CdkDragDrop, CdkDropList, DragRef } from "@angular/cdk/drag-drop";

export interface DragItem {
  id: string;
  order: number;
}

export interface DropZoneConfig {
  dropListId: string;
  itemType: "task" | "subtask" | "todo" | "category";
}

export class DragDropHelper {
  static createDropListId(type: string, id: string): string {
    return `dropList-${type}-${id}`;
  }

  static parseDropListId(dropListId: string): { type: string; id: string } | null {
    const match = dropListId.match(/^dropList-(.+)-(.+)$/);
    if (!match) return null;
    return { type: match[1], id: match[2] };
  }

  static getDragItemId(event: CdkDragDrop<DragItem[]>): string | null {
    return event.item.data?.id || null;
  }

  static getDropItemId(container: CdkDropList): string | null {
    const id = container.id;
    const parsed = this.parseDropListId(id);
    return parsed?.id || null;
  }

  static reorderArray<T extends DragItem>(
    array: T[],
    previousIndex: number,
    currentIndex: number
  ): T[] {
    const result = [...array];
    const [moved] = result.splice(previousIndex, 1);
    result.splice(currentIndex, 0, moved);
    return result;
  }

  static updateOrder<T extends DragItem>(items: T[]): T[] {
    return items.map((item, index) => ({
      ...item,
      order: index,
    })) as T[];
  }

  static findContainer(dragRef: DragRef, dropLists: CdkDropList[]): CdkDropList | null {
    const dragRoot = dragRef.getRootElement();
    if (!dragRoot) return null;

    for (const dropList of dropLists) {
      const dropListElement = dropList.element.nativeElement;
      if (dropListElement.contains(dragRoot)) {
        return dropList;
      }
    }
    return null;
  }

  static isSameContainer(source: CdkDropList | null, target: CdkDropList | null): boolean {
    if (!source || !target) return false;
    return source.id === target.id;
  }

  static getContainerType(dropListId: string): string {
    const parsed = this.parseDropListId(dropListId);
    return parsed?.type || "unknown";
  }
}
