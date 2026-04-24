import { Injectable } from "@angular/core";
import { moveItemInArray } from "@angular/cdk/drag-drop";

export interface Orderable {
  id: string;
  order: number;
  [key: string]: any;
}

export interface ReorderResult<T extends Orderable> {
  itemsToUpdate: T[];
  movedItemId: string;
  oldIndex: number;
  newIndex: number;
}

@Injectable({
  providedIn: "root",
})
export class OrderCalculationService {
  reorderItems<T extends Orderable>(
    allItems: T[],
    itemId: string,
    oldIndex: number,
    newIndex: number
  ): ReorderResult<T> {
    const safeOldIndex = Math.max(0, Math.min(oldIndex, allItems.length - 1));
    const safeNewIndex = Math.max(0, Math.min(newIndex, allItems.length - 1));

    if (safeOldIndex === safeNewIndex) {
      return {
        itemsToUpdate: [],
        movedItemId: itemId,
        oldIndex: safeOldIndex,
        newIndex: safeNewIndex,
      };
    }

    const items = [...allItems];
    moveItemInArray(items, safeOldIndex, safeNewIndex);

    const itemsToUpdate = items.map((item, index) => ({
      ...item,
      order: items.length - 1 - index,
    }));

    return {
      itemsToUpdate: itemsToUpdate as T[],
      movedItemId: itemId,
      oldIndex: safeOldIndex,
      newIndex: safeNewIndex,
    };
  }
}
