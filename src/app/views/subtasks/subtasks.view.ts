/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* services */
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";

/* components */
import { SearchComponent } from "@components/fields/search/search.component";
import { SubtaskComponent } from "@components/subtask/subtask.component";
import { TaskInformationComponent } from "@components/task-information/task-information.component";

@Component({
  selector: "app-subtasks",
  standalone: true,
  providers: [MainService],
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
    private mainService: MainService,
    private notifyService: NotifyService
  ) {}

  listSubtasks = signal<Array<Subtask>>([]);
  tempListSubtasks = signal<Array<Subtask>>([]);

  todoId = signal("");
  todo = signal<Todo | null>(null);
  task = signal<Task | null>(null);
  projectTitle = signal("");

  private isUpdatingOrder: boolean = false;

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
    this.route.params.subscribe((params: any) => {
      if (params.todoId) {
        this.todoId.set(params.todoId);
        this.getTodoInfo(this.todoId());
      }
      if (params.taskId) {
        this.getTaskInfo(params.taskId);
        this.getSubtasksByTaskId(params.taskId);
      }
    });
  }

  getTodoInfo(id: string) {
    this.mainService
      .getByField<Todo>("todo", "id", id)
      .then((response: Response<Todo>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.todo.set(response.data);
          this.projectTitle.set(this.todo()?.title ?? "");
        } else {
          this.notifyService.showNotify(response.status, response.message);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message ?? err.toString());
      });
  }

  getTaskInfo(id: string) {
    this.mainService
      .getByField<Task>("task", "id", id)
      .then((response: Response<Task>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.task.set(response.data);
        } else {
          this.notifyService.showNotify(response.status, response.message);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message ?? err.toString());
      });
  }

  getSubtasksByTaskId(taskId: string) {
    this.mainService
      .getAllByField<Array<Subtask>>("subtask", "taskId", taskId)
      .then((response: Response<Array<Subtask>>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.tempListSubtasks.set(response.data);
          this.applyFilter();
        } else {
          this.notifyService.showError(response.message);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message);
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

    switch (this.activeFilter()) {
      case "active":
        filtered = filtered.filter((subtask) => subtask.status === TaskStatus.PENDING);
        break;
      case "completed":
        filtered = filtered.filter((subtask) => subtask.status === TaskStatus.COMPLETED);
        break;
      case "skipped":
        filtered = filtered.filter((subtask) => subtask.status === TaskStatus.SKIPPED);
        break;
      case "failed":
        filtered = filtered.filter((subtask) => subtask.status === TaskStatus.FAILED);
        break;
      case "done":
        filtered = filtered.filter(
          (subtask) =>
            subtask.status === TaskStatus.COMPLETED || subtask.status === TaskStatus.SKIPPED
        );
        break;
      case "high":
        filtered = filtered.filter((subtask) => subtask.priority === "high");
        break;
      default:
        break;
    }

    filtered.sort((a, b) => {
      if (a.status === b.status) {
        return 0;
      } else if (a.status === TaskStatus.COMPLETED || a.status === TaskStatus.SKIPPED) {
        return 1;
      } else {
        return -1;
      }
    });

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

    this.mainService
      .update<string, Subtask>("subtask", subtask.id, updatedSubtask)
      .then((response: Response<string>) => {
        if (response.status === ResponseStatus.SUCCESS) {
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
        } else {
          this.notifyService.showError(response.message);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message);
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

    this.mainService
      .update<string, Subtask>("subtask", event.subtask.id, updatedSubtask)
      .then((response: Response<string>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          if (event.field === "title") {
            event.subtask.title = event.value;
          } else if (event.field === "description") {
            event.subtask.description = event.value;
          } else if (event.field === "status") {
            event.subtask.status = event.value as TaskStatus;
          }
          this.notifyService.showSuccess("Subtask updated successfully");
        } else {
          this.notifyService.showError(response.message);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message);
      });
  }

  deleteSubtask(id: string) {
    this.mainService
      .delete<string>("subtask", id)
      .then((response: Response<string>) => {
        this.notifyService.showNotify(response.status, response.message);
        if (response.status === ResponseStatus.SUCCESS) {
          this.getSubtasksByTaskId(this.task()?.id ?? "");
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message);
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
      subtask.order = index;
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

    this.mainService
      .updateAll<string, any>("subtask", transformedSubtasks)
      .then((response: Response<string>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.notifyService.showNotify(
            ResponseStatus.SUCCESS,
            "Subtask order updated successfully"
          );
        } else {
          this.getSubtasksByTaskId(this.task()?.id ?? "");
          this.notifyService.showError("Failed to update subtask order");
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError("Failed to update subtask order");
        this.getSubtasksByTaskId(this.task()?.id ?? "");
        console.error(err);
      })
      .finally(() => {
        this.isUpdatingOrder = false;
      });
  }
}
