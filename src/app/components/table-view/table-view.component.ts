/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
  ChangeDetectionStrategy,
  TemplateRef,
} from "@angular/core";
import { CdkDragDrop, DragDropModule } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { CommentsPanelComponent } from "@components/comments-panel/comments-panel.component";

/* helpers */
import { BaseItemHelper } from "@helpers/base-item.helper";
import { DateHelper } from "@helpers/date.helper";

/* models */
import { TableField, TableFieldActionButton } from "./table-field.model";

/* constants */
import {
  TableFieldColors,
  TableFieldIcons,
  TableActionColors,
} from "@constants/table-field.constants";

@Component({
  selector: "app-table-view",
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    CheckboxComponent,
    DragDropModule,
    CommentsPanelComponent,
  ],
  templateUrl: "./table-view.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableViewComponent {
  @Input() data: any[] = [];
  @Input() fields: TableField[] = [];
  @Input() selectedIds = new Set<string>();
  @Input() showSelection = true;
  @Input() showActionsColumn = true;
  @Input() emptyMessage = "No data available";
  @Input() actions: TableFieldActionButton[] = [
    { key: "edit", icon: "edit", label: "Edit" },
    { key: "delete", icon: "delete", label: "Delete" },
  ];
  @Input() expandColumn = false;
  @Input() dragEnabled = false;
  @Input() expandable = false;
  @Input() expandTemplate: TemplateRef<any> | null = null;
  @Input() showCommentToggle = false;

  @Output() rowClick = new EventEmitter<any>();
  @Output() selectionChange = new EventEmitter<{ id: string; selected: boolean }>();
  @Output() selectAll = new EventEmitter<void>();
  @Output() sortChange = new EventEmitter<{ field: string; direction: "asc" | "desc" }>();
  @Output() actionClick = new EventEmitter<{ action: string; item: any }>();
  @Output() dropped = new EventEmitter<CdkDragDrop<any[]>>();
  @Output() addComment = new EventEmitter<{ content: string; itemId: string }>();
  @Output() deleteComment = new EventEmitter<string>();
  @Output() markAsRead = new EventEmitter<string[]>();

  sortField = signal<string>("");
  sortDirection = signal<"asc" | "desc">("asc");

  expandedRows = signal<Set<string>>(new Set());
  expandedComments = signal<Set<string>>(new Set());

  toggleSort(field: TableField): void {
    if (!field.sortable) return;

    if (this.sortField() === field.key) {
      this.sortDirection.set(this.sortDirection() === "asc" ? "desc" : "asc");
    } else {
      this.sortField.set(field.key);
      this.sortDirection.set("asc");
    }

    this.sortChange.emit({
      field: field.key,
      direction: this.sortDirection(),
    });
  }

  getSortedData(): any[] {
    const field = this.sortField();
    if (!field) return this.data;

    const fieldConfig = this.fields.find((f) => f.key === field);
    const direction = this.sortDirection();

    return [...this.data].sort((a, b) => {
      const aVal = fieldConfig?.getSortValue ? fieldConfig.getSortValue(a) : a[field];
      const bVal = fieldConfig?.getSortValue ? fieldConfig.getSortValue(b) : b[field];

      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let comparison = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return direction === "asc" ? comparison : -comparison;
    });
  }

  isExpanded(id: string): boolean {
    return this.expandedRows().has(id);
  }

  toggleExpanded(id: string): void {
    this.expandedRows.update((expanded) => {
      const newExpanded = new Set(expanded);
      if (newExpanded.has(id)) {
        newExpanded.delete(id);
      } else {
        newExpanded.add(id);
      }
      return newExpanded;
    });
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  onSelectionChange(id: string, checked: boolean): void {
    this.selectionChange.emit({ id, selected: checked });
  }

  onSelectAll(): void {
    this.selectAll.emit();
  }

  formatValue(item: any, field: TableField): any {
    if (field.getValue) {
      return field.getValue(item);
    }
    return item[field.key];
  }

  formatDate = DateHelper.formatDateShort;
  formatDateTime = DateHelper.formatDateTime;

  getFieldClass(field: TableField): string {
    return field.width ? `w-${field.width}` : "";
  }

  onRowClick(item: any): void {
    this.rowClick.emit(item);
  }

  onActionClick(action: string, item: any): void {
    this.actionClick.emit({ action, item });
  }

  onDropped(event: CdkDragDrop<any[]>): void {
    if (!this.dragEnabled) return;
    this.dropped.emit(event);
  }

  isCommentExpanded(id: string): boolean {
    return this.expandedComments().has(id);
  }

  toggleComments(id: string): void {
    this.expandedComments.update((expanded) => {
      const newExpanded = new Set(expanded);
      if (newExpanded.has(id)) {
        newExpanded.delete(id);
      } else {
        newExpanded.add(id);
      }
      return newExpanded;
    });
  }

  getCommentsForItem(item: any): any[] {
    return item.comments || [];
  }

  getPriorityClass = BaseItemHelper.getPriorityBadgeClass;
  getStatusClass = BaseItemHelper.getStatusBadgeClass;

  getIconColor(field: TableField, value: any): string {
    if (field.iconConfig?.default) return field.iconConfig.default;
    if (field.type === "boolean") {
      return value ? TableFieldIcons.boolean.true : TableFieldIcons.boolean.false;
    }
    if (field.type === "change") {
      if (value > 0) return TableFieldIcons.change.positive;
      if (value < 0) return TableFieldIcons.change.negative;
      return TableFieldIcons.change.neutral;
    }
    return "";
  }

  getChipOrBadgeColor(field: TableField, value: any): string {
    if (field.colorConfig?.default) return field.colorConfig.default;
    if (field.type === "change") {
      if (value > 0) return TableFieldColors.change.positive;
      if (value < 0) return TableFieldColors.change.negative;
      return TableFieldColors.change.neutral;
    }
    if (field.type === "boolean") {
      return value ? TableFieldColors.boolean.true : TableFieldColors.boolean.false;
    }
    return "";
  }

  getActionColor(action: TableFieldActionButton): string {
    const colorKey = action.key as keyof typeof TableActionColors;
    return TableActionColors[colorKey] || TableActionColors.default;
  }

  hasActionTemplate(action: TableFieldActionButton): boolean {
    return !!action.template;
  }

  onCommentAdd(content: string, item: any): void {
    this.addComment.emit({ content, itemId: item.id });
  }

  onCommentDelete(commentId: string): void {
    this.deleteComment.emit(commentId);
  }

  onCommentMarkAsRead(commentIds: string[]): void {
    this.markAsRead.emit(commentIds);
  }
}
