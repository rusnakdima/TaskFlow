/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response";
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
  task: Task | null = null;
  projectTitle: string = "";

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
      }
      if (params.taskId) {
        this.getTaskInfo(params.taskId);
        this.getSubtasksByTaskId(params.taskId);
      }
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
}
