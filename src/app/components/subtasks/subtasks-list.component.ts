import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";

import { Subtask } from "@models/subtask.model";
import { TableFieldActionButton, TableField } from "@models/table-field.model";
import { TABLE_ACTIONS } from "@constants/table-field.constants";

import { EntityListComponent } from "@components/entity-list/entity-list.component";
import { EmptyStateComponent } from "@components/empty-state/empty-state.component";

@Component({
  selector: "app-subtasks-list",
  standalone: true,
  imports: [CommonModule, DragDropModule, EntityListComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./subtasks-list.component.html",
})
export class SubtasksListComponent {
  @Input() subtasks: Subtask[] = [];
  @Input() viewMode: "card" | "grid" | "table" | "list" = "grid";
  @Input() selectedIds: Set<string> = new Set();
  @Input() highlightId: string | null = null;
  @Input() highlightComment: string | null = null;
  @Input() openCommentsForId: string | null = null;
  @Input() todoId = "";
  @Input() isOwner = false;
  @Input() isPrivate = true;

  @Output() rowClick = new EventEmitter<{ event: MouseEvent; item: Subtask }>();
  @Output() cardClick = new EventEmitter<{ event: MouseEvent; id: string }>();
  @Output() selectionChange = new EventEmitter<{ id: string; selected: boolean }>();
  @Output() selectAll = new EventEmitter<void>();
  @Output() rangeSelect = new EventEmitter<{ anchorId: string; targetId: string }>();
  @Output() additiveSelect = new EventEmitter<string>();
  @Output() dropped = new EventEmitter<CdkDragDrop<Subtask[]>>();
  @Output() deleteSubtask = new EventEmitter<string>();
  @Output() toggleCompletion = new EventEmitter<Subtask>();
  @Output() updateSubtask = new EventEmitter<{ subtask: Subtask; field: string; value: unknown }>();
  @Output() tableAction = new EventEmitter<{ action: string; item: Subtask }>();

  tableFields: TableField[] = [
    { key: "title", label: "Subtask", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status", onClick: (item) => this.onStatusCycle(item) },
    {
      key: "comments",
      label: "Comments",
      type: "number",
      getValue: (item) => item.comments_count || 0,
    },
  ];

  tableActions: TableFieldActionButton[] = [
    TABLE_ACTIONS.EDIT,
    TABLE_ACTIONS.ARCHIVE,
    TABLE_ACTIONS.DELETE,
  ];

  onStatusCycle(subtask: Subtask): void {
    this.toggleCompletion.emit(subtask);
  }

  onItemAction(event: { action: string; item: Subtask }): void {
    switch (event.action) {
      case "delete":
        this.deleteSubtask.emit(event.item.id);
        break;
      case "toggle":
        this.toggleCompletion.emit(event.item);
        break;
      case "update":
        break;
      default:
        this.tableAction.emit(event);
    }
  }
}
