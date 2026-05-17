export type Visibility = "private" | "shared" | "public" | "all";

export interface CrudOptions {
  visibility?: Visibility | string;
  offline?: boolean;
  filter?: Record<string, any>;
  skip?: number;
  limit?: number;
  load?: string | string[];
  sort?: { [key: string]: number };
  page?: number;
}

export interface PaginatedOptions extends CrudOptions {
  limit?: number;
  skip?: number;
  todoId?: string;
  taskId?: string;
  load?: string | string[];
}

export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
}

export interface HasVisibility {
  visibility?: string;
  user_id?: string;
  assignees?: string[];
}

export interface HasId {
  id?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: "network" | "server" | "validation" | "offline",
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

export interface PaginationState {
  skip: number;
  limit: number;
  hasMore: boolean;
  visibility?: Visibility;
  filter?: Record<string, unknown>;
}
