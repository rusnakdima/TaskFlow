/**
 * Relation configuration for TypeORM-like dot notation
 *
 * Usage example:
 * ```typescript
 * this.dataSyncProvider.crud<Todo>("get", "todos", {
 *   filter: { id: todoId },
 *   load: TodoRelations.loadAll,  // or specific paths
 * });
 * ```
 */

/**
 * Available relation paths for todos
 */
export const TodoRelations = {
  /** Load user relation */
  user: ["user"],

  /** Load tasks with all nested relations (subtasks, comments) */
  tasks: ["tasks", "tasks.subtasks", "tasks.subtasks.comments", "tasks.comments"],

  /** Load categories */
  categories: ["categories"],

  /** Load assignees with their user data */
  assignees: ["assigneesProfiles", "assigneesProfiles.user"],

  /** Load all relations (use sparingly - may cause performance issues) */
  loadAll: [
    "user",
    "user.profile",
    "tasks",
    "tasks.subtasks",
    "tasks.subtasks.comments",
    "tasks.comments",
    "categories",
    "assigneesProfiles",
    "assigneesProfiles.user",
  ],

  /** Load tasks only (without nested relations) */
  loadTasksOnly: ["tasks"],

  /** Load minimal relations for lists */
  loadMinimal: ["user", "categories"],

  // ==================== SELECTOR FUNCTIONS ====================
  /**
   * Selector functions for common relation loading patterns
   * These provide a more intuitive API and can accept parameters
   */

  /**
   * Load todo with tasks and optionally subtasks
   * @param includeSubtasks - Whether to include subtasks (default: true)
   * @param includeComments - Whether to include comments (default: false)
   */
  withTasks: (includeSubtasks: boolean = true, includeComments: boolean = false): string[] => [
    "tasks",
    ...(includeSubtasks
      ? ((includeComments
          ? ["tasks.subtasks", "tasks.subtasks.comments", "tasks.comments"]
          : ["tasks.subtasks"]) as string[])
      : []),
    ...(includeComments && !includeSubtasks ? ["tasks.comments"] : []),
  ],

  /**
   * Load todo with categories only
   */
  withCategories: (): string[] => ["categories"],

  /**
   * Load todo with user only
   */
  withUser: (): string[] => ["user"],

  /**
   * Load todo with assignees and optionally their user data
   * @param includeUserData - Whether to include assignee user data (default: true)
   */
  withAssignees: (includeUserData: boolean = true): string[] =>
    includeUserData ? ["assigneesProfiles", "assigneesProfiles.user"] : ["assigneesProfiles"],

  /**
   * Load todo for detail view (all relations except heavy ones)
   */
  forDetailView: (): string[] => [
    "user",
    "tasks",
    "tasks.subtasks",
    "tasks.comments",
    "categories",
  ],

  /**
   * Load todo for list view (minimal relations)
   */
  forListView: (): string[] => ["user", "categories"],

  /**
   * Load todo for kanban view (tasks with subtasks for progress)
   */
  forKanbanView: (): string[] => ["tasks", "tasks.subtasks", "categories"],
};

/**
 * Available relation paths for tasks
 */
export const TaskRelations = {
  /** Load todo relation */
  todo: ["todo"],

  /** Load subtasks with comments */
  subtasks: ["subtasks", "subtasks.comments"],

  /** Load comments */
  comments: ["comments"],

  /** Load all relations */
  loadAll: ["todo", "subtasks", "subtasks.comments", "comments"],

  /** Load minimal relations for lists */
  loadMinimal: ["subtasks"],

  // ==================== SELECTOR FUNCTIONS ====================
  /**
   * Load task with todo relation
   */
  withTodo: (): string[] => ["todo"],

  /**
   * Load task with subtasks and optionally comments
   * @param includeComments - Whether to include comments (default: false)
   */
  withSubtasks: (includeComments: boolean = false): string[] =>
    includeComments ? ["subtasks", "subtasks.comments"] : ["subtasks"],

  /**
   * Load task with comments only
   */
  withComments: (): string[] => ["comments"],

  /**
   * Load task for detail view
   */
  forDetailView: (): string[] => ["todo", "subtasks", "subtasks.comments", "comments"],

  /**
   * Load task for list view (minimal)
   */
  forListView: (): string[] => ["subtasks"],
};

/**
 * Available relation paths for subtasks
 */
export const SubtaskRelations = {
  /** Load task relation */
  task: ["task"],

  /** Load comments */
  comments: ["comments"],

  /** Load all relations */
  loadAll: ["task", "comments"],

  // ==================== SELECTOR FUNCTIONS ====================
  /**
   * Load subtask with task relation
   */
  withTask: (): string[] => ["task"],

  /**
   * Load subtask with comments
   */
  withComments: (): string[] => ["comments"],

  /**
   * Load subtask for detail view
   */
  forDetailView: (): string[] => ["task", "comments"],
};

/**
 * Available relation paths for profiles
 */
export const ProfileRelations = {
  /** Load user relation */
  user: ["user"],

  /** Load all relations */
  loadAll: ["user"],

  // ==================== SELECTOR FUNCTIONS ====================
  /**
   * Load profile with user data
   */
  withUser: (): string[] => ["user"],

  /**
   * Load profile for detail view
   */
  forDetailView: (): string[] => ["user"],
};

/**
 * Available relation paths for users
 */
export const UserRelations = {
  /** Load profile relation */
  profile: ["profile"],

  /** Load all relations */
  loadAll: ["profile"],

  // ==================== SELECTOR FUNCTIONS ====================
  /**
   * Load user with profile
   */
  withProfile: (): string[] => ["profile"],
};

/**
 * Available relation paths for categories
 */
export const CategoryRelations = {
  /** Load user relation */
  user: ["user"],

  /** Load all relations */
  loadAll: ["user"],

  // ==================== SELECTOR FUNCTIONS ====================
  /**
   * Load category with user
   */
  withUser: (): string[] => ["user"],
};

/**
 * Available relation paths for comments
 */
export const CommentRelations = {
  /** Load task relation */
  task: ["task"],

  /** Load subtask relation */
  subtask: ["subtask"],

  /** Load all relations */
  loadAll: ["task", "subtask"],

  // ==================== SELECTOR FUNCTIONS ====================
  /**
   * Load comment with task
   */
  withTask: (): string[] => ["task"],

  /**
   * Load comment with subtask
   */
  withSubtask: (): string[] => ["subtask"],
};

/**
 * Helper function to get relations for a table
 * @param table - Table name
 * @param includeAll - Whether to include all relations or minimal
 * @returns Array of relation paths or undefined if table not found
 */
export function getRelationsForTable(
  table: string,
  includeAll: boolean = false
): string[] | undefined {
  switch (table) {
    case "todos":
      return includeAll ? TodoRelations.loadAll : TodoRelations.loadMinimal;
    case "tasks":
      return includeAll ? TaskRelations.loadAll : TaskRelations.loadMinimal;
    case "subtasks":
      return includeAll ? SubtaskRelations.loadAll : ["task"];
    case "profiles":
      return includeAll ? ProfileRelations.loadAll : ProfileRelations.user;
    case "users":
      return includeAll ? UserRelations.loadAll : UserRelations.profile;
    case "categories":
      return includeAll ? CategoryRelations.loadAll : CategoryRelations.user;
    case "comments":
      return includeAll ? CommentRelations.loadAll : CommentRelations.task;
    default:
      return undefined;
  }
}

/**
 * Relation loading context for view-specific relation loading
 */
export type ViewContext = "list" | "detail" | "kanban" | "calendar" | "minimal";

/**
 * Get optimized relations for a specific view context
 * @param table - Table name
 * @param context - View context (list, detail, kanban, etc.)
 * @returns Array of relation paths optimized for the view
 */
export function getRelationsForView(table: string, context: ViewContext = "list"): string[] {
  switch (table) {
    case "todos":
      switch (context) {
        case "detail":
          return TodoRelations.forDetailView();
        case "kanban":
          return TodoRelations.forKanbanView();
        case "list":
        case "minimal":
        default:
          return TodoRelations.forListView();
      }
    case "tasks":
      switch (context) {
        case "detail":
          return TaskRelations.forDetailView();
        case "list":
        case "minimal":
        default:
          return TaskRelations.forListView();
      }
    case "subtasks":
      switch (context) {
        case "detail":
          return SubtaskRelations.forDetailView();
        default:
          return ["task"];
      }
    default:
      return getRelationsForTable(table, false) || [];
  }
}
