/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { DataSyncProvider } from "@services/data-sync.provider";

/* components */
import { SearchComponent } from "@components/fields/search/search.component";
import { SubtaskComponent } from "@components/subtask/subtask.component";
import { TaskInformationComponent } from "@components/task-information/task-information.component";

@Component({
  selector: "app-subtasks",
  standalone: true,
  providers: [DataSyncProvider],
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    SearchComponent,
    SubtaskComponent,
    TaskInformationComponent,
    DragDropModule,
  ],
  templateUrl: "./subtasks.view.html",
})
export class SubtasksView implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private notifyService: NotifyService,
    private dataSyncProvider: DataSyncProvider
  ) {}

  listSubtasks = signal<Array<Subtask>>([]);
  tempListSubtasks = signal<Array<Subtask>>([]);

  todoId = signal("");
  todo = signal<Todo | null>(null);
  task = signal<Task | null>(null);
  projectTitle = signal("");

  private isUpdatingOrder: boolean = false;

  userId: string = "";
  isOwner: boolean = true;
  isPrivate: boolean = true;

  activeFilter = signal("all");
  showFilter = signal(false);

  filterOptions = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "skipped", label: "Skipped" },
    { key: "failed", label: "Failed" },
    { key: "done", label: "Done" },
    { key: "high", label: "High Priority" },
  ];

  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");

    this.route.queryParams.subscribe((queryParams: any) => {
      if (queryParams.isPrivate !== undefined) {
        this.isPrivate = queryParams.isPrivate === "true";
      }
    });

    const routeData = this.route.snapshot.data;
    if (routeData?.["task"]) {
      const taskData = routeData["task"];
      this.task.set(taskData);
      this.getSubtasksByTaskId(taskData.id);
    }

    this.route.params.subscribe((params: any) => {
      if (params.todoId) {
        this.todoId.set(params.todoId);
        this.getTodoInfo(this.todoId());
      }
    });
  }

  getTodoInfo(id: string) {
    this.dataSyncProvider
      .get<Todo>(
        "todo",
        { id: id },
        { isOwner: this.isPrivate ? true : false, isPrivate: this.isPrivate }
      )
      .subscribe({
        next: (todo) => {
          this.todo.set(todo);
          this.isOwner = todo.userId === this.userId;
          this.isPrivate = todo.visibility === "private";
          this.projectTitle.set(this.todo()?.title ?? "");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to load todo");
        },
      });
  }

  getTaskInfo(id: string) {
    this.dataSyncProvider
      .get<Task>("task", { id: id }, { isOwner: this.isOwner, isPrivate: this.isPrivate })
      .subscribe({
        next: (task) => {
          this.task.set(task);
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to load task");
        },
      });
  }

  getSubtasksByTaskId(taskId: string) {
    this.dataSyncProvider
      .getAll<Subtask>(
        "subtask",
        { taskId },
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        this.todoId()
      )
      .subscribe({
        next: (subtasks) => {
          this.tempListSubtasks.set(subtasks);
          this.applyFilter();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update subtask");
        },
      });
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
    this.listSubtasks.set(sortedData);
  }

  toggleFilter() {
    this.showFilter.update((val) => !val);
  }

  changeFilter(filter: string) {
    this.activeFilter.set(filter);
    this.applyFilter();
  }

  applyFilter() {
    let filtered = [...this.tempListSubtasks()];
    if (this.activeFilter() !== "all") {
      switch (this.activeFilter()) {
        case "active":
          filtered = filtered.filter((s) => s.status === TaskStatus.PENDING);
          break;
        case "completed":
          filtered = filtered.filter((s) => s.status === TaskStatus.COMPLETED);
          break;
        case "skipped":
          filtered = filtered.filter((s) => s.status === TaskStatus.SKIPPED);
          break;
        case "failed":
          filtered = filtered.filter((s) => s.status === TaskStatus.FAILED);
          break;
        case "done":
          filtered = filtered.filter(
            (s) =>
              s.status === TaskStatus.COMPLETED ||
              s.status === TaskStatus.SKIPPED ||
              s.status === TaskStatus.FAILED
          );
          break;
        case "high":
          filtered = filtered.filter((s) => s.priority === "high");
          break;
      }
    }

    filtered.sort((a, b) => b.order - a.order);
    this.listSubtasks.set(filtered);
  }

  toggleSubtaskCompletion(subtask: Subtask) {
    let newStatus: TaskStatus;
    let message = "";
    switch (subtask.status) {
      case TaskStatus.PENDING:
        newStatus = TaskStatus.COMPLETED;
        message = "Subtask reopened";
        break;
      case TaskStatus.COMPLETED:
        newStatus = TaskStatus.SKIPPED;
        message = "Subtask completed";
        break;
      case TaskStatus.SKIPPED:
        newStatus = TaskStatus.FAILED;
        message = "Subtask skipped";
        break;
      case TaskStatus.FAILED:
      default:
        newStatus = TaskStatus.PENDING;
        message = "Subtask marked as failed";
        break;
    }

    const updatedSubtask = { ...subtask, status: newStatus };

    this.dataSyncProvider
      .update<Subtask>(
        "subtask",
        subtask.id,
        updatedSubtask,
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        this.todoId()
      )
      .subscribe({
        next: (result) => {
          subtask.status = newStatus;

          const index = this.tempListSubtasks().findIndex((s) => s.id === subtask.id);
          if (index !== -1) {
            this.tempListSubtasks.update((arr) => {
              const newArr = [...arr];
              newArr[index] = { ...subtask };
              return newArr;
            });
          }

          this.applyFilter();

          this.notifyService.showSuccess(message);
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update subtask");
        },
      });
  }

  updateSubtaskInline(event: { subtask: Subtask; field: string; value: string }) {
    let updatedSubtask: Subtask;

    if (event.field === "status") {
      updatedSubtask = {
        ...event.subtask,
        status: event.value as TaskStatus,
      };
    } else {
      updatedSubtask = {
        ...event.subtask,
        [event.field]: event.value,
      };
    }

    this.dataSyncProvider
      .update<Subtask>(
        "subtask",
        event.subtask.id,
        updatedSubtask,
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        this.todoId()
      )
      .subscribe({
        next: (result) => {
          if (event.field === "title") {
            event.subtask.title = event.value;
          } else if (event.field === "description") {
            event.subtask.description = event.value;
          } else if (event.field === "status") {
            event.subtask.status = event.value as TaskStatus;
          }
          this.notifyService.showSuccess("Subtask updated successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update subtask");
        },
      });
  }

  deleteSubtask(id: string) {
    this.dataSyncProvider
      .delete("subtask", id, { isOwner: this.isOwner, isPrivate: this.isPrivate }, this.todoId())
      .subscribe({
        next: (result) => {
          this.listSubtasks.set(
            this.listSubtasks().filter((subtask: Subtask) => subtask.id !== id)
          );
          this.notifyService.showSuccess("Subtask deleted successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to delete subtask");
        },
      });
  }

  onSubtaskDrop(event: CdkDragDrop<Subtask[]>): void {
    if (this.isUpdatingOrder) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return;
    }

    moveItemInArray(this.listSubtasks(), event.previousIndex, event.currentIndex);
    this.updateSubtaskOrder();
  }

  updateSubtaskOrder(): void {
    this.isUpdatingOrder = true;

    this.listSubtasks().forEach((subtask, index) => {
      subtask.order = this.listSubtasks().length - 1 - index;
    });

    const transformedSubtasks = this.listSubtasks().map((subtask) => ({
      _id: subtask._id,
      id: subtask.id,
      taskId: subtask.taskId || "",
      title: subtask.title,
      description: subtask.description,
      status: subtask.status,
      priority: subtask.priority,
      order: subtask.order,
      isDeleted: subtask.isDeleted,
      createdAt: subtask.createdAt,
      updatedAt: new Date().toISOString().split(".")[0],
    }));

    this.dataSyncProvider
      .updateAll<string>(
        "subtask",
        transformedSubtasks,
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        this.todoId()
      )
      .subscribe({
        next: (result) => {
          this.notifyService.showSuccess("Subtask order updated successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update subtask order");
          this.getSubtasksByTaskId(this.task()?.id ?? "");
        },
        complete: () => {
          this.isUpdatingOrder = false;
        },
      });
  }
}
