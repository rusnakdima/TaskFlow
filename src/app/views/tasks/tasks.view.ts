/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatExpansionModule } from "@angular/material/expansion";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { SearchComponent } from "@components/fields/search/search.component";
import { TaskComponent } from "@components/task/task.component";
import { TodoInformationComponent } from "@components/todo-information/todo-information.component";

@Component({
  selector: "app-tasks",
  standalone: true,
  providers: [DataSyncProvider],
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatExpansionModule,
    RouterModule,
    SearchComponent,
    TaskComponent,
    TodoInformationComponent,
    DragDropModule,
  ],
  templateUrl: "./tasks.view.html",
})
export class TasksView implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private notifyService: NotifyService,
    private dataSyncProvider: DataSyncProvider
  ) {}

  listTasks = signal<Task[]>([]);
  tempListTasks = signal<Task[]>([]);
  todo = signal<Todo | null>(null);

  private isUpdatingOrder: boolean = false;

  activeFilter = signal("all");
  showFilter = signal(false);

  editingTask = signal<string | null>(null);
  editingField = signal<string | null>(null);
  editingValue = signal("");

  highlightTaskId = signal<string | null>(null);

  filterOptions = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "skipped", label: "Skipped" },
    { key: "failed", label: "Failed" },
    { key: "done", label: "Done" },
    { key: "high", label: "High Priority" },
  ];

  userId = "";
  isOwner: boolean = true;
  isPrivate: boolean = true;

  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");

    this.route.queryParams.subscribe((queryParams: any) => {
      if (queryParams.isPrivate !== undefined) {
        this.isPrivate = queryParams.isPrivate === "true";
      }

      if (queryParams.highlightTaskId) {
        this.highlightTaskId.set(queryParams.highlightTaskId);
        setTimeout(() => {
          this.highlightTaskId.set(null);
        }, 5000);
      }
    });

    const routeData = this.route.snapshot.data;
    if (routeData?.["todo"]) {
      const todoData = routeData["todo"];
      this.todo.set(todoData);
      this.isOwner = todoData.userId === this.userId;
      this.isPrivate = todoData.visibility === "private";
      this.getTasksByTodoId(todoData.id);
    }
  }

  getTasksByTodoId(todoId: string) {
    const todo = this.todo();
    if (!todo) return;
    this.dataSyncProvider
      .getAll<Task>(
        "task",
        {
          todoId,
        },
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        todoId
      )
      .pipe(
        map((tasks) => {
          if (!Array.isArray(tasks)) {
            this.tempListTasks.set([]);
          } else {
            this.tempListTasks.set(tasks);
          }
          this.applyFilter();
          return tasks;
        })
      )
      .subscribe();
  }

  searchFunc(data: Array<any>) {
    const sortedData = [...data].sort((a, b) => {
      if (a.status === b.status) {
        return 0;
      } else if (a.status === TaskStatus.COMPLETED || a.status === TaskStatus.SKIPPED) {
        return 1;
      } else {
        return -1;
      }
    });
    this.listTasks.set(sortedData);
  }

  toggleTaskCompletion(task: Task) {
    let newStatus: TaskStatus;
    let message = "";
    switch (task.status) {
      case TaskStatus.PENDING:
        newStatus = TaskStatus.COMPLETED;
        message = "Task skipped";
        break;
      case TaskStatus.COMPLETED:
        newStatus = TaskStatus.SKIPPED;
        message = "Task completed";
        break;
      case TaskStatus.SKIPPED:
        newStatus = TaskStatus.FAILED;
        message = "Task marked as failed";
        break;
      case TaskStatus.FAILED:
      default:
        newStatus = TaskStatus.PENDING;
        message = "Task reopened";
        break;
    }

    const updatedTask = { ...task, status: newStatus };

    this.dataSyncProvider
      .update<Task>(
        "task",
        task.id,
        updatedTask,
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        task.todoId
      )
      .subscribe({
        next: (result) => {
          task.status = newStatus;
          if (this.todo()) {
            const todoTask = this.todo()!.tasks.find((t) => t.id === task.id);
            if (todoTask) {
              todoTask.status = newStatus;
            }
          }
          this.tempListTasks.update((tasks) => {
            const index = tasks.findIndex((t) => t.id === task.id);
            if (index !== -1) {
              tasks[index].status = newStatus;
            }
            return tasks;
          });
          this.applyFilter();
          this.notifyService.showSuccess(message);
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update task");
        },
      });
  }

  toggleFilter() {
    this.showFilter.update((val) => !val);
  }

  changeFilter(filter: string) {
    this.activeFilter.set(filter);
    this.applyFilter();
  }

  applyFilter() {
    let filtered = [...this.tempListTasks()];
    switch (this.activeFilter()) {
      case "all":
        break;
      case "active":
        filtered = filtered.filter((task) => task.status === TaskStatus.PENDING);
        break;
      case "completed":
        filtered = filtered.filter((task) => task.status === TaskStatus.COMPLETED);
        break;
      case "skipped":
        filtered = filtered.filter((task) => task.status === TaskStatus.SKIPPED);
        break;
      case "failed":
        filtered = filtered.filter((task) => task.status === TaskStatus.FAILED);
        break;
      case "done":
        filtered = filtered.filter(
          (task) =>
            task.status === TaskStatus.COMPLETED ||
            task.status === TaskStatus.SKIPPED ||
            task.status === TaskStatus.FAILED
        );
        break;
      case "high":
        filtered = filtered.filter((task) => task.priority === "high");
        break;
      default:
        break;
    }
    filtered.sort((a, b) => b.order - a.order);
    this.listTasks.set(filtered);

    if (this.highlightTaskId()) {
      setTimeout(() => {
        const element = document.getElementById("task-" + this.highlightTaskId());
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 500);
    }
  }

  updateTaskInline(event: { task: Task; field: string; value: string }) {
    let updatedTask: Task;

    if (event.field === "status") {
      updatedTask = {
        ...event.task,
        status: event.value as TaskStatus,
      };
    } else {
      updatedTask = {
        ...event.task,
        [event.field]: event.value,
      };
    }

    this.dataSyncProvider
      .update<Task>(
        "task",
        event.task.id,
        updatedTask,
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        event.task.todoId
      )
      .subscribe({
        next: (result) => {
          if (event.field === "title") {
            event.task.title = event.value;
          } else if (event.field === "description") {
            event.task.description = event.value;
          } else if (event.field === "status") {
            event.task.status = event.value as TaskStatus;
          }
          this.notifyService.showSuccess("Task updated successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update task");
        },
      });
  }

  deleteTask(taskId: string) {
    if (confirm("Are you sure you want to delete this task?")) {
      const todo = this.todo();
      if (!todo) return;

      this.dataSyncProvider
        .delete(
          "task",
          taskId,
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todo()?.id
        )
        .subscribe({
          next: (result) => {
            this.getTasksByTodoId(this.todo()?.id ?? "");
            if (this.todo()) {
              this.todo.update(
                (todo) => ({ ...todo!, tasks: todo!.tasks!.filter((t) => t.id !== taskId) }) as Todo
              );
            }
            this.notifyService.showSuccess("Task deleted successfully");
          },
          error: (err) => {
            this.notifyService.showError(err.message || "Failed to delete task");
          },
        });
    }
  }

  onTaskDrop(event: CdkDragDrop<Task[]>): void {
    if (this.isUpdatingOrder) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return;
    }

    moveItemInArray(this.listTasks(), event.previousIndex, event.currentIndex);
    this.updateTaskOrder();
  }

  updateTaskOrder(): void {
    this.isUpdatingOrder = true;

    const listTasks = this.listTasks();
    const updatedTasks = listTasks.map((task, index) => ({
      ...task,
      order: listTasks.length - 1 - index,
    }));

    const transformedTasks = updatedTasks.map((task) => ({
      _id: task._id,
      id: task.id,
      todoId: task.todoId || "",
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      startDate: task.startDate,
      endDate: task.endDate,
      order: task.order,
      isDeleted: task.isDeleted,
      createdAt: task.createdAt,
      updatedAt: new Date().toISOString().split(".")[0],
    }));

    const todo = this.todo();
    if (!todo) return;

    this.dataSyncProvider
      .updateAll<string>(
        "task",
        transformedTasks,
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        this.todo()?.id
      )
      .subscribe({
        next: (result) => {
          this.listTasks.set(updatedTasks);
          this.notifyService.showSuccess("Task order updated successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update task order");
          this.getTasksByTodoId(this.todo()?.id ?? "");
        },
        complete: () => {
          this.isUpdatingOrder = false;
        },
      });
  }
}
