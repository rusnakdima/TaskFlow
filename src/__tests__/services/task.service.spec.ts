import { describe, it, expect, vi, beforeEach } from "vitest";

/* ═══════════════════════════════════════════════════════════════════════════
   Use vi.hoisted to set up shared state BEFORE vi.mock calls run.
   This avoids the hoisting/TDZ issues with module-level const.
   ═══════════════════════════════════════════════════════════════════════════ */
const _hoistedState = vi.hoisted(() => {
  const map = new Map<any, any>();
  let globalVersion = 0;
  return {
    map,
    register: (token: any, instance: any) => {
      map.set(token, instance);
    },
    bumpVersion: () => {
      globalVersion++;
    },
    getVersion: () => globalVersion,
  };
});
const injectionMap = _hoistedState.map;

/* Declare first so mock factories (evaluated lazily) can reference it */
let registerInjection: (token: any, instance: any) => void;
registerInjection = _hoistedState.register;

const getInjection = <T>(token: any): T => injectionMap.get(token) as T;

/* ── Pre-create instances that must exist before any mock factory runs ── */
const cascadeServiceInstance = vi.hoisted(() => ({
  computeCascadeForTodo: vi.fn().mockReturnValue({ taskIds: [], subtaskIds: [] }),
  computeCascadeForTask: vi.fn().mockReturnValue({ subtaskIds: [] }),
}));

// Create Injector instance directly (not a vi.hoisted mock)
const injectorInstance = {
  get(token: any) {
    return injectionMap.get(token);
  },
};
// Register Injector so inject(Injector) returns a working injector
registerInjection("Injector" as any, injectorInstance);

/* ── mock @tauri-apps/api/core ── */
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({}),
}));

/* ── mock @tauri-front/shared ── */
vi.mock("@tauri-front/shared", () => ({
  SchemaRouteViewerComponent: {},
  SchemaSetupService: class {
    schemaLoaded = { value: false, signal: vi.fn(() => ({ value: false })) };
    setupError = { value: null, signal: vi.fn(() => ({ value: null })) };
    setup = vi.fn().mockResolvedValue(null);
    setRouter = vi.fn();
    toAngularRoutes = vi.fn().mockReturnValue([]);
  },
  deduplicateById: vi.fn((arr: unknown[]) => arr),
  groupByKey: vi.fn(() => new Map()),
}));

/* ── mock helpers ── */
vi.mock("@helpers/timestamp.helper", () => ({
  TimestampHelper: { createTimestamp: () => "2024-01-01T00:00:00.000Z" },
  DEFAULT_CACHE_TTL_MS: 5000,
}));

/* ── mock entity types ── */
vi.mock("@entities/generated/api.types", () => ({
  Todo: Object,
  User: Object,
  Profile: Object,
  Room: Object,
  Task: Object,
  TaskStatus: { PENDING: "pending" },
  Subtask: Object,
  Comment: Object,
  Chat: Object,
}));

vi.mock("@entities/storage.model", () => ({
  EntityType: "",
  VisibilityFilter: "",
  Operation: "",
  ChatOperation: "",
  ParentType: "",
  ChildType: "",
  PaginationState: {},
}));

vi.mock("@entities/storage-signal-map.model", () => ({
  StorageSignalMap: {},
}));



/* ── mock CascadeService ── */
vi.mock("@core/services/cascade.service", () => {
  class CascadeService {}
  // Use pre-created instance from vi.hoisted to avoid vi.clearAllMocks() issues
  _hoistedState.register(CascadeService, cascadeServiceInstance);
  return { CascadeService };
});

vi.mock("@core/services/admin-data.service", () => ({
  AdminDataWithRelations: {},
}));

/* ── mock BaseStorageService ── */
vi.mock("@core/services/storage-entity.service", () => {
  // Angular signals: tasks() → value (call to get), tasks.value → value (property getter).
  // The signal is a callable function; .value is a property on that function.
  const mkSignal = (initial: unknown[]) => {
    let value = initial;
    // sig() returns value; sig.value getter returns value
    const sig: any = () => value;
    Object.defineProperty(sig, "value", {
      get: () => value,
      set: (v: unknown) => {
        value = v;
      },
    });
    sig.set = vi.fn((v: unknown) => {
      value = v;
      _hoistedState.bumpVersion();
    });
    sig.update = vi.fn((fn: (v: unknown) => unknown) => {
      value = fn(value);
    });
    sig.asReadonly = () => ({
      get value() {
        return value;
      },
    });
    return sig;
  };
  class BaseStorageService {
    todos = mkSignal([]);
    tasks = mkSignal([]);
    subtasks = mkSignal([]);
    comments = mkSignal([]);
    chats = mkSignal([]);
    categories = mkSignal([]);
    profiles = mkSignal([]);
    publicProfiles = mkSignal([]);
    users = mkSignal([]);
    rooms = mkSignal([]);
    localCategories = mkSignal([]);
    cloudCategories = mkSignal([]);
    privateTodos = mkSignal([]);
    sharedTodos = mkSignal([]);
    publicTodos = mkSignal([]);
    clearEntitySignals = function (this: any) {
      this.todos.set([]);
      this.tasks.set([]);
      this.subtasks.set([]);
      this.comments.set([]);
      this.chats.set([]);
      this.categories.set([]);
      this.profiles.set([]);
    };
    addEntity = function (this: any, entityName: string, data: Record<string, unknown>) {
      const signalMap: Record<string, any> = {
        todos: this.todos,
        tasks: this.tasks,
        subtasks: this.subtasks,
        comments: this.comments,
        chats: this.chats,
        categories: this.categories,
        profiles: this.profiles,
        users: this.users,
      };
      const sig = signalMap[entityName];
      if (!sig) return;
      sig.set([...sig(), data]);
    };
    updateEntity = function (this: any, entityName: string, data: Record<string, unknown>) {
      const signalMap: Record<string, any> = {
        todos: this.todos,
        tasks: this.tasks,
        subtasks: this.subtasks,
        comments: this.comments,
        chats: this.chats,
        categories: this.categories,
        profiles: this.profiles,
        users: this.users,
      };
      const sig = signalMap[entityName];
      if (!sig) return;
      const id = data.id as string;
      const changes = { ...data };
      delete changes.id;
      const items = sig();
      const idx = items.findIndex((e: any) => e.id === id);
      if (idx === -1) return;
      // Mutate in place so stored object refs see the change
      Object.assign(items[idx], changes);
      sig.set([...items]);
    };
    removeEntity = function (this: any, entityName: string, id: string) {
      const signalMap: Record<string, any> = {
        todos: this.todos,
        tasks: this.tasks,
        subtasks: this.subtasks,
        comments: this.comments,
        chats: this.chats,
        categories: this.categories,
        profiles: this.profiles,
        users: this.users,
      };
      const sig = signalMap[entityName];
      if (!sig) return;
      sig.set(sig().filter((e: any) => e.id !== id));
    };
    addCommentToTask = vi.fn();
    addCommentToSubtask = vi.fn();
    removeCommentFromAll = vi.fn();
    bulkUpsertSubtasks = vi.fn();
    updateChat = vi.fn();
    updateChatByTempId = vi.fn();
    updateChatSyncStatus = vi.fn();
    getCurrentUser = vi.fn().mockReturnValue(null);
  }
  const instance = new BaseStorageService();
  _hoistedState.register(BaseStorageService, instance);
  return { BaseStorageService };
});

/* ── mock StorageCacheService ── */
vi.mock("@core/services/storage-cache.service", () => {
  const mkSignal = (initial: unknown) => {
    let value = initial;
    const sig: any = () => value;
    Object.defineProperty(sig, "value", {
      get: () => value,
      set: (v: unknown) => {
        value = v;
      },
    });
    sig.set = vi.fn((v: unknown) => {
      value = v;
      _hoistedState.bumpVersion();
    });
    sig.update = vi.fn((fn: (v: unknown) => unknown) => {
      value = fn(value);
    });
    return sig;
  };
  class StorageCacheService {
    cacheInvalidated = mkSignal(false);
    hasReactiveCache = vi.fn().mockReturnValue(false);
    getReactiveCache = vi.fn();
    setReactiveCache = vi.fn();
    hasTasksCache = vi.fn().mockReturnValue(false);
    getTasksCache = vi.fn();
    setTasksCache = vi.fn();
    setChatCache = vi.fn();
    setCacheTimestamp = vi.fn();
    isCacheValid = vi.fn().mockReturnValue(false);
    isCacheFull = vi.fn().mockReturnValue(false);
    evictOldestCache = vi.fn();
    invalidateCache = vi.fn();
    clearAll = vi.fn();
  }
  const instance = new StorageCacheService();
  _hoistedState.register(StorageCacheService, instance);
  return { StorageCacheService };
});

/* ── mock StorageQueryService ── */
vi.mock("@core/services/storage-query.service", () => {
  const mkSignal = (initial: unknown) => {
    let value = initial;
    const sig: any = () => value;
    Object.defineProperty(sig, "value", {
      get: () => value,
      set: (v: unknown) => {
        value = v;
      },
    });
    sig.set = vi.fn((v: unknown) => {
      value = v;
      _hoistedState.bumpVersion();
    });
    sig.update = vi.fn((fn: (v: unknown) => unknown) => {
      value = fn(value);
    });
    return sig;
  };
  class StorageQueryService {
    loading = mkSignal(false);
    loaded = mkSignal(false);
    lastLoaded = mkSignal(null);
    allProfiles = mkSignal([]);
    user = mkSignal(null);
    dailyActivities = mkSignal([]);
    isEntityLoading = vi.fn().mockReturnValue(false);
    findById = vi.fn((type: string, id: string) => {
      const entityService = injectionMap.get("BaseStorageService");
      if (!entityService) return undefined;
      const signalMap: Record<string, any> = {
        tasks: entityService.tasks,
        subtasks: entityService.subtasks,
        comments: entityService.comments,
        todos: entityService.todos,
        chats: entityService.chats,
        categories: entityService.categories,
      };
      const sig = signalMap[type];
      if (!sig) return undefined;
      const items = sig();
      return items.find((e: any) => e.id === id);
    });
    query = vi.fn().mockReturnValue([]);
    setCollection = vi.fn();
    setCollectionByTable = vi.fn();
    setLoaded = vi.fn();
    setLastLoaded = vi.fn();
    setAllProfiles = vi.fn();
    setUser = vi.fn();
    setDailyActivities = vi.fn();
    loadInitialData = vi.fn();
    loadMoreData = vi.fn();
    loadAdminData = vi.fn();
    loadMoreTodos = vi.fn();
    loadMoreTasks = vi.fn();
    loadMoreSubtasks = vi.fn();
    loadMoreComments = vi.fn();
    loadMoreCategories = vi.fn();
    loadMoreChats = vi.fn();
    ensureTodosLoaded = vi.fn();
    ensureTasksLoaded = vi.fn();
    ensureSubtasksLoaded = vi.fn();
    ensureChatsLoaded = vi.fn();
    ensureCategoriesLoaded = vi.fn();
    ensureTaskCommentsLoaded = vi.fn();
    ensureSubtaskCommentsLoaded = vi.fn();
    ensureCommentsLoaded = vi.fn();
    ensureUserLoaded = vi.fn();
    ensureProfileLoaded = vi.fn();
    ensurePublicProfilesLoaded = vi.fn();
    getTodosByVisibility = vi.fn().mockReturnValue([]);
    getTodosWithNestedTasks = vi.fn().mockReturnValue([]);
    getTasksWithNestedSubtasks = vi.fn().mockReturnValue([]);
    getSubtasksWithNestedComments = vi.fn().mockReturnValue([]);
    getUnreadChatCount = vi.fn().mockReturnValue(0);
    getUsername = vi.fn().mockReturnValue("testuser");
    subtaskExists = vi.fn().mockReturnValue(false);
    subtaskCountByTaskId = vi.fn().mockReturnValue(0);
    isPrivateData = vi.fn().mockReturnValue(false);
    canAccessOffline = vi.fn().mockReturnValue(true);
    isCacheValid = vi.fn().mockReturnValue(true);
  }
  const instance = new StorageQueryService();
  _hoistedState.register(StorageQueryService, instance);
  return { StorageQueryService };
});

/* ── mock MongoConnectionService ── */
vi.mock("@core/services/mongo-connection.service", () => {
  class MongoConnectionService {
    checkConnection = vi.fn().mockReturnValue({ subscribe: (fn: Function) => fn(true) });
  }
  const instance = new MongoConnectionService();
  _hoistedState.register(MongoConnectionService, instance);
  return { MongoConnectionService };
});

/* ── mock NotifyService ── */
vi.mock("@services/notifications/notify.service", () => {
  class NotifyService {
    handleLocalAction = vi.fn();
  }
  const instance = new NotifyService();
  _hoistedState.register(NotifyService, instance);
  return { NotifyService };
});

/* ── mock store utils ── */
vi.mock("@store/utils/store-helpers", () => {
  // real createGroupedMap implementation for mock
  const realCreateGroupedMap = (
    arr: any[],
    keyFn: (item: any) => string,
    filterFn?: (item: any) => boolean
  ) => {
    const map = new Map<string, any[]>();
    arr.forEach((item) => {
      if (filterFn && !filterFn(item)) return;
      const key = keyFn(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return map;
  };
  return {
    deduplicateById: vi.fn((arr: unknown[]) => arr),
    createGroupedMap: vi.fn(
      (arr: unknown[], keyFn: (item: any) => string, filterFn?: (item: any) => boolean) =>
        realCreateGroupedMap(arr as any[], keyFn, filterFn)
    ),
    upsertEntityBulk: vi.fn((existing: unknown[], newOnes: unknown[]) => [...existing, ...newOnes]),
  };
});

/* ═══════════════════════════════════════════════════════════════════════════
   Imports
   ═══════════════════════════════════════════════════════════════════════════ */
import { StorageService } from "@services/storage.service";
import { BaseStorageService } from "@core/services/storage-entity.service";
import { StorageCacheService } from "@core/services/storage-cache.service";
import { StorageQueryService } from "@core/services/storage-query.service";
import { MongoConnectionService } from "@core/services/mongo-connection.service";
import { NotifyService } from "@services/notifications/notify.service";

/* ── Test helpers ── */
function makeTask(id: string, todo_id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    todo_id,
    title: `Task ${id}`,
    status: "pending",
    deleted_at: null,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSubtask(id: string, task_id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    task_id,
    title: `Subtask ${id}`,
    deleted_at: null,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeComment(id: string, task_id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    task_id,
    subtask_id: null,
    content: `Comment ${id}`,
    deleted_at: null,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createService(overrides?: {
  tasks?: unknown[];
  todos?: unknown[];
  subtasks?: unknown[];
  comments?: unknown[];
}): StorageService {
  const entityService = getInjection<InstanceType<typeof BaseStorageService>>(BaseStorageService);
  const cacheService = getInjection<InstanceType<typeof StorageCacheService>>(StorageCacheService);
  const queryService = getInjection<InstanceType<typeof StorageQueryService>>(StorageQueryService);
  const mongo = getInjection<InstanceType<typeof MongoConnectionService>>(MongoConnectionService);
  const notifyService = getInjection<any>(NotifyService);

  const injector = {
    get: vi.fn((t: any) => injectionMap.get(t) ?? null),
  } as any;

  if (overrides?.tasks) entityService.tasks.set(overrides.tasks);
  if (overrides?.todos) entityService.todos.set(overrides.todos);
  if (overrides?.subtasks) entityService.subtasks.set(overrides.subtasks);
  if (overrides?.comments) entityService.comments.set(overrides.comments);

  return new StorageService(
    injector as any,
    entityService as any,
    cacheService as any,
    queryService as any,
    mongo as any
  );
}

describe("StorageService – task operations", () => {
  beforeEach(() => {
    // Reset signals between tests (do NOT call vi.clearAllMocks() — it clears mock state on hoisted objects)
    const entityService = getInjection<any>(BaseStorageService);
    if (entityService) {
      entityService.tasks.set([]);
      entityService.subtasks.set([]);
      entityService.comments.set([]);
      entityService.todos.set([]);
    }
  });

  describe("tasks computed signal", () => {
    it("should expose only non-deleted tasks", () => {
      const service = createService({
        tasks: [makeTask("t1", "todo1"), makeTask("t2", "todo1", { deleted_at: "2024-01-01" })],
      });
      expect(service.tasks()).toHaveLength(1);
      expect(service.tasks()[0].id).toBe("t1");
    });

    it("should return empty array when no tasks", () => {
      const service = createService({ tasks: [] });
      expect(service.tasks()).toHaveLength(0);
    });
  });

  describe("getTaskById", () => {
    it("should return task by id", () => {
      const service = createService({ tasks: [makeTask("t1", "todo1"), makeTask("t2", "todo1")] });
      expect(service.getTaskById("t1")?.id).toBe("t1");
    });

    it("should return undefined for unknown id", () => {
      const service = createService({ tasks: [makeTask("t1", "todo1")] });
      expect(service.getTaskById("non-existent")).toBeUndefined();
    });
  });

  describe("getTasksByTodoId", () => {
    it("should return tasks for a given todo", () => {
      const service = createService({
        tasks: [makeTask("t1", "todo1"), makeTask("t2", "todo1"), makeTask("t3", "todo2")],
      });
      expect(service.getTasksByTodoId("todo1")).toHaveLength(2);
      expect(service.getTasksByTodoId("todo2")).toHaveLength(1);
    });

    it("should return empty array for unknown todo", () => {
      const service = createService({ tasks: [] });
      expect(service.getTasksByTodoId("unknown")).toHaveLength(0);
    });
  });

  describe("getSubtasksByTaskId", () => {
    it("should return subtasks for a task", () => {
      const service = createService({
        subtasks: [makeSubtask("s1", "t1"), makeSubtask("s2", "t1"), makeSubtask("s3", "t2")],
      });
      expect(service.getSubtasksByTaskId("t1")).toHaveLength(2);
      expect(service.getSubtasksByTaskId("t2")).toHaveLength(1);
    });
  });

  describe("getCommentsByTaskId", () => {
    it("should return comments for a task", () => {
      const service = createService({
        comments: [makeComment("c1", "t1"), makeComment("c2", "t2")],
      });
      expect(service.getCommentsByTaskId("t1")).toHaveLength(1);
    });
  });

  describe("taskMap", () => {
    it("should be a Map keyed by task id", () => {
      const service = createService({ tasks: [makeTask("t1", "todo1")] });
      const map = service.taskMap();
      expect(map).toBeInstanceOf(Map);
      expect(map.get("t1")).toBeDefined();
    });
  });

  describe("tasksByTodoId", () => {
    it("should group tasks by todo_id", () => {
      const service = createService({
        tasks: [makeTask("t1", "todo1"), makeTask("t2", "todo1"), makeTask("t3", "todo2")],
      });
      const grouped = service.tasksByTodoId();
      expect(grouped.get("todo1")).toHaveLength(2);
      expect(grouped.get("todo2")).toHaveLength(1);
    });
  });

  describe("pendingTasksCount", () => {
    it("should count PENDING tasks", () => {
      const service = createService({
        tasks: [
          makeTask("t1", "todo1", { status: "pending" }),
          makeTask("t2", "todo1", { status: "done" }),
          makeTask("t3", "todo1", { status: "pending" }),
        ],
      });
      expect(service.pendingTasksCount).toBe(2);
    });
  });

  describe("modify – task update", () => {
    it("should update a task by id", () => {
      const service = createService({ tasks: [makeTask("t1", "todo1")] });
      service.modify("tasks", "update", { id: "t1", title: "New Title" });
      expect((service.getTaskById("t1") as any)?.title).toBe("New Title");
    });
  });

  describe("modify – task create", () => {
    it("should add a new task", () => {
      const service = createService({ tasks: [] });
      service.modify("tasks", "create", makeTask("tnew", "todo1"));
      expect(service.tasks()).toHaveLength(1);
      expect(service.tasks()[0].id).toBe("tnew");
    });
  });

  describe("removeRecord – task", () => {
    it("should remove task from the signal", () => {
      const service = createService({ tasks: [makeTask("t1", "todo1"), makeTask("t2", "todo1")] });
      service.removeRecord("tasks", "t1");
      expect(service.tasks()).toHaveLength(1);
      expect(service.tasks()[0].id).toBe("t2");
    });
  });

  describe("removeRecordWithCascade – task", () => {
    it("should soft-delete task when deletedAt is provided", () => {
      const service = createService({
        tasks: [makeTask("t1", "todo1")],
        subtasks: [makeSubtask("s1", "t1")],
      });
      service.removeRecordWithCascade("tasks", "t1", "2024-06-01T00:00:00.000Z");
      // Task is soft-deleted: removed from active tasks, but still in the signal array
      const archived = service.archivedTasks();
      expect(archived.find((t) => (t as any).id === "t1")).toBeDefined();
    });
  });

  describe("updateRecordDeleteStatusWithCascade – task", () => {
    it("should mark task as deleted when deletedAt=true", () => {
      const service = createService({ tasks: [makeTask("t1", "todo1")] });
      service.updateRecordDeleteStatusWithCascade("tasks", "t1", true);
      // Task is soft-deleted: not in active tasks, but in the signal array with deleted_at set
      const archived = service.archivedTasks();
      expect(archived.find((t) => (t as any).id === "t1")).toBeDefined();
    });

    it("should restore task when deletedAt=false", () => {
      const service = createService({
        tasks: [makeTask("t1", "todo1", { deleted_at: "2024-01-01", updated_at: "2024-01-01" })],
      });
      service.updateRecordDeleteStatusWithCascade("tasks", "t1", false);
      const task: any = service.getTaskById("t1");
      expect(task.deleted_at).toBeUndefined();
    });
  });

  describe("restoreRecordWithCascade – task", () => {
    it("should restore a soft-deleted task", () => {
      const service = createService({
        tasks: [makeTask("t1", "todo1", { deleted_at: "2024-01-01", updated_at: "2024-01-01" })],
      });
      service.restoreRecordWithCascade("tasks", "t1");
      const task: any = service.getTaskById("t1");
      expect(task.deleted_at).toBeUndefined();
    });
  });

  describe("archivedTasks", () => {
    it("should include only deleted tasks", () => {
      const service = createService({
        tasks: [makeTask("t1", "todo1"), makeTask("t2", "todo1", { deleted_at: "2024-01-01" })],
      });
      const archived = service.archivedTasks();
      expect(archived).toHaveLength(1);
      expect(archived[0].id).toBe("t2");
    });
  });

  describe("clear", () => {
    it("should reset tasks signal to empty", () => {
      const service = createService({ tasks: [makeTask("t1", "todo1")] });
      service.clear();
      expect(service.tasks()).toHaveLength(0);
    });
  });

  describe("getTasks", () => {
    it("should return current tasks without triggering load when tasks exist", () => {
      const service = createService({ tasks: [makeTask("t1", "todo1")] });
      const tasks = service.getTasks("private");
      expect(tasks).toHaveLength(1);
    });
  });
});
