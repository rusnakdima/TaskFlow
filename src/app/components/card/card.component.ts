import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
  computed,
} from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatButtonModule } from "@angular/material/button";
import { DragDropModule, CdkDragDrop, CdkDragHandle } from "@angular/cdk/drag-drop";

import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { ItemExpandDetailsComponent } from "@components/item-expand-details/item-expand-details.component";
import { ItemDisplayConfig, ItemDisplayAction } from "@models/item-display.model";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { ItemType } from "@models/base.model";
import { PRIORITY_COLORS, STATUS_COLORS } from "@constants/table-field.constants";

export interface CardBadge {
  label: string;
  class: string;
}

export type CardItemType = ItemType | "comment" | "chat" | "daily_activity" | "admin";

@Component({
  selector: "app-card",
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
    DatePipe,
  ],
  templateUrl: "./card.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardComponent {
  @Input() item: any = null;
  @Input() config: ItemDisplayConfig[] = [];
  @Input() itemType: CardItemType = "task";
  @Input() expandable: boolean = true;
  @Input() isSelected: boolean = false;
  @Input() highlight: boolean = false;
  @Input() actions: ItemDisplayAction[] = [];
  @Input() dragEnabled: boolean = true;

  @Output() cardClick = new EventEmitter<{ event: MouseEvent; id: string }>();
  @Output() selectionChange = new EventEmitter<{ id: string; selected: boolean }>();
  @Output() expandToggle = new EventEmitter<void>();
  @Output() actionClick = new EventEmitter<{ action: string; item: any; event: MouseEvent }>();
  @Output() dropped = new EventEmitter<CdkDragDrop<any>>();

  showMenu = signal(false);
  expanded = signal(false);

  readonly priorityColors = PRIORITY_COLORS;
  readonly statusColors = STATUS_COLORS;

  get itemId(): string {
    return this.item?.id || "";
  }

  get isCategory(): boolean {
    return this.itemType === "category";
  }

  get canExpand(): boolean {
    return this.expandable && !this.isCategory;
  }

  get title(): string {
    if (!this.item) return "";
    return (this.item as any).title || (this.item as any).content || "";
  }

  get description(): string {
    if (!this.item) return "";
    return (this.item as any).description || "";
  }

  get priority(): string {
    if (!this.item) return "";
    return (this.item as any).priority || "";
  }

  get status(): string {
    if (!this.item) return "";
    return (this.item as any).status || "";
  }

  get categories(): string[] {
    if (!this.item) return [];
    const cats = (this.item as any).categories || (this.item as any).category?.name;
    if (Array.isArray(cats)) return cats;
    if (cats) return [cats];
    return [];
  }

  get date(): string {
    if (!this.item) return "";
    const date = (this.item as any).date || (this.item as any).created_at;
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  get priorityClass(): string {
    const p = this.priority?.toLowerCase();
    if (p === "high" || p === "urgent")
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    if (p === "medium")
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    if (p === "low") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400";
  }

  get statusClass(): string {
    const s = this.status?.toLowerCase();
    if (s === "completed")
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    if (s === "in_progress" || s === "in-progress")
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    if (s === "cancelled" || s === "canceled")
      return "bg-gray-100 text-gray-700 dark:bg-gray-700/30 dark:text-gray-400";
    if (s === "pending") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400";
  }

  get containerClasses(): string {
    const classes = [
      "flex h-full flex-col rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800",
    ];

    if (this.highlight) classes.push("animate-pulse ring-4 ring-blue-500");
    if (this.isSelected) classes.push("ring-2 ring-blue-500 dark:ring-blue-400");
    if ((this.item as any)?.deleted_at) {
      classes.push(
        "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20 opacity-60 grayscale"
      );
    }

    return classes.filter(Boolean).join(" ");
  }

  get isExpanded(): boolean {
    return this.expanded();
  }

  get visibleConfig(): ItemDisplayConfig[] {
    return this.config.filter((c) => !c.showIf || c.showIf(this.item));
  }

  get hasDragHandle(): boolean {
    return this.visibleConfig.some((c) => c.type === "drag-handle");
  }

  get hasCheckbox(): boolean {
    return this.visibleConfig.some((c) => c.type === "checkbox");
  }

  get hasMenu(): boolean {
    return this.visibleConfig.some((c) => c.type === "menu");
  }

  toggleExpanded(event: MouseEvent): void {
    event.stopPropagation();
    this.expanded.update((v) => !v);
    this.expandToggle.emit();
  }

  onCardClick(event: MouseEvent): void {
    this.cardClick.emit({ event, id: this.itemId });
  }

  onCheckboxChange(checked: boolean): void {
    this.selectionChange.emit({ id: this.itemId, selected: checked });
  }

  onAction(action: string, event: MouseEvent): void {
    event.stopPropagation();
    this.actionClick.emit({ action, item: this.item, event });
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
}
