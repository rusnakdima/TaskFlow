import { Injectable, inject } from "@angular/core";
import { StorageStateService } from "./storage-state.service";
import { StorageCrudService } from "./storage-crud.service";
import { CascadeService } from "@services/core/cascade.service";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { TimestampHelper, VisibilityHelper } from "@helpers/index";

@Injectable({ providedIn: "root" })
export class StorageCascadeService {
  private state = inject(StorageStateService);
  private crud = inject(StorageCrudService);
  private cascadeService = inject(CascadeService);

  removeTodoWithCascade(todo_id?: string): void {
    if (!todo_id) return;
    this.removeTodoWithCascadeInternal(todo_id);
  }

  private removeTodoWithCascadeInternal(todo_id?: string): void {
    if (!todo_id) return;

    const { taskIds, subtaskIds } = this.cascadeService.computeCascadeForTodo(
      this.state._tasks(),
      this.state._subtasks(),
      todo_id
    );

    this.state._subtasks.update((items) => items.filter((s) => !subtaskIds.includes(s.id)));
    this.state._tasks.update((items) => items.filter((t) => t.todo_id !== todo_id));
    this.state._comments.update((items) =>
      items.filter((c) => {
        const isTodoComment = (c as any).todo_id === todo_id;
        const isTaskComment = c.task_id && taskIds.includes(c.task_id);
        const isSubtaskComment = c.subtask_id && subtaskIds.includes(c.subtask_id);
        return !isTodoComment && !isTaskComment && !isSubtaskComment;
      })
    );
    this.state._chats.update((items) => items.filter((c) => c.todo_id !== todo_id));
    this.state._privateTodos.update((items) => items.filter((t) => t.id !== todo_id));
    this.state._sharedTodos.update((items) => items.filter((t) => t.id !== todo_id));
    this.state._publicTodos.update((items) => items.filter((t) => t.id !== todo_id));
  }

  removeRecordWithCascade(table: string, id: string, deletedAt?: string): void {
    if (table === "todos") {
      this.removeTodoWithCascadeInternal(id);
    } else if (table === "tasks") {
      const task = this.crud.getById("tasks", id);
      const todoId = task?.todo_id ?? null;
      if (deletedAt) {
        this.softDeleteTaskWithCascade(id, deletedAt, todoId ?? undefined);
      } else {
        this.softDeleteTaskInternal(id);
      }
    } else if (table === "subtasks") {
      const subtask = this.crud.getById("subtasks", id);
      const taskId = subtask?.task_id ?? null;
      if (deletedAt) {
        this.softDeleteSubtaskWithCascade(id, deletedAt, taskId ?? undefined);
      } else {
        this.softDeleteSubtaskInternal(id);
      }
    } else if (table === "comments") {
      if (deletedAt) {
        this.crud.updateInSignal("comments", id, { deleted_at: deletedAt });
      } else {
        this.crud.removeFromSignal("comments", id);
      }
    } else if (table === "chats") {
      this.crud.removeFromSignal("chats", id);
    } else if (table === "categories") {
      this.crud.removeFromSignal("categories", id);
    }
  }

  private softDeleteTaskWithCascade(task_id: string, deletedAt: string, _todoId?: string): void {
    const { subtaskIds } = this.cascadeService.computeCascadeForTask(
      this.state._subtasks(),
      task_id
    );
    const timestamp = deletedAt;

    this.state._subtasks.update((items) =>
      items.map((s) =>
        subtaskIds.includes(s.id) ? { ...s, deleted_at: timestamp, updated_at: timestamp } : s
      )
    );
    this.state._comments.update((items) =>
      items.map((c) =>
        c.task_id === task_id || (c.subtask_id && subtaskIds.includes(c.subtask_id))
          ? { ...c, deleted_at: timestamp, updated_at: timestamp }
          : c
      )
    );
    this.state._tasks.update((items) =>
      items.map((t) =>
        t.id === task_id ? { ...t, deleted_at: timestamp, updated_at: timestamp } : t
      )
    );
  }

  private softDeleteSubtaskWithCascade(
    subtask_id: string,
    deletedAt: string,
    _taskId?: string
  ): void {
    const timestamp = deletedAt;
    this.state._subtasks.update((items) =>
      items.map((s) =>
        s.id === subtask_id ? { ...s, deleted_at: timestamp, updated_at: timestamp } : s
      )
    );
    this.state._comments.update((items) =>
      items.map((c) =>
        c.subtask_id === subtask_id ? { ...c, deleted_at: timestamp, updated_at: timestamp } : c
      )
    );
  }

  private softDeleteTaskInternal(task_id: string): void {
    const timestamp = TimestampHelper.createTimestamp();
    const subtasks = this.state.subtasks().filter((s) => s.task_id === task_id);

    this.state._tasks.update((tasks) =>
      tasks.map((t) => (t.id === task_id ? { ...t, deleted_at: timestamp } : t))
    );

    for (const subtask of subtasks) {
      this.softDeleteSubtaskInternal(subtask.id);
    }
  }

  private softDeleteSubtaskInternal(subtask_id: string): void {
    const timestamp = TimestampHelper.createTimestamp();
    this.state._subtasks.update((subtasks) =>
      subtasks.map((s) => (s.id === subtask_id ? { ...s, deleted_at: timestamp } : s))
    );
  }

  restoreTodoWithCascade(data: {
    todo: Todo;
    tasks: Task[];
    subtasks: Subtask[];
    comments: Comment[];
    chats?: Chat[];
  }): void {
    const visibility = VisibilityHelper.getVisibility(data.todo.visibility);
    const targetArray =
      visibility === "private"
        ? this.state._privateTodos
        : visibility === "public"
          ? this.state._publicTodos
          : this.state._sharedTodos;
    targetArray.set([data.todo, ...targetArray()]);

    if (data.tasks?.length) {
      this.state._tasks.set([...this.state._tasks(), ...data.tasks]);
    }
    if (data.subtasks?.length) {
      this.state._subtasks.set([...this.state._subtasks(), ...data.subtasks]);
    }
    if (data.comments?.length) {
      this.state._comments.set([...this.state._comments(), ...data.comments]);
    }
    if (data.chats?.length) {
      this.state._chats.set([...this.state._chats(), ...data.chats]);
    }
  }

  restoreRecordWithCascade(table: string, id: string): void {
    const timestamp = TimestampHelper.createTimestamp();

    if (table === "todos") {
      this.crud.updateItem("todos", id, { deleted_at: null, updated_at: timestamp });
      const relatedTasks = this.state.tasks().filter((t) => t.todo_id === id);
      const relatedSubtasks = this.state
        .subtasks()
        .filter((s) => relatedTasks.some((t) => t.id === s.task_id));
      const relatedChats = this.state.chats().filter((c) => c.todo_id === id);

      relatedTasks.forEach((t) => {
        this.crud.updateItem("tasks", t.id, { deleted_at: null, updated_at: timestamp });
      });
      relatedSubtasks.forEach((s) => {
        this.crud.updateItem("subtasks", s.id, { deleted_at: null, updated_at: timestamp });
      });
      relatedChats.forEach((c) => {
        this.crud.updateItem("chats", c.id, { deleted_at: null, updated_at: timestamp });
      });
    } else if (table === "tasks") {
      this.crud.updateItem("tasks", id, { deleted_at: null, updated_at: timestamp });
      const relatedSubtasks = this.state.subtasks().filter((s) => s.task_id === id);
      relatedSubtasks.forEach((s) => {
        this.crud.updateItem("subtasks", s.id, { deleted_at: null, updated_at: timestamp });
      });
    } else if (table === "subtasks") {
      this.crud.updateItem("subtasks", id, { deleted_at: null, updated_at: timestamp });
    } else if (table === "comments") {
      this.crud.updateItem("comments", id, { deleted_at: null, updated_at: timestamp });
    } else if (table === "chats") {
      this.crud.updateItem("chats", id, { deleted_at: null, updated_at: timestamp });
    } else if (table === "categories") {
      this.crud.updateItem("categories", id, { deleted_at: null, updated_at: timestamp });
    }
  }

  updateRecordDeleteStatusWithCascade(table: string, id: string, deletedAt: boolean): void {
    const timestamp = TimestampHelper.createTimestamp();

    if (table === "todos") {
      const { taskIds, subtaskIds } = this.cascadeService.computeCascadeForTodo(
        this.state._tasks(),
        this.state._subtasks(),
        id
      );

      this.state._tasks.update((tasks) =>
        tasks.map((task) =>
          task.todo_id === id
            ? { ...task, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : task
        )
      );

      this.state._subtasks.update((subtasks) =>
        subtasks.map((subtask) =>
          subtaskIds.includes(subtask.id)
            ? { ...subtask, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : subtask
        )
      );

      this.state._comments.update((comments) =>
        comments.map((comment) => {
          const isRelated =
            (comment.task_id && taskIds.includes(comment.task_id)) ||
            (comment.subtask_id && subtaskIds.includes(comment.subtask_id));
          return isRelated
            ? { ...comment, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : comment;
        })
      );

      this.state._chats.update((chats) =>
        chats.map((chat) =>
          chat.todo_id === id
            ? { ...chat, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : chat
        )
      );

      this.state._privateTodos.update((todos) =>
        todos.map((todo) =>
          todo.id === id
            ? { ...todo, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : todo
        )
      );
      this.state._sharedTodos.update((todos) =>
        todos.map((todo) =>
          todo.id === id
            ? { ...todo, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : todo
        )
      );
      this.state._publicTodos.update((todos) =>
        todos.map((todo) =>
          todo.id === id
            ? { ...todo, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : todo
        )
      );
    } else if (table === "tasks") {
      const { subtaskIds } = this.cascadeService.computeCascadeForTask(this.state._subtasks(), id);

      this.state._subtasks.update((subtasks) =>
        subtasks.map((subtask) =>
          subtaskIds.includes(subtask.id)
            ? { ...subtask, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : subtask
        )
      );

      this.state._comments.update((comments) =>
        comments.map((comment) => {
          const isRelated =
            comment.task_id === id ||
            (comment.subtask_id && subtaskIds.includes(comment.subtask_id));
          return isRelated
            ? { ...comment, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : comment;
        })
      );

      this.state._tasks.update((tasks) =>
        tasks.map((task) =>
          task.id === id
            ? { ...task, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : task
        )
      );
    } else if (table === "subtasks") {
      this.state._comments.update((comments) =>
        comments.map((comment) =>
          comment.subtask_id === id
            ? { ...comment, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : comment
        )
      );

      this.state._subtasks.update((subtasks) =>
        subtasks.map((subtask) =>
          subtask.id === id
            ? { ...subtask, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : subtask
        )
      );
    }
  }

  moveTodoToShared(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.crud.getById("todos", todo_id);
    if (!todo) return;

    this.state._privateTodos.update((todos) => todos.filter((t) => t.id !== todo_id));
    if (!this.state._sharedTodos().some((t) => t.id === todo_id)) {
      this.state._sharedTodos.update((todos) => [
        { ...todo, visibility: "shared" },
        ...todos.filter((t) => t.id !== todo_id),
      ]);
    }
  }

  moveTodoToPrivate(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.crud.getById("todos", todo_id);
    if (!todo) return;

    this.state._sharedTodos.update((todos) => todos.filter((t) => t.id !== todo_id));
    if (!this.state._privateTodos().some((t) => t.id === todo_id)) {
      this.state._privateTodos.update((todos) => [
        { ...todo, visibility: "private" },
        ...todos.filter((t) => t.id !== todo_id),
      ]);
    }
  }
}
