/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { CdkDragDrop, DragDropModule, moveItemInArray } from "@angular/cdk/drag-drop";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { Todo } from "@models/todo";
import { Task } from "@models/task";
import { Subtask } from "@models/subtask";

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

  listSubtasks: Array<Subtask> = [];
  tempListSubtasks: Array<Subtask> = [];

  todoId: string = "";
  todo: Todo | null = null;
  task: Task | null = null;
  projectTitle: string = "";

  private isUpdatingOrder: boolean = false;

  activeFilter: string = "all";
  showFilter: boolean = false;

  filterOptions = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "high", label: "High Priority" },
  ];

  ngOnInit(): void {
    this.route.params.subscribe((params: any) => {
      if (params.todoId) {
        this.todoId = params.todoId;
        this.getTodoInfo(this.todoId);
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
          this.todo = response.data;
          this.projectTitle = this.todo?.title ?? "";
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
          this.task = response.data;
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
          this.tempListSubtasks = response.data;
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
    this.listSubtasks = data;
  }

  toggleFilter() {
    this.showFilter = !this.showFilter;
  }

  changeFilter(filter: string) {
    this.activeFilter = filter;
    this.applyFilter();
  }

  applyFilter() {
    let filtered = [...this.tempListSubtasks];

    switch (this.activeFilter) {
      case "active":
        filtered = filtered.filter((subtask) => !subtask.isCompleted);
        break;
      case "completed":
        filtered = filtered.filter((subtask) => subtask.isCompleted);
        break;
      case "high":
        filtered = filtered.filter((subtask) => subtask.priority === "high");
        break;
      default:
        break;
    }

    this.listSubtasks = filtered;
  }

  toggleSubtaskCompletion(subtask: Subtask) {
    const updatedSubtask = { ...subtask, isCompleted: !subtask.isCompleted };

    this.mainService
      .update<string, Subtask>("subtask", subtask.id, updatedSubtask)
      .then((response: Response<string>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          subtask.isCompleted = !subtask.isCompleted;
          this.notifyService.showSuccess(
            `Subtask ${subtask.isCompleted ? "completed" : "reopened"}`
          );
        } else {
          this.notifyService.showError(response.message);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message);
      });
  }

  updateSubtaskInline(event: { subtask: Subtask; field: string; value: string }) {
    const updatedSubtask = {
      ...event.subtask,
      [event.field]: event.value,
    };

    this.mainService
      .update<string, Subtask>("subtask", event.subtask.id, updatedSubtask)
      .then((response: Response<string>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          if (event.field === "title") {
            event.subtask.title = event.value;
          } else if (event.field === "description") {
            event.subtask.description = event.value;
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
          this.getSubtasksByTaskId(this.task?.id ?? "");
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

    moveItemInArray(this.listSubtasks, event.previousIndex, event.currentIndex);
    this.updateSubtaskOrder();
  }

  updateSubtaskOrder(): void {
    this.isUpdatingOrder = true;

    this.listSubtasks.forEach((subtask, index) => {
      subtask.order = index;
    });

    const transformedSubtasks = this.listSubtasks.map((subtask) => ({
      _id: subtask._id,
      id: subtask.id,
      taskId: subtask.taskId || "",
      title: subtask.title,
      description: subtask.description,
      isCompleted: subtask.isCompleted,
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
          this.getSubtasksByTaskId(this.task?.id ?? "");
          this.notifyService.showError("Failed to update subtask order");
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError("Failed to update subtask order");
        this.getSubtasksByTaskId(this.task?.id ?? "");
        console.error(err);
      })
      .finally(() => {
        this.isUpdatingOrder = false;
      });
  }
}
