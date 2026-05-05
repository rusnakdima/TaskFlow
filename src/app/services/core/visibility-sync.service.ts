import { Injectable, Injector, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { ApiProvider } from "@providers/api.provider";
import { DataService } from "@services/data/data.service";

@Injectable({
  providedIn: "root",
})
export class VisibilitySyncService {
  private injector = inject(Injector);
  private dataService = inject(DataService);

  private get apiProvider(): ApiProvider {
    return this.injector.get(ApiProvider);
  }

  async syncSingleTodoVisibilityChange(
    newVisibility: "private" | "shared",
    todo_id?: string
  ): Promise<void> {
    if (!todo_id) return;

    const todo = await firstValueFrom(this.dataService.getTodo(todo_id));
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
      this.apiProvider.invokeCommand("sync_visibility_to_provider", {
        todo_id,
        source_provider: source,
        target_provider: target,
      })
    );
  }
}
