import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatButtonModule } from "@angular/material/button";
import { DragDropModule, CdkDragDrop } from "@angular/cdk/drag-drop";
import { Observable } from "rxjs";

import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { ItemExpandDetailsComponent } from "@components/item-expand-details/item-expand-details.component";
import { CommentsToggleComponent } from "@components/comments-toggle/comments-toggle.component";
import { CommentsComponent } from "@components/comments/comments.component";
import { StatusToggleComponent } from "@components/status-toggle/status-toggle.component";
import { ProgressBarComponent } from "@components/progress-bar/progress-bar.component";
import { ItemDisplayConfig, ItemDisplayAction } from "@models/item-display.model";
import { DisplayMode } from "@models/item-display.types";
import { Todo, Task, TaskStatus, Subtask, Category, Comment } from "@models/generated/api.types";
import { ItemType } from "@models/base.model";
import { TableField } from "@models/table-field.model";
import { StorageService } from "@services/storage.service";

@Component({
  selector: "app-item-card",
  standalone: true,
  imports: [
    CommonModule,
    MatCheckboxModule,
    MatIconModule,
    MatMenuModule,
    MatButtonModule,
    DragDropModule,
    CheckboxComponent,
    ItemExpandDetailsComponent,
    CommentsToggleComponent,
    CommentsComponent,
    StatusToggleComponent,
    ProgressBarComponent,
  ],
  templateUrl: "./item-card.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemCardComponent {
  private storageService = inject(StorageService);

  @Input() item: Todo | Task | Subtask | Category | null = null;
  @Input() config: ItemDisplayConfig[] = [];
  @Input() displayMode: DisplayMode = "card";
  @Input() index: number = 0;
  @Input() isOwner: boolean = true;
  @Input() isPrivate: boolean = true;
  @Input() highlight: boolean = false;
  @Input() isSelected: boolean = false;
  @Input() actions: ItemDisplayAction[] = [];
  @Input() expandable: boolean = true;
  @Input() itemType: ItemType = "task";
  @Input() order: number = 0;
  @Input() currentIndex: number = 0;
  @Input() expandFields: TableField[] = [];
  @Input() showCommentToggle: boolean = false;
  @Input() unreadCommentsCount: number = 0;
  @Input() showStatusToggle: boolean = false;
  @Input() onExpandRequest?: (item: any) => Observable<any>;

  @Output() selectionChangeEvent = new EventEmitter<{ id: string; selected: boolean }>();
  @Output() cardClick = new EventEmitter<{ event: MouseEvent; id: string }>();
  @Output() itemAction = new EventEmitter<{ action: string; item: any }>();
  @Output() dropped = new EventEmitter<CdkDragDrop<any>>();
  @Output() toggleComments = new EventEmitter<string>();
  @Output() addComment = new EventEmitter<{ content: string; itemId: string }>();
  @Output() deleteComment = new EventEmitter<string>();
  @Output() markAsRead = new EventEmitter<string[]>();
  @Output() statusToggle = new EventEmitter<{ item: any; status: TaskStatus }>();

  showMenu = signal(false);
  expanded = signal(false);
  commentsExpanded = signal(false);

  get itemId(): string {
    return this.item?.id || "";
  }

  get taskStatus(): TaskStatus {
    return (this.item as Task)?.status || TaskStatus.PENDING;
  }

  get isCategory(): boolean {
    return this.itemType === "category";
  }

  get canExpand(): boolean {
    return this.expandable;
  }

  toggleExpanded(event: MouseEvent): void {
    event.stopPropagation();
    this.expanded.update((v) => !v);
  }

  get isExpanded(): boolean {
    return this.expanded();
  }

  toggleCommentsHandler(): void {
    this.commentsExpanded.update((v) => !v);
    this.toggleComments.emit(this.itemId);
  }

  get visibleConfig(): ItemDisplayConfig[] {
    return this.config.filter((c) => !c.showIf || c.showIf(this.item));
  }

  get line1Config(): ItemDisplayConfig[] {
    return this.visibleConfig.filter((c) => c.line === 1 || !c.line);
  }

  get line2Config(): ItemDisplayConfig[] {
    return this.visibleConfig.filter((c) => c.line === 2);
  }

  get line3Config(): ItemDisplayConfig[] {
    return this.visibleConfig.filter((c) => c.line === 3);
  }

  getBadgeGroupItems(): ItemDisplayConfig[] {
    const badgeTypes = ["priority-badge", "status-badge", "deleted-badge"];
    return this.visibleConfig.filter((c) => badgeTypes.includes(c.type));
  }

  get hasBadgeGroup(): boolean {
    return this.visibleConfig.some((c) => c.type === "badge-group");
  }

  getValue(config: ItemDisplayConfig): any {
    if (config.getValue) {
      return config.getValue(this.item);
    }
    if (this.item) {
      return (this.item as any)[config.key];
    }
    return undefined;
  }

  getDisplayValue(config: ItemDisplayConfig): string {
    if (config.getDisplayValue) {
      return config.getDisplayValue(this.item);
    }
    const value = this.getValue(config);
    return value?.toString() || "";
  }

  getFieldClass(config: ItemDisplayConfig): string {
    let cls = config.class || "";
    if (config.getClass) {
      cls += " " + config.getClass(this.item);
    }
    return cls.trim();
  }

  getChipColor(config: ItemDisplayConfig): string {
    if (config.getChipColor) {
      return config.getChipColor(this.item);
    }
    return "";
  }

  getBadgeClass(config: ItemDisplayConfig): string {
    if (config.getBadgeClass) {
      return config.getBadgeClass(this.item);
    }
    return "";
  }

  isChecked(): boolean {
    return this.isSelected;
  }

  onCheckboxChange(result: { checked: boolean; event?: MouseEvent }): void {
    this.selectionChangeEvent.emit({ id: this.itemId, selected: result.checked });
  }

  onCardClick(event: MouseEvent): void {
    this.cardClick.emit({ event, id: this.itemId });
  }

  onFieldClick(config: ItemDisplayConfig, event: MouseEvent): void {
    event.stopPropagation();
    if (config.onClick) {
      config.onClick(this.item, event);
    } else if (config.type === "menu") {
      this.showMenu.update((v) => !v);
    }
  }

  onAction(action: string, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    if (!this.item) return;
    this.itemAction.emit({ action, item: this.item });
  }

  onMenuClick(event: MouseEvent): void {
    event.stopPropagation();
    this.showMenu.update((v) => !v);
  }

  onDragDrop(event: CdkDragDrop<any>): void {
    this.dropped.emit(event);
  }

  trackByConfig(_index: number, config: ItemDisplayConfig): string {
    return config.key;
  }

  getComments(): Comment[] {
    if (!this.item) return [];
    if (this.itemType === "task") {
      return this.storageService.getCommentsByTaskId(this.item.id);
    }
    if (this.itemType === "subtask") {
      return this.storageService.getCommentsBySubtaskId(this.item.id);
    }
    return [];
  }

  onAddComment(content: string): void {
    this.addComment.emit({ content, itemId: this.itemId });
  }

  onDeleteComment(commentId: string): void {
    this.deleteComment.emit(commentId);
  }

  onMarkAsRead(commentIds: string[]): void {
    this.markAsRead.emit(commentIds);
  }

  onStatusToggle(status: TaskStatus): void {
    this.statusToggle.emit({ item: this.item, status });
  }

  getProgressItems(config: ItemDisplayConfig): Array<{ status: string }> {
    if (!this.item) return [];
    if (config.type !== "progress-bar") return [];

    if (this.itemType === "todo") {
      const tasks = (this.item as Todo).tasks;
      if (tasks && tasks.length > 0) {
        return tasks;
      }
      return [];
    }
    if (this.itemType === "task") {
      const subtasks = (this.item as Task).subtasks;
      if (subtasks && subtasks.length > 0) {
        return subtasks;
      }
      return [{ status: (this.item as Task).status || "pending" }];
    }
    return [];
  }

  hasProgressCounts(config: ItemDisplayConfig): boolean {
    if (!this.item || config.type !== "progress-bar") return false;

    if (this.itemType === "todo") {
      return (this.item as Todo).tasks_count > 0;
    }
    if (this.itemType === "task") {
      return (this.item as Task).subtasks_count > 0;
    }
    return false;
  }

  getCompletedCount(config: ItemDisplayConfig): number {
    if (!this.item || config.type !== "progress-bar") return 0;

    if (this.itemType === "todo") {
      return (this.item as Todo).completed_tasks_count || 0;
    }
    if (this.itemType === "task") {
      return (this.item as Task).completed_subtasks_count || 0;
    }
    return 0;
  }

  getTotalCount(config: ItemDisplayConfig): number {
    if (!this.item || config.type !== "progress-bar") return 0;

    if (this.itemType === "todo") {
      return (this.item as Todo).tasks_count || 0;
    }
    if (this.itemType === "task") {
      return (this.item as Task).subtasks_count || 0;
    }
    return 0;
  }

  getProgressSize(config: ItemDisplayConfig): "sm" | "md" | "lg" {
    return (config as any).size || "sm";
  }
}
