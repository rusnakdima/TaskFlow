/* sys lib */
import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  Signal,
  computed,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { ViewModeSwitcherComponent } from "@components/view-mode-switcher/view-mode-switcher.component";

/* models */
import { ViewMode } from "@models/view-mode.model";

@Component({
  selector: "app-list-toolbar",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    CheckboxComponent,
    ViewModeSwitcherComponent,
  ],
  templateUrl: "./list-toolbar.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListToolbarComponent {
  @Input() itemType: "task" | "todo" | "subtask" | "category" = "task";
  @Input() showInfoToggle: boolean = false;
  @Input() showInfo: Signal<boolean> | boolean = false;
  @Input() newItemLabel: string = "New Item";
  @Input() newItemRoute: string = "";
  @Input() isAllSelected: Signal<boolean> | boolean = false;
  @Input() indeterminate: Signal<boolean> | boolean = false;
  @Input() highlight: Signal<boolean> | boolean = false;
  @Input() showFilter: Signal<boolean> | boolean = false;
  @Input() viewMode: Signal<ViewMode> | ViewMode = "grid";
  @Input() selectionCount: Signal<number> | number = 0;
  @Input() pageKey: string = "default";

  @Output() toggleInfo = new EventEmitter<void>();
  @Output() toggleSelectAll = new EventEmitter<void>();
  @Output() toggleFilter = new EventEmitter<void>();
  @Output() newItem = new EventEmitter<void>();
  @Output() viewModeChange = new EventEmitter<ViewMode>();

  protected getInfoLabel = computed(() =>
    this.getSignalValue(this.showInfo) ? "Hide Info" : "Show Info"
  );
  protected getFilterIcon = computed(() =>
    this.getSignalValue(this.showFilter) ? "filter_list_off" : "filter_list"
  );
  protected getSelectText = computed(() => {
    const allSelected = this.getSignalValue(this.isAllSelected);
    const count = this.getSignalValue(this.selectionCount);
    if (allSelected) return "Deselect All";
    return count > 0 ? "Clear Selection" : "Select All";
  });
  protected getTextColor = computed(() => {
    const count = this.getSignalValue(this.selectionCount);
    const allSelected = this.getSignalValue(this.isAllSelected);
    return count > 0 && !allSelected ? "text-yellow-700 dark:text-yellow-400" : "textNormal";
  });
  protected getIsAllSelected = computed(() => this.getSignalValue(this.isAllSelected));
  protected getIndeterminate = computed(() => this.getSignalValue(this.indeterminate));
  protected getHighlight = computed(() => this.getSignalValue(this.highlight));
  protected getViewMode = computed(() => this.getSignalValue(this.viewMode) as ViewMode);
  protected getShowFilter = computed(() => this.getSignalValue(this.showFilter));

  private getSignalValue<T>(value: Signal<T> | T): T {
    if (typeof value === "function") {
      return (value as () => T)();
    }
    return value;
  }

  onToggleInfo(): void {
    this.toggleInfo.emit();
  }

  onToggleSelectAll(): void {
    this.toggleSelectAll.emit();
  }

  onToggleFilter(): void {
    this.toggleFilter.emit();
  }

  onNewItem(): void {
    this.newItem.emit();
  }

  onViewModeChange(mode: ViewMode): void {
    this.viewModeChange.emit(mode);
  }
}
