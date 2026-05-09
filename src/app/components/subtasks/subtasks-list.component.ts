import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";

import { Subtask } from "@models/subtask.model";
import { TableField, TableFieldActionButton } from "@components/table-view/table-field.model";
import { TABLE_ACTIONS } from "@constants/table-field.constants";

import { SubtaskComponent } from "@components/subtask/subtask.component";
import { TableViewComponent } from "@components/table-view/table-view.component";
import { ItemExpandDetailsComponent } from "@components/item-expand-details/item-expand-details.component";
import { EmptyStateComponent } from "@components/empty-state/empty-state.component";

@Component({
  selector: "app-subtasks-list",
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    SubtaskComponent,
    TableViewComponent,
    ItemExpandDetailsComponent,
    EmptyStateComponent,
  ],
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

  tableActions: TableFieldActionButton[] = [TABLE_ACTIONS.EDIT, TABLE_ACTIONS.DELETE];

  isCommentsOpen(subtaskId: string): boolean {
    const openFor = this.openCommentsForId;
    return openFor === "*" || openFor === subtaskId;
  }

  onRowClick(event: { event: MouseEvent; item: Subtask }): void {
    this.rowClick.emit(event);
  }

  onCardClick(event: { event: MouseEvent; id: string }): void {
    this.cardClick.emit(event);
  }

  onSelectionChange(event: { id: string; selected: boolean }): void {
    this.selectionChange.emit(event);
  }

  onSelectAll(): void {
    this.selectAll.emit();
  }

  onRangeSelect(event: { anchorId: string; targetId: string }): void {
    this.rangeSelect.emit(event);
  }

  onAdditiveSelect(id: string): void {
    this.additiveSelect.emit(id);
  }

  onDrop(event: CdkDragDrop<Subtask[]>): void {
    this.dropped.emit(event);
  }

  onDeleteSubtask(id: string): void {
    this.deleteSubtask.emit(id);
  }

  onToggleCompletion(subtask: Subtask): void {
    this.toggleCompletion.emit(subtask);
  }

  onUpdateSubtask(event: { subtask: Subtask; field: string; value: unknown }): void {
    this.updateSubtask.emit(event);
  }

  onStatusCycle(subtask: Subtask): void {
    this.toggleCompletion.emit(subtask);
  }

  onTableAction(event: { action: string; item: Subtask }): void {
    this.tableAction.emit(event);
  }
}
