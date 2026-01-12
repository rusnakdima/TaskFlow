/* sys lib */
import { Injectable, ApplicationRef } from "@angular/core";
import { Socket, SocketIoConfig } from "ngx-socket-io";
import { Observable, from, of, forkJoin } from "rxjs";
import { catchError, map, finalize } from "rxjs/operators";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* services */
import { MainService } from "./main.service";
import { AuthService } from "./auth.service";

@Injectable({
  providedIn: "root",
})
export class WebSocketService {
  private socket: Socket;

  constructor(
    private mainService: MainService,
    private authService: AuthService,
    private appRef: ApplicationRef
  ) {
    const config: SocketIoConfig = {
      url: "ws://localhost:3000",
      options: {
        transports: ["websocket"],
      },
    };
    this.socket = new Socket(config, this.appRef);
    this.connect();
  }

  connect(): void {
    this.socket.connect();
    this.socket.on("connect", () => {
      console.log("Connected to WebSocket server");
    });
    this.socket.on("disconnect", () => {
      console.log("Disconnected from WebSocket server");
    });
  }

  joinUserRoom(): void {
    const userId = this.authService.getValueByKey("id");
    if (userId) {
      this.socket.emit("join-room", { userId });
    }
  }

  getTodosByAssignee(assignee: string): Observable<Todo[]> {
    console.log("WebSocketService: getTodosByAssignee called with assignee:", assignee);
    return new Observable<Todo[]>((observer) => {
      // Emit request to WebSocket server - it will query Tauri backend directly
      const requestData = { userId: assignee, assignee };
      console.log("WebSocketService: emitting get-todos with data:", requestData);

      this.socket.emit("get-todos", requestData);
      this.socket.once(
        "todos-retrieved",
        (response: Response<{ todos: Todo[]; timestamp: string }>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            console.log("WebSocketService: received todos-retrieved:", response.data.todos);

            // Join rooms for todos the user has access to
            response.data.todos.forEach((todo) => {
              const hasAccess =
                todo.assignees?.some((profile) => profile.id === assignee) ||
                todo.userId === assignee;
              if (hasAccess) {
                this.joinTodoRoom(todo.id);
              }
            });

            observer.next(response.data.todos);
          } else {
            observer.error(new Error(response.message || "Failed to retrieve todos"));
          }
          observer.complete();
        }
      );
      this.socket.once("todos-retrieve-error", (error: any) => {
        console.log("WebSocketService: server returned error, falling back to MainService:", error);
        // Fallback to MainService if server returns error
        this.fallbackGetTodosByAssignee(assignee).subscribe(observer);
      });
      this.socket.once("connect_error", () => {
        console.log("WebSocketService: connection error, falling back to MainService");
        // Fallback to MainService if connection fails
        this.fallbackGetTodosByAssignee(assignee).subscribe(observer);
      });
    }).pipe(
      catchError((err) => {
        console.log("WebSocketService: socket error, falling back:", err);
        // If socket fails, fallback
        return this.fallbackGetTodosByAssignee(assignee);
      })
    );
  }

  joinTodoRoom(todoId: string): void {
    const roomName = `todo_${todoId}`;
    this.socket.emit("join-todo-room", { todoId });
    console.log(`WebSocketService: joined room: ${roomName}`);
  }

  leaveTodoRoom(todoId: string): void {
    const roomName = `todo_${todoId}`;
    this.socket.emit("leave-todo-room", { todoId });
    console.log(`WebSocketService: left room: ${roomName}`);
  }

  isConnected(): boolean {
    return this.socket.connected;
  }

  getByField(entity: string, nameField: string, value: string): Observable<any> {
    return new Observable<any>((observer) => {
      const userId = this.authService.getValueByKey("id");
      this.socket.emit("get-by-field", { entity, nameField, value, userId });
      this.socket.once(
        `${entity}-retrieved`,
        (response: Response<{ [key: string]: any; timestamp: string }>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            observer.next(response.data[entity]);
          } else {
            observer.error(new Error(response.message || `Failed to retrieve ${entity}`));
          }
          observer.complete();
        }
      );
      this.socket.once("get-by-field-error", (error: any) => {
        console.log("WebSocketService: get-by-field error, falling back to MainService:", error);
        this.fallbackGetByField(entity, nameField, value).subscribe(observer);
      });
      this.socket.once("connect_error", () => {
        console.log("WebSocketService: connection error, falling back to MainService");
        this.fallbackGetByField(entity, nameField, value).subscribe(observer);
      });
    }).pipe(catchError((err) => this.fallbackGetByField(entity, nameField, value)));
  }

  private fallbackGetByField<T>(entity: string, nameField: string, value: string): Observable<T> {
    return from(this.mainService.getByField<T>(entity, nameField, value)).pipe(
      map((response: Response<T>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return response.data;
        } else {
          throw new Error(response.message ?? "Failed to load data");
        }
      })
    );
  }

  private fallbackGetTodosByAssignee(profileId: string): Observable<Todo[]> {
    return from(this.mainService.getTodosByAssignee<Todo[]>(profileId)).pipe(
      map((response: Response<Todo[]>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return response.data;
        } else {
          throw new Error(response.message ?? "Failed to load tasks");
        }
      })
    );
  }

  updateTodo(id: string, data: any): Observable<Todo> {
    return new Observable<Todo>((observer) => {
      this.socket.emit("update-todo", { todo: { id, ...data }, userId: data.userId });
      this.socket.once("todo-updated", (response: Response<{ todo: Todo; timestamp: string }>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          observer.next(response.data.todo);
        } else {
          observer.error(new Error(response.message || "Failed to update todo"));
        }
        observer.complete();
      });
      this.socket.once("connect_error", () => {
        this.fallbackUpdateTodo(id, data).subscribe(observer);
      });
    }).pipe(catchError((err) => this.fallbackUpdateTodo(id, data)));
  }

  private fallbackUpdateTodo(id: string, data: any): Observable<Todo> {
    return from(this.mainService.update<Todo, any>("todo", id, data)).pipe(
      map((response: Response<Todo>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return response.data;
        } else {
          throw new Error(response.message ?? "Failed to update todo");
        }
      })
    );
  }

  deleteTodo(id: string): Observable<void> {
    return new Observable<void>((observer) => {
      this.socket.emit("delete-todo", { todoId: id, userId: "current-user" }); // userId will be set by auth
      this.socket.once(
        "todo-deleted",
        (response: Response<{ todoId: string; timestamp: string }>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            observer.next(undefined);
          } else {
            observer.error(new Error(response.message || "Failed to delete todo"));
          }
          observer.complete();
        }
      );
      this.socket.once("connect_error", () => {
        this.fallbackDeleteTodo(id).subscribe(observer);
      });
    }).pipe(catchError((err) => this.fallbackDeleteTodo(id)));
  }

  private fallbackDeleteTodo(id: string): Observable<void> {
    return from(this.mainService.delete<void>("todo", id)).pipe(
      map((response: Response<void>) => {
        if (response.status !== ResponseStatus.SUCCESS) {
          throw new Error(response.message ?? "Failed to delete todo");
        }
      }),
      map(() => void 0)
    );
  }

  createTodo(data: any): Observable<Todo> {
    return new Observable((observer) => {
      this.socket.emit("create-todo", { todo: data, userId: data.userId });
      this.socket.once("todo-create-success", (response: Response<{ todo: Todo }>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          observer.next(response.data.todo);
        } else {
          observer.error(new Error(response.message || "Failed to create todo"));
        }
        observer.complete();
      });
      this.socket.once("todo-create-error", (error: any) => {
        observer.error(error);
      });
    });
  }

  createTask(data: any): Observable<any> {
    return new Observable((observer) => {
      this.socket.emit("create-task", { task: data, userId: data.userId });
      this.socket.once("task-create-success", (response: Response<{ task: any }>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          observer.next(response.data.task);
        } else {
          observer.error(new Error(response.message || "Failed to create task"));
        }
        observer.complete();
      });
      this.socket.once("task-create-error", (error: any) => {
        observer.error(error);
      });
    });
  }

  updateTask(data: any): Observable<any> {
    return new Observable((observer) => {
      this.socket.emit("update-task", { task: data, userId: data.userId });
      this.socket.once("task-update-success", (data: { task: any }) => {
        observer.next(data.task);
        observer.complete();
      });
      this.socket.once("task-update-error", (error: any) => {
        observer.error(error);
      });
    });
  }

  deleteTask(id: string, userId: string): Observable<void> {
    return new Observable((observer) => {
      this.socket.emit("delete-task", { taskId: id, userId });
      this.socket.once("task-delete-success", (data: { taskId: string }) => {
        observer.complete();
      });
      this.socket.once("task-delete-error", (error: any) => {
        observer.error(error);
      });
    });
  }

  createSubtask(data: any): Observable<any> {
    return new Observable((observer) => {
      this.socket.emit("create-subtask", { subtask: data, userId: data.userId });
      this.socket.once("subtask-create-success", (data: { subtask: any }) => {
        observer.next(data.subtask);
        observer.complete();
      });
      this.socket.once("subtask-create-error", (error: any) => {
        observer.error(error);
      });
    });
  }

  updateSubtask(data: any): Observable<any> {
    return new Observable((observer) => {
      this.socket.emit("update-subtask", { subtask: data, userId: data.userId });
      this.socket.once("subtask-update-success", (data: { subtask: any }) => {
        observer.next(data.subtask);
        observer.complete();
      });
      this.socket.once("subtask-update-error", (error: any) => {
        observer.error(error);
      });
    });
  }

  deleteSubtask(id: string, userId: string): Observable<void> {
    return new Observable((observer) => {
      this.socket.emit("delete-subtask", { subtaskId: id, userId });
      this.socket.once("subtask-delete-success", (data: { subtaskId: string }) => {
        observer.complete();
      });
      this.socket.once("subtask-delete-error", (error: any) => {
        observer.error(error);
      });
    });
  }

  // Listen for real-time updates
  onTodoCreated(): Observable<Todo> {
    return new Observable((observer) => {
      this.socket.on("todo-created", (data: { todo: Todo; timestamp: string }) => {
        observer.next(data.todo);
      });
    });
  }

  onTodoUpdated(): Observable<Todo> {
    return new Observable((observer) => {
      this.socket.on("todo-updated", (data: { todo: Todo; timestamp: string }) => {
        observer.next(data.todo);
      });
    });
  }

  onTodoDeleted(): Observable<string> {
    return new Observable((observer) => {
      this.socket.on("todo-deleted", (data: { todoId: string; timestamp: string }) => {
        observer.next(data.todoId);
      });
    });
  }
}
