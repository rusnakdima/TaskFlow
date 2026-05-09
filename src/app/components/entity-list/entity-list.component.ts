import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";

import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { TableFieldActionButton, TableField } from "@models/table-field.model";
import { ItemDisplayConfig } from "@models/item-display.model";
import { DisplayMode } from "@models/item-display.types";

import { ItemDisplayComponent } from "@components/item-display/item-display.component";
import { TableViewComponent } from "@components/table-view/table-view.component";
import { ItemExpandDetailsComponent } from "@components/item-expand-details/item-expand-details.component";
import { EmptyStateComponent } from "@components/empty-state/empty-state.component";
import {
  TODO_CARD_CONFIG,
  TASK_CARD_CONFIG,
  SUBTASK_CARD_CONFIG,
  TODO_TABLE_CONFIG,
  TASK_TABLE_CONFIG,
  SUBTASK_TABLE_CONFIG,
} from "@constants/item-display.constants";

@Component({
  selector: "app-entity-list",
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    ItemDisplayComponent,
    TableViewComponent,
    ItemExpandDetailsComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./entity-list.component.html",
})
export class EntityListComponent<T extends Todo | Task | Subtask> {
  @Input() itemType: "todo" | "task" | "subtask" = "todo";
  @Input() items: T[] = [];
  @Input() viewMode: "card" | "grid" | "table" | "list" = "grid";
  @Input() tableFields: TableField[] = [];
  @Input() actions: TableFieldActionButton[] = [];
  @Input() selectedIds: Set<string> = new Set();
  @Input() showSelection: boolean = true;
  @Input() dragEnabled: boolean = true;
  @Input() highlightId: string | null = null;
  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() index: number = 0;
  @Input() itemDisplayConfig: ItemDisplayConfig[] | null = null;

  @Output() itemAction = new EventEmitter<{ action: string; item: T }>();
  @Output() selectionChange = new EventEmitter<{ id: string; selected: boolean }>();
  @Output() dropped = new EventEmitter<CdkDragDrop<T[]>>();
  @Output() cardClick = new EventEmitter<{ event: MouseEvent; id: string }>();

  trackById(_index: number, item: T): string {
    return item.id;
  }

  onSelectionChange(event: { id: string; selected: boolean }): void {
    this.selectionChange.emit(event);
  }

  onDrop(event: CdkDragDrop<T[]>): void {
    this.dropped.emit(event);
  }

  onTableAction(event: { action: string; item: T }): void {
    this.itemAction.emit(event);
  }

  onCardClick(event: { event: MouseEvent; id: string }): void {
    this.cardClick.emit(event);
  }

  getDefaultConfig(): ItemDisplayConfig[] {
    switch (this.itemType) {
      case "todo":
        return this.viewMode === "table" ? TODO_TABLE_CONFIG : TODO_CARD_CONFIG;
      case "task":
        return this.viewMode === "table" ? TASK_TABLE_CONFIG : TASK_CARD_CONFIG;
      case "subtask":
        return this.viewMode === "table" ? SUBTASK_TABLE_CONFIG : SUBTASK_CARD_CONFIG;
    }
  }

  getEffectiveConfig(): ItemDisplayConfig[] {
    return this.itemDisplayConfig ?? this.getDefaultConfig();
  }

  getDisplayMode(): DisplayMode {
    switch (this.viewMode) {
      case "table":
        return "table-row";
      case "list":
        return "list";
      case "grid":
      case "card":
      default:
        return "card";
    }
  }

  getExpandable(): boolean {
    return this.itemType !== "category";
  }

  getComponentInputs(item: T): Record<string, any> {
    return {
      index: this.index,
      isOwner: this.isOwner,
      isPrivate: this.isPrivate,
      highlight: this.highlightId === item.id,
      isSelected: this.selectedIds.has(item.id),
    };
  }

  getComponentOutputs(_item: T): Record<string, any> {
    return {
      selectionChangeEvent: (e: { id: string; selected: boolean }) => this.onSelectionChange(e),
      cardClick: (e: { event: MouseEvent; id: string }) => this.onCardClick(e),
      itemAction: (e: { action: string; item: any }) => this.itemAction.emit(e),
    };
  }
}
