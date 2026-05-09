import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatButtonModule } from "@angular/material/button";
import { DragDropModule, CdkDragDrop } from "@angular/cdk/drag-drop";

import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { ItemExpandDetailsComponent } from "@components/item-expand-details/item-expand-details.component";
import { ItemDisplayConfig, ItemDisplayAction } from "@models/item-display.model";
import { DisplayMode } from "@models/item-display.types";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { ItemType } from "@models/base.model";

@Component({
  selector: "app-item-display",
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
  ],
  templateUrl: "./item-display.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemDisplayComponent {
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

  @Output() selectionChangeEvent = new EventEmitter<{ id: string; selected: boolean }>();
  @Output() cardClick = new EventEmitter<{ event: MouseEvent; id: string }>();
  @Output() itemAction = new EventEmitter<{ action: string; item: any }>();
  @Output() dropped = new EventEmitter<CdkDragDrop<any>>();

  showMenu = signal(false);
  expanded = signal(false);

  get itemId(): string {
    return this.item?.id || "";
  }

  get isCategory(): boolean {
    return this.itemType === "category";
  }

  get canExpand(): boolean {
    return this.expandable && !this.isCategory;
  }

  toggleExpanded(event: MouseEvent): void {
    event.stopPropagation();
    this.expanded.update((v) => !v);
  }

  get isExpanded(): boolean {
    return this.expanded();
  }

  get visibleConfig(): ItemDisplayConfig[] {
    return this.config.filter((c) => !c.showIf || c.showIf(this.item));
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
    if (config.onClick) {
      config.onClick(this.item, event);
    } else if (config.type === "menu") {
      this.showMenu.update((v) => !v);
    }
  }

  onAction(action: string): void {
    this.itemAction.emit({ action, item: this.item });
  }

  onDragDrop(event: CdkDragDrop<any>): void {
    this.dropped.emit(event);
  }

  trackByConfig(_index: number, config: ItemDisplayConfig): string {
    return config.key;
  }
}
