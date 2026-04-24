/* sys lib */
import { Injectable, inject } from "@angular/core";

/* models */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";

/* services */
import { AdminDataStoreService } from "./admin-data-store.service";

@Injectable({
  providedIn: "root",
})
export class AdminCascadeService {
  private dataStore = inject(AdminDataStoreService);

  removeTodoWithCascade(todo_id?: string): void {
    if (!todo_id) return;
    const todos = this.dataStore.todos();
    const todo = todos.find((t) => t.id === todo_id);
    if (!todo) return;

    const taskIds = todo.tasks?.map((t) => t.id) || [];
    const subtaskIds = todo.tasks?.flatMap((t) => t.subtasks?.map((s) => s.id) || []) || [];

    this.dataStore.updateSignal("subtasks", (items) =>
      items.filter((s) => !subtaskIds.includes(s.id))
    );

    this.dataStore.updateSignal("tasks", (items) => items.filter((t) => t.todo_id !== todo_id));

    this.dataStore.updateSignal("comments", (items) =>
      items.filter((c) => {
        const isTodoComment = (c as any).todo_id === todo_id;
        const isTaskComment = c.task_id && taskIds.includes(c.task_id);
        const isSubtaskComment = c.subtask_id && subtaskIds.includes(c.subtask_id);
        return !isTodoComment && !isTaskComment && !isSubtaskComment;
      })
    );

    this.dataStore.updateSignal("chats", (items) => items.filter((c) => c.todo_id !== todo_id));

    this.dataStore.updateSignal("todos", (items) => items.filter((t) => t.id !== todo_id));
  }

  restoreTodoWithCascade(data: {
    todo: Todo;
    tasks: Task[];
    subtasks: Subtask[];
    comments: Comment[];
    chats: Chat[];
  }): void {
    this.dataStore.setSignal("todos", [data.todo, ...this.dataStore.todos()]);

    if (data.tasks?.length) {
      this.dataStore.setSignal("tasks", [...this.dataStore.tasks(), ...data.tasks]);
    }
    if (data.subtasks?.length) {
      this.dataStore.setSignal("subtasks", [...this.dataStore.subtasks(), ...data.subtasks]);
    }
    if (data.comments?.length) {
      this.dataStore.setSignal("comments", [...this.dataStore.comments(), ...data.comments]);
    }
    if (data.chats?.length) {
      this.dataStore.setSignal("chats", [...this.dataStore.chats(), ...data.chats]);
    }
  }

  removeRecordWithCascade(table: string, id: string): void {
    if (table === "todos") {
      this.removeTodoWithCascade(id);
    } else if (table === "tasks") {
      const tasks = this.dataStore.tasks();
      const task = tasks.find((t) => t.id === id);
      if (task) {
        const subtaskIds = task.subtasks?.map((s) => s.id) || [];
        this.dataStore.setSignal(
          "subtasks",
          this.dataStore.subtasks().filter((s) => !subtaskIds.includes(s.id))
        );
        this.dataStore.setSignal(
          "comments",
          this.dataStore.comments().filter((c) => c.task_id !== id)
        );
        this.dataStore.setSignal(
          "tasks",
          this.dataStore.tasks().filter((t) => t.id !== id)
        );
      }
    } else if (table === "subtasks") {
      this.dataStore.setSignal(
        "comments",
        this.dataStore.comments().filter((c) => c.subtask_id !== id)
      );
      this.dataStore.setSignal(
        "subtasks",
        this.dataStore.subtasks().filter((s) => s.id !== id)
      );
    } else {
      this.dataStore.removeRecord(table, id);
    }
  }

  updateRecordDeleteStatusWithCascade(table: string, id: string, deletedAt: boolean): void {
    const timestamp = new Date().toISOString();

    if (table === "todos") {
      this.dataStore.updateRecordDeleteStatus(table, id, deletedAt);

      const todos = this.dataStore.todos();
      const todo = todos.find((t) => t.id === id);
      if (todo) {
        const taskIds = todo.tasks?.map((t) => t.id) || [];

        this.dataStore.updateSignal("tasks", (tasks) =>
          tasks.map((task) =>
            task.todo_id === id
              ? { ...task, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : task
          )
        );

        const subtaskIds = todo.tasks?.flatMap((t) => t.subtasks?.map((s) => s.id) || []) || [];
        this.dataStore.updateSignal("subtasks", (subtasks) =>
          subtasks.map((subtask) =>
            subtaskIds.includes(subtask.id)
              ? { ...subtask, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : subtask
          )
        );

        this.dataStore.updateSignal("comments", (comments) =>
          comments.map((comment) => {
            const isRelated =
              (comment.task_id && taskIds.includes(comment.task_id)) ||
              (comment.subtask_id && subtaskIds.includes(comment.subtask_id));
            return isRelated
              ? { ...comment, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : comment;
          })
        );

        this.dataStore.updateSignal("chats", (chats) =>
          chats.map((chat) =>
            chat.todo_id === id
              ? { ...chat, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : chat
          )
        );
      }
    } else if (table === "tasks") {
      this.dataStore.updateRecordDeleteStatus(table, id, deletedAt);

      const tasks = this.dataStore.tasks();
      const task = tasks.find((t) => t.id === id);
      if (task) {
        const subtaskIds = task.subtasks?.map((s) => s.id) || [];

        this.dataStore.updateSignal("subtasks", (subtasks) =>
          subtasks.map((subtask) =>
            subtaskIds.includes(subtask.id)
              ? { ...subtask, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : subtask
          )
        );

        this.dataStore.updateSignal("comments", (comments) =>
          comments.map((comment) => {
            const isRelated =
              comment.task_id === id ||
              (comment.subtask_id && subtaskIds.includes(comment.subtask_id));
            return isRelated
              ? { ...comment, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : comment;
          })
        );
      }
    } else if (table === "subtasks") {
      this.dataStore.updateRecordDeleteStatus(table, id, deletedAt);

      this.dataStore.updateSignal("comments", (comments) =>
        comments.map((comment) =>
          comment.subtask_id === id
            ? { ...comment, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
            : comment
        )
      );
    } else {
      this.dataStore.updateRecordDeleteStatus(table, id, deletedAt);
    }
  }
}
