/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
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
import { Response, ResponseStatus } from "@models/response.model";
import { PriorityTask, Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Todo } from "@models/todo.model";

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
      status: [TaskStatus.PENDING],
      priority: ["", Validators.required],
      order: [0],
      isDeleted: [false],
      createdAt: [""],
      updatedAt: [""],
    });
  }

  taskId = signal("");
  todoId = signal("");
  form: FormGroup;
  isEdit = signal(false);
  isSubmitting = signal(false);

  projectInfo = signal<Todo | null>(null);
  taskInfo = signal<Task | null>(null);

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
        this.todoId.set(params.todoId);
        this.loadProjectInfo(params.todoId);
      }
      if (params.taskId) {
        this.taskId.set(params.taskId);
        this.form.controls["taskId"].setValue(params.taskId);
        this.loadTaskInfo(params.taskId);
      }
      if (params.subtaskId) {
        this.getSubtaskInfo(params.subtaskId);
        this.isEdit.set(true);
      }
    });
  }

  getSubtaskInfo(subtaskId: string) {
    this.mainService
      .getByField<Subtask>("subtask", "id", subtaskId)
      .then((response: Response<Subtask>) => {
        if (response.status == ResponseStatus.SUCCESS) {
          const subtaskData = response.data;
          this.form.patchValue(subtaskData);
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
          this.projectInfo.set(response.data);
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
          this.taskInfo.set(response.data);
        }
      })
      .catch((err: Response<string>) => {
        console.error("Error loading task info:", err);
      });
  }

  duplicateSubtask() {
    if (this.form.valid) {
      this.mainService
        .getAllByField<Subtask[]>("subtask", "taskId", this.taskId())
        .then((response: Response<Subtask[]>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            const order = response.data.length;
            const currentData = this.form.value;
            const duplicateData = {
              ...currentData,
              id: "",
              _id: "",
              title: `${currentData.title} (Copy)`,
              status: TaskStatus.PENDING,
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
    if (this.todoId() && this.taskId()) {
      this.router.navigate(["/todos", this.todoId(), "tasks", this.taskId(), "edit_task"]);
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
      this.isSubmitting.set(true);
      if (this.isEdit()) {
        this.updateSubtask();
      } else {
        this.createSubtask();
      }
    }
  }

  createSubtask() {
    if (this.form.valid) {
      this.mainService
        .getAllByField<Subtask[]>("subtask", "taskId", this.taskId())
        .then((response: Response<Subtask[]>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            const existingSubtasks = response.data;

            const updatedSubtasks = existingSubtasks.map((subtask) => ({
              ...subtask,
              order: subtask.order + 1,
            }));

            if (updatedSubtasks.length > 0) {
              const transformedSubtasks = updatedSubtasks.map((subtask) => ({
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
                .then((updateResponse: Response<string>) => {
                  if (updateResponse.status !== ResponseStatus.SUCCESS) {
                    this.notifyService.showError("Failed to update existing subtasks order");
                    this.isSubmitting.set(false);
                    return;
                  }

                  const body = {
                    ...this.form.value,
                    order: 0,
                  };

                  this.mainService
                    .create<string, Subtask>("subtask", body)
                    .then((createResponse: Response<string>) => {
                      this.isSubmitting.set(false);
                      this.notifyService.showNotify(createResponse.status, createResponse.message);
                      if (createResponse.status == ResponseStatus.SUCCESS) {
                        this.back();
                      }
                    })
                    .catch((createErr: Response<string>) => {
                      this.isSubmitting.set(false);
                      this.notifyService.showError(createErr.message ?? createErr.toString());
                    });
                })
                .catch((updateErr: Response<string>) => {
                  this.isSubmitting.set(false);
                  this.notifyService.showError(updateErr.message ?? updateErr.toString());
                });
            } else {
              const body = {
                ...this.form.value,
                order: 0,
              };

              this.mainService
                .create<string, Subtask>("subtask", body)
                .then((response: Response<string>) => {
                  this.isSubmitting.set(false);
                  this.notifyService.showNotify(response.status, response.message);
                  if (response.status == ResponseStatus.SUCCESS) {
                    this.back();
                  }
                })
                .catch((err: Response<string>) => {
                  this.isSubmitting.set(false);
                  this.notifyService.showError(err.message ?? err.toString());
                });
            }
          } else {
            this.isSubmitting.set(false);
            this.notifyService.showError("Failed to get existing subtasks count");
          }
        })
        .catch((err: Response<string>) => {
          this.isSubmitting.set(false);
          this.notifyService.showError("Failed to get existing subtasks count");
        });
    } else {
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  updateSubtask() {
    if (this.form.valid) {
      const body = this.form.value;
      this.mainService
        .update<string, Subtask>("subtask", body.id, body)
        .then((response: Response<string>) => {
          this.isSubmitting.set(false);
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            this.back();
          }
        })
        .catch((err: Response<string>) => {
          this.isSubmitting.set(false);
          this.notifyService.showError(err.message ?? err.toString());
        });
    } else {
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
