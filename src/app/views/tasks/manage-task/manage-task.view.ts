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
import { PriorityTask, Task, TaskStatus } from "@models/task.model";
import { Todo } from "@models/todo.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { DataSyncProvider } from "@services/data-sync.provider";

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
  providers: [AuthService, DataSyncProvider],
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
    private notifyService: NotifyService,
    private authService: AuthService,
    private dataSyncProvider: DataSyncProvider
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
    this.dataSyncProvider.get<Task>("task", { id: taskId }).subscribe({
      next: (taskData) => {
        this.form.patchValue(taskData);

        const startDate = taskData.startDate;
        const endDate = taskData.endDate;
        if (startDate && endDate) {
          this.updateEndDateValidation(startDate, endDate);
        }
      },
      error: (err) => {
        this.notifyService.showError(err.message || "Failed to load task");
      },
    });
  }

  back() {
    this.location.back();
  }

  loadProjectInfo(todoId: string) {
    this.dataSyncProvider.get<Todo>("todo", { id: todoId }).subscribe({
      next: (todo) => {
        this.projectInfo.set(todo);

        // Set up checkers for DataSyncProvider based on loaded project info
        this.dataSyncProvider.setOwnershipChecker((id: string) => {
          return this.projectInfo()?.userId === this.authService.getValueByKey("id");
        });

        this.dataSyncProvider.setTeamChecker((id: string) => {
          return this.projectInfo()?.visibility === "team";
        });

        this.dataSyncProvider.setAccessChecker((id: string) => {
          const currentUserId = this.authService.getValueByKey("id");
          const isOwner = this.projectInfo()?.userId === currentUserId;
          const assignees = this.projectInfo()?.assignees || [];
          const isAssignee = assignees.some((assignee: any) => assignee.id === currentUserId);
          return isOwner || isAssignee;
        });
      },
      error: (err) => {
        console.error("Error loading project info:", err);
      },
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
      // First get the order
      this.dataSyncProvider
        .getAll<Task>("task", { field: "todoId", value: this.todoId() }, this.todoId())
        .subscribe({
          next: (tasks) => {
            const formValue = this.form.value;
            const normalizedFormValue = normalizeTaskDates(formValue);
            const length = tasks.length;
            const body = {
              ...normalizedFormValue,
              order: length,
              todoId: this.todoId(),
            };

            this.dataSyncProvider.create<Task>("task", body, this.todoId()).subscribe({
              next: (result) => {
                this.isSubmitting.set(false);
                this.notifyService.showSuccess("Task created successfully");
                this.back();
              },
              error: (err) => {
                this.isSubmitting.set(false);
                this.notifyService.showError(err.message || "Failed to create task");
              },
            });
          },
          error: (err) => {
            this.isSubmitting.set(false);
            this.notifyService.showError("Failed to get existing tasks count");
          },
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

      this.dataSyncProvider.update<Task>("task", body.id, body, this.todoId()).subscribe({
        next: (result) => {
          this.isSubmitting.set(false);
          this.notifyService.showSuccess("Task updated successfully");
          this.back();
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.notifyService.showError(err.message || "Failed to update task");
        },
      });
    } else {
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
