/* sys lib */
import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
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

@Component({
  selector: "app-subtasks",
  standalone: true,
  providers: [MainService, NotifyService],
  imports: [CommonModule, RouterModule, MatIconModule, SearchComponent, SubtaskComponent],
  templateUrl: "./subtasks.component.html",
})
export class SubtasksComponent {
  constructor(
    private route: ActivatedRoute,
    private mainService: MainService,
    private notifyService: NotifyService
  ) {}

  listSubtasks: Array<Subtask> = [];
  tempListSubtasks: Array<Subtask> = [];

  todoId: string = "";
  task: Task | null = null;

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
          this.listSubtasks = response.data;
          this.tempListSubtasks = response.data;
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

  deleteTask() {
    this.mainService
      .delete<string>("task", this.task?.id ?? "")
      .then((response: Response<string>) =>
        this.notifyService.showNotify(response.status, response.message)
      )
      .catch((err: Response<string>) => this.notifyService.showError(err.message));
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
