import { Injectable, inject } from "@angular/core";
import { TauriApiService } from "@app/api/tauri-api.service";
import { UiSchema } from "@tauri-front/shared";

@Injectable({ providedIn: "root" })
export class SchemaLoaderService {
  private api = inject(TauriApiService);

  async getSchema(id: string): Promise<UiSchema | null> {
    try {
      const schema = await this.api.invokeWithArgs<UiSchema | null>("get_schema", { id });
      return schema ?? null;
    } catch (e) {
      console.warn("[SchemaLoader] Failed to load schema:", e);
      return null;
    }
  }

  async saveSchema(schema: UiSchema): Promise<boolean> {
    try {
      await this.api.invokeWithArgs("save_schema", { schema });
      return true;
    } catch (e) {
      console.warn("[SchemaLoader] Failed to save schema:", e);
      return false;
    }
  }

  async getAllSchemas(): Promise<UiSchema[]> {
    try {
      const schemas = await this.api.invokeWithArgs<UiSchema[]>("get_all_schemas", {});
      return schemas ?? [];
    } catch (e) {
      console.warn("[SchemaLoader] Failed to get all schemas:", e);
      return [];
    }
  }

  async deleteSchema(id: string): Promise<boolean> {
    try {
      await this.api.invokeWithArgs("delete_schema", { id });
      return true;
    } catch (e) {
      console.warn("[SchemaLoader] Failed to delete schema:", e);
      return false;
    }
  }
}
