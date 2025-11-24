/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatRadioModule } from "@angular/material/radio";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { PriorityTask, Task } from "@models/task";
import { Subtask } from "@models/subtask";
import { Todo } from "@models/todo";

/* services */
import { AuthService } from "@services/auth.service";
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";

interface PriorityOption {
  value: PriorityTask;
  label: string;
  colorClass: string;
}

@Component({
  selector: "app-manage-subtask",
  standalone: true,
  providers: [AuthService, MainService],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
  ],
  templateUrl: "./manage-subtask.view.html",
})
export class ManageSubtaskView implements OnInit {
  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private mainService: MainService,
    private notifyService: NotifyService
  ) {
    this.form = fb.group({
      _id: [""],
      id: [""],
      taskId: ["", Validators.required],
      title: ["", Validators.required],
      description: [""],
      isCompleted: [false],
      priority: ["", Validators.required],
      order: [0],
      isDeleted: [false],
      createdAt: [""],
      updatedAt: [""],
    });
  }

  taskId: string = "";
  todoId: string = "";
  form: FormGroup;
  isEdit: boolean = false;
  isSubmitting: boolean = false;

  projectInfo: Todo | null = null;
  taskInfo: Task | null = null;

  priorityOptions: PriorityOption[] = [
    {
      value: PriorityTask.LOW,
      label: "Low",
      colorClass: "bg-blue-500",
    },
    {
      value: PriorityTask.MEDIUM,
      label: "Medium",
      colorClass: "bg-yellow-500",
    },
    {
      value: PriorityTask.HIGH,
      label: "High",
      colorClass: "bg-red-500",
    },
  ];

  ngOnInit() {
    this.route.params.subscribe((params: any) => {
      if (params.todoId) {
        this.todoId = params.todoId;
        this.loadProjectInfo(params.todoId);
      }
      if (params.taskId) {
        this.taskId = params.taskId;
        this.form.controls["taskId"].setValue(params.taskId);
        this.loadTaskInfo(params.taskId);
      }
      if (params.subtaskId) {
        this.getSubtaskInfo(params.subtaskId);
        this.isEdit = true;
      }
    });
  }

  getSubtaskInfo(subtaskId: string) {
    this.mainService
      .getByField<Subtask>("subtask", "id", subtaskId)
      .then((response: Response<Subtask>) => {
        if (response.status == ResponseStatus.SUCCESS) {
          this.form.patchValue(response.data);
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message ?? err.toString());
      });
  }

  back() {
    this.location.back();
  }

  loadProjectInfo(todoId: string) {
    this.mainService
      .getByField<Todo>("todo", "id", todoId)
      .then((response: Response<Todo>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.projectInfo = response.data;
        }
      })
      .catch((err: Response<string>) => {
        console.error("Error loading project info:", err);
      });
  }

  loadTaskInfo(taskId: string) {
    this.mainService
      .getByField<Task>("task", "id", taskId)
      .then((response: Response<Task>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.taskInfo = response.data;
        }
      })
      .catch((err: Response<string>) => {
        console.error("Error loading task info:", err);
      });
  }

  duplicateSubtask() {
    if (this.form.valid) {
      this.mainService
        .getAllByField<Subtask[]>("subtask", "taskId", this.taskId)
        .then((response: Response<Subtask[]>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            const order = response.data.length;
            const currentData = this.form.value;
            const duplicateData = {
              ...currentData,
              id: "",
              _id: "",
              title: `${currentData.title} (Copy)`,
              isCompleted: false,
              order: order,
            };

            this.mainService
              .create<string, Subtask>("subtask", duplicateData)
              .then((response: Response<string>) => {
                this.notifyService.showNotify(response.status, response.message);
                if (response.status === ResponseStatus.SUCCESS) {
                  this.notifyService.showSuccess("Subtask duplicated successfully");
                }
              })
              .catch((err: Response<string>) => {
                this.notifyService.showError(err.message ?? err.toString());
              });
          } else {
            this.notifyService.showError("Failed to get existing subtasks count");
          }
        })
        .catch((err: Response<string>) => {
          this.notifyService.showError("Failed to get existing subtasks count");
        });
    }
  }

  viewTaskDetails() {
    if (this.todoId && this.taskId) {
      this.router.navigate(["/todos", this.todoId, "tasks", this.taskId, "edit_task"]);
    }
  }

  onSubmit() {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((control) => {
        control.markAsTouched();
      });
      this.notifyService.showError("Please fill in all required fields");
      return;
    }

    if (this.form.valid) {
      this.isSubmitting = true;
      if (this.isEdit) {
        this.updateSubtask();
      } else {
        this.createSubtask();
      }
    }
  }

  createSubtask() {
    if (this.form.valid) {
      this.mainService
        .getAllByField<Subtask[]>("subtask", "taskId", this.taskId)
        .then((response: Response<Subtask[]>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            const order = response.data.length;
            const body = {
              ...this.form.value,
              order: order,
            };

            this.mainService
              .create<string, Subtask>("subtask", body)
              .then((response: Response<string>) => {
                this.isSubmitting = false;
                this.notifyService.showNotify(response.status, response.message);
                if (response.status == ResponseStatus.SUCCESS) {
                  this.back();
                }
              })
              .catch((err: Response<string>) => {
                this.isSubmitting = false;
                this.notifyService.showError(err.message ?? err.toString());
              });
          } else {
            this.isSubmitting = false;
            this.notifyService.showError("Failed to get existing subtasks count");
          }
        })
        .catch((err: Response<string>) => {
          this.isSubmitting = false;
          this.notifyService.showError("Failed to get existing subtasks count");
        });
    } else {
      this.isSubmitting = false;
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  updateSubtask() {
    if (this.form.valid) {
      const body = this.form.value;
      this.mainService
        .update<string, Subtask>("subtask", body.id, body)
        .then((response: Response<string>) => {
          this.isSubmitting = false;
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            this.back();
          }
        })
        .catch((err: Response<string>) => {
          this.isSubmitting = false;
          this.notifyService.showError(err.message ?? err.toString());
        });
    } else {
      this.isSubmitting = false;
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
