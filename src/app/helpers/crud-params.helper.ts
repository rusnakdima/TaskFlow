import { SyncMetadata } from "@models/sync-metadata";
import { RelationObj } from "@models/relation-obj.model";
import { RelationsHelper } from "@helpers/relations.helper";

export interface CrudParams {
  table: string;
  filter?: { [key: string]: any };
  data?: any;
  id?: string;
  parentTodoId?: string;
  relations?: RelationObj[];
  load?: string[];
  syncMetadata?: SyncMetadata;
}

const ALLOWED_TABLES = [
  "todos",
  "tasks",
  "subtasks",
  "categories",
  "chats",
  "comments",
  "profiles",
  "users",
];

export interface BuildCrudParamsOptions {
  filter?: { [key: string]: any };
  data?: any;
  id?: string;
  parentTodoId?: string;
  relations?: RelationObj[];
  load?: string[];
  isOwner?: boolean;
  isPrivate?: boolean;
}

export class CrudParamsBuilder {
  static build(
    table: string,
    options: BuildCrudParamsOptions,
    resolveMetadataFn: (table: string, todoId?: string, record?: any, id?: string) => SyncMetadata
  ): CrudParams {
    if (!ALLOWED_TABLES.includes(table)) {
      throw new Error(`Table '${table}' is not supported. Allowed: ${ALLOWED_TABLES.join(", ")}`);
    }

    const metadata =
      options.isOwner !== undefined
        ? { isOwner: options.isOwner, isPrivate: options.isPrivate ?? true }
        : resolveMetadataFn(
            table,
            options.parentTodoId || options.data?.todoId,
            options.data,
            options.id
          );

    const load = options.load;
    const relations = !load
      ? (options.relations ?? RelationsHelper.getRelationsForTable(table))
      : undefined;

    return {
      table,
      filter: options.filter,
      data: options.data,
      id: options.id,
      parentTodoId: options.parentTodoId,
      relations,
      load,
      syncMetadata: metadata,
    };
  }

  static buildRequestKey(
    operation: string,
    table: string,
    id?: string,
    filter?: { [key: string]: any }
  ): string {
    const filterKey = filter ? JSON.stringify(Object.entries(filter).sort()) : "no-filter";
    return `${operation}:${table}:${id || "no-id"}:${filterKey}`;
  }
}
