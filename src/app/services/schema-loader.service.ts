import { Injectable, inject } from "@angular/core";
import { InvokeWrapperService } from "@tauri-front/shared";
import { invoke } from "@tauri-apps/api/core";
import { UiSchema } from "@tauri-front/shared";
import { Response } from "@tauri-front/shared";

@Injectable({ providedIn: "root" })
export class SchemaLoaderService {
  private invoke = inject(InvokeWrapperService);

  async getSchema(id: string): Promise<UiSchema | null> {
    try {
      const schema = await this.invoke.invoke<UiSchema | null>("get_schema", { id });
      return schema ?? null;
    } catch (e) {
      console.warn("[SchemaLoader] Failed to load schema:", e);
      return null;
    }
  }

  /** Canonical schema loader — uses get_ui_schema (data: Option<T>) */
  async getUiSchema(id: string): Promise<UiSchema | null> {
    try {
      const response = await invoke<Response<UiSchema>>("get_ui_schema", { id });
      return response.data ?? null;
    } catch (e) {
      console.warn("[SchemaLoader] Failed to load schema via get_ui_schema:", e);
      return null;
    }
  }

  async saveSchema(schema: UiSchema): Promise<boolean> {
    try {
      await this.invoke.invoke("save_schema", { schema });
      return true;
    } catch (e) {
      console.warn("[SchemaLoader] Failed to save schema:", e);
      return false;
    }
  }

  async getAllSchemas(): Promise<UiSchema[]> {
    try {
      const schemas = await this.invoke.invoke<UiSchema[]>("get_all_schemas", {});
      return schemas ?? [];
    } catch (e) {
      console.warn("[SchemaLoader] Failed to get all schemas:", e);
      return [];
    }
  }

  async deleteSchema(id: string): Promise<boolean> {
    try {
      await this.invoke.invoke("delete_schema", { id });
      return true;
    } catch (e) {
      console.warn("[SchemaLoader] Failed to delete schema:", e);
      return false;
    }
  }
}
