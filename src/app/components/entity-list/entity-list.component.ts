import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";

import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { TableField, TableFieldActionButton } from "@components/table-view/table-field.model";

import { TodoComponent } from "@components/todo/todo.component";
import { TaskComponent } from "@components/task/task.component";
import { SubtaskComponent } from "@components/subtask/subtask.component";
import { TableViewComponent } from "@components/table-view/table-view.component";
import { ItemExpandDetailsComponent } from "@components/item-expand-details/item-expand-details.component";
import { EmptyStateComponent } from "@components/empty-state/empty-state.component";

@Component({
  selector: "app-entity-list",
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    TodoComponent,
    TaskComponent,
    SubtaskComponent,
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

  @Output() itemAction = new EventEmitter<{ action: string; item: T }>();
  @Output() selectionChange = new EventEmitter<{ id: string; selected: boolean }>();
  @Output() dropped = new EventEmitter<CdkDragDrop<T[]>>();
  @Output() cardClick = new EventEmitter<{ event: MouseEvent; id: string }>();

  get itemComponent(): typeof TodoComponent | typeof TaskComponent | typeof SubtaskComponent {
    switch (this.itemType) {
      case "todo":
        return TodoComponent;
      case "task":
        return TaskComponent;
      case "subtask":
        return SubtaskComponent;
    }
  }

  trackById(index: number, item: T): string {
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

  getComponentInputs(item: T): Record<string, any> {
    const base = {
      index: this.index,
      isOwner: this.isOwner,
      isPrivate: this.isPrivate,
      highlight: this.highlightId === item.id,
      isSelected: this.selectedIds.has(item.id),
    };

    switch (this.itemType) {
      case "todo":
        return { ...base, todo: item };
      case "task":
        return { ...base, task: item };
      case "subtask":
        return { ...base, subtask: item };
    }
  }

  getComponentOutputs(item: T): Record<string, any> {
    switch (this.itemType) {
      case "todo":
        return {
          deleteTodoEvent: (id: string) =>
            this.itemAction.emit({ action: "delete", item: item as any }),
          archiveTodoEvent: (id: string) =>
            this.itemAction.emit({ action: "archive", item: item as any }),
          restoreTodoEvent: (id: string) =>
            this.itemAction.emit({ action: "restore", item: item as any }),
          saveAsBlueprintEvent: (todo: Todo) =>
            this.itemAction.emit({ action: "blueprint", item: item as any }),
          updateTodoEvent: (event: any) =>
            this.itemAction.emit({ action: "update", item: item as any }),
          selectionChangeEvent: (e: { id: string; selected: boolean }) => this.onSelectionChange(e),
          cardClick: (e: { event: MouseEvent; id: string }) => this.onCardClick(e),
        };
      case "task":
        return {
          deleteTaskEvent: (id: string) =>
            this.itemAction.emit({ action: "delete", item: item as any }),
          toggleCompletionEvent: (task: Task) =>
            this.itemAction.emit({ action: "toggle", item: item as any }),
          updateTaskEvent: (event: any) =>
            this.itemAction.emit({ action: "update", item: item as any }),
          selectionChangeEvent: (e: { id: string; selected: boolean }) => this.onSelectionChange(e),
          cardClick: (e: { event: MouseEvent; id: string }) => this.onCardClick(e),
        };
      case "subtask":
        return {
          deleteSubtaskEvent: (id: string) =>
            this.itemAction.emit({ action: "delete", item: item as any }),
          toggleCompletionEvent: (subtask: Subtask) =>
            this.itemAction.emit({ action: "toggle", item: item as any }),
          updateSubtaskEvent: (event: any) =>
            this.itemAction.emit({ action: "update", item: item as any }),
          selectionChangeEvent: (e: { id: string; selected: boolean }) => this.onSelectionChange(e),
          cardClick: (e: { event: MouseEvent; id: string }) => this.onCardClick(e),
        };
    }
  }
}
