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
import { MatRadioModule } from "@angular/material/radio";
import { MatInputModule } from "@angular/material/input";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatSelectModule } from "@angular/material/select";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { PriorityTask, Task, TaskStatus } from "@models/task.model";
import { Todo } from "@models/todo.model";

/* services */
import { AuthService } from "@services/auth.service";
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";

/* helpers */
import { normalizeTaskDates } from "@helpers/date-conversion.helper";

interface PriorityOption {
  value: PriorityTask;
  label: string;
  description: string;
  colorClass: string;
}

@Component({
  selector: "app-manage-task",
  standalone: true,
  providers: [AuthService, MainService],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatIconModule,
    MatRadioModule,
    MatDatepickerModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: "./manage-task.view.html",
})
export class ManageTaskView implements OnInit {
  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private location: Location,
    private mainService: MainService,
    private notifyService: NotifyService
  ) {
    this.form = fb.group({
      _id: [""],
      id: [""],
      todoId: ["", Validators.required],
      title: ["", Validators.required],
      description: [""],
      status: [TaskStatus.PENDING],
      priority: ["", Validators.required],
      startDate: [""],
      endDate: [""],
      order: [0],
      isDeleted: [false],
      createdAt: [""],
      updatedAt: [""],
    });

    this.form.get("startDate")?.valueChanges.subscribe((startDate) => {
      const endDateControl = this.form.get("endDate");
      if (!startDate) {
        endDateControl?.setValue("");
      } else {
        this.updateEndDateValidation(startDate, endDateControl?.value);
      }
    });
  }

  todoId = signal("");
  form: FormGroup;
  isEdit = signal(false);
  isSubmitting = signal(false);

  projectInfo = signal<Todo | null>(null);
  newSubtaskTitle = signal("");

  priorityOptions: PriorityOption[] = [
    {
      value: PriorityTask.LOW,
      label: "Low Priority",
      description: "Nice to have, no rush",
      colorClass: "bg-blue-500",
    },
    {
      value: PriorityTask.MEDIUM,
      label: "Medium Priority",
      description: "Important, plan accordingly",
      colorClass: "bg-yellow-500",
    },
    {
      value: PriorityTask.HIGH,
      label: "High Priority",
      description: "Critical, needs attention",
      colorClass: "bg-red-500",
    },
  ];

  ngOnInit() {
    this.route.params.subscribe((params: any) => {
      if (params.todoId) {
        this.todoId.set(params.todoId);
        this.form.controls["todoId"].setValue(params.todoId);
        this.loadProjectInfo(params.todoId);
      }
      if (params.taskId) {
        this.getTaskInfo(params.taskId);
        this.isEdit.set(true);
      }
    });
  }

  updateEndDateValidation(startDate: string, currentEndDate: string) {
    if (startDate && currentEndDate) {
      const start = new Date(startDate);
      const end = new Date(currentEndDate);
      if (end < start) {
        this.form.get("endDate")?.setValue("");
      }
    }
  }

  getTaskInfo(taskId: string) {
    this.mainService
      .getByField<Task>("task", "id", taskId)
      .then((response: Response<Task>) => {
        if (response.status == ResponseStatus.SUCCESS) {
          const taskData = response.data;
          this.form.patchValue(taskData);

          const startDate = taskData.startDate;
          const endDate = taskData.endDate;
          if (startDate && endDate) {
            this.updateEndDateValidation(startDate, endDate);
          }
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

  onSubmit() {
    if (!this.validateDates()) {
      return;
    }

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
        this.updateTask();
      } else {
        this.createTask();
      }
    }
  }

  validateDates(): boolean {
    const startDate = this.form.get("startDate")?.value;
    const endDate = this.form.get("endDate")?.value;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (end < start) {
        this.notifyService.showError("End date cannot be earlier than start date");
        return false;
      }
    }

    if (!startDate && endDate) {
      this.form.get("endDate")?.setValue("");
    }

    return true;
  }

  endDateFilter = (date: Date | null): boolean => {
    const startDateValue = this.form.get("startDate")?.value;
    if (!startDateValue) {
      return false;
    }

    if (!date) {
      return false;
    }

    const startDate = new Date(startDateValue);
    return date >= startDate;
  };

  clearDates() {
    this.form.get("startDate")?.setValue("");
    this.form.get("endDate")?.setValue("");
  }

  createTask() {
    if (this.form.valid) {
      this.mainService
        .getAllByField<Task[]>("task", "todoId", this.todoId())
        .then((response: Response<Task[]>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            const existingTasks = response.data;

            const updatedTasks = existingTasks.map((task) => ({
              ...task,
              order: task.order + 1,
            }));

            if (updatedTasks.length > 0) {
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

              this.mainService
                .updateAll<string, any>("task", transformedTasks)
                .then((updateResponse: Response<string>) => {
                  if (updateResponse.status !== ResponseStatus.SUCCESS) {
                    this.notifyService.showError("Failed to update existing tasks order");
                    this.isSubmitting.set(false);
                    return;
                  }

                  const formValue = this.form.value;
                  const normalizedFormValue = normalizeTaskDates(formValue);
                  const body = {
                    ...normalizedFormValue,
                    order: 0,
                  };

                  this.mainService
                    .create<string, Task>("task", body)
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
              const formValue = this.form.value;
              const normalizedFormValue = normalizeTaskDates(formValue);
              const body = {
                ...normalizedFormValue,
                order: 0,
              };

              this.mainService
                .create<string, Task>("task", body)
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
            this.notifyService.showError("Failed to get existing tasks count");
          }
        })
        .catch((err: Response<string>) => {
          this.isSubmitting.set(false);
          this.notifyService.showError("Failed to get existing tasks count");
        });
    } else {
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  updateTask() {
    if (this.form.valid) {
      const formValue = this.form.value;
      const normalizedFormValue = normalizeTaskDates(formValue);
      const body = {
        ...normalizedFormValue,
      };

      this.mainService
        .update<string, Task>("task", body.id, body)
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
