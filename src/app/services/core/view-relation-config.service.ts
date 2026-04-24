export type ViewContext = "list" | "detail" | "kanban" | "calendar" | "minimal";

const VIEW_RELATIONS: Record<string, Record<ViewContext, string[]>> = {
  todos: {
    list: ["user", "categories"],
    detail: ["user", "tasks", "categories"],
    kanban: ["tasks", "categories"],
    calendar: ["user", "categories"],
    minimal: ["user", "categories"],
  },
  tasks: {
    list: ["subtasks"],
    detail: ["todo"],
    kanban: ["subtasks"],
    calendar: ["todo"],
    minimal: ["subtasks"],
  },
  subtasks: {
    list: ["task"],
    detail: ["task", "comments"],
    kanban: ["task"],
    calendar: ["task"],
    minimal: ["task"],
  },
};

export function getRelationsForView(table: string, context: ViewContext = "list"): string[] {
  return VIEW_RELATIONS[table]?.[context] ?? [];
}
