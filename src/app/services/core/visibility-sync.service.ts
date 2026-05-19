import { Injectable, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { ApiService } from "@services/api.service";
import { ApiService } from "@services/api.service";
import { Todo } from "@models/generated/api.types";

@Injectable({
  providedIn: "root",
})
export class VisibilitySyncService {
  private requestService = inject(ApiService);
  private apiService = inject(ApiService);

  async syncSingleTodoVisibilityChange(
    newVisibility: "private" | "shared",
    todo_id?: string
  ): Promise<void> {
    if (!todo_id) return;

    const todo = await firstValueFrom(this.apiService.todos.get(todo_id));
    if (!todo) {
      throw new Error(`Todo with id ${todo_id} not found`);
    }

    const currentVisibility = todo.visibility;
    if (currentVisibility === newVisibility) {
      return;
    }

    const source = currentVisibility === "private" ? "Json" : "Mongo";
    const target = newVisibility === "private" ? "Json" : "Mongo";

    await firstValueFrom(
      this.requestService.invokeCommand("sync_visibility_to_provider", {
        todo_id,
        entity_type: "todos",
        source_provider: source,
        target_provider: target,
      })
    );
  }
}
