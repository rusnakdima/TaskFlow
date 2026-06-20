import { signal, inject } from "@angular/core";
import { BulkActionService } from "@services/bulk-action.service";
import { Task } from "@entities/generated/api.types";
export class TasksSelectionState {
  private bulkService = inject(BulkActionService);
  highlightTaskId = signal<string | null>(null);
  selectedTasks = signal<Set<string>>(new Set());
  lastSelectedId = signal<string | null>(null);
  toggleTaskSelection(event: { id: string; selected: boolean }): void {
    const { id, selected } = event;
    if (selected) {
      this.lastSelectedId.set(id);
    }
    this.selectedTasks.update((selectedIds) => {
      const newSelected = new Set(selectedIds);
      if (selected) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      this.bulkService.setSelectionState(newSelected.size, false);
      return newSelected;
    });
  }
  onTableSelectAll(selectAll: boolean, listTasks: () => Task[]): void {
    this.selectedTasks.update((taskIds) => {
      const newSelected = new Set(taskIds);
      if (selectAll) {
        listTasks().forEach((task) => newSelected.add(task.id));
      } else {
        listTasks().forEach((task) => newSelected.delete(task.id));
      }
      return newSelected;
    });
  }
  clearSelection(): void {
    this.selectedTasks.set(new Set());
    this.lastSelectedId.set(null);
    this.bulkService.setSelectionState(0, false);
  }
}
