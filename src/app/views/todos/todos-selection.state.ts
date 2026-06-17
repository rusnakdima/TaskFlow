import { Injectable, signal, inject } from "@angular/core";
import { Todo } from "@models/generated/api.types";
import { TodosStateService } from "@components/todos/todos-filters/todos-state.service";

@Injectable({ providedIn: "root" })
export class TodosSelectionStateService {
  private stateService = inject(TodosStateService);

  selectedTodos = signal<Set<string>>(new Set());

  toggleTodoSelection(event: { id: string; selected: boolean }): void {
    const { id, selected } = event;
    this.selectedTodos.update((todoIds) => {
      const newSelected = new Set(todoIds);
      if (selected) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      return newSelected;
    });
  }

  onTableSelectAll(event: { selectAll: boolean; section?: "private" | "shared" | "public" }): void {
    const { selectAll, section } = event;
    this.selectedTodos.update((todoIds) => {
      const newSelected = new Set(todoIds);
      const groupedTodos = this.stateService.groupedTodos();
      const allTodos = this.stateService.listTodos();
      if (section) {
        const sectionTodos = groupedTodos[section];
        if (selectAll) {
          sectionTodos.forEach((todo: Todo) => newSelected.add(todo.id));
        } else {
          sectionTodos.forEach((todo: Todo) => newSelected.delete(todo.id));
        }
      } else {
        if (selectAll) {
          allTodos.forEach((todo: Todo) => newSelected.add(todo.id));
        } else {
          allTodos.forEach((todo: Todo) => newSelected.delete(todo.id));
        }
      }
      return newSelected;
    });
  }
}
