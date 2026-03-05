/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component, OnDestroy, OnInit, signal } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { Subscription } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatRadioModule } from "@angular/material/radio";
import { MatDatepickerModule, MatCalendarCellCssClasses } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";

/* models */
import { PriorityTask, Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Todo } from "@models/todo.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { ShortcutService } from "@services/shortcut.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* helpers */
import {
  normalizeSubtaskDates,
  convertDatesToUtc,
  convertDatesFromUtcToLocal,
} from "@helpers/date-conversion.helper";

interface PriorityOption {
  value: PriorityTask;
  label: string;
  colorClass: string;
}

@Component({
  selector: "app-manage-subtask",
  standalone: true,
  providers: [AuthService, DataSyncProvider],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  templateUrl: "./manage-subtask.view.html",
})
export class ManageSubtaskView implements OnInit, OnDestroy {
  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private notifyService: NotifyService,
    private authService: AuthService,
    private dataSyncProvider: DataSyncProvider,
    private shortcutService: ShortcutService
  ) {
    this.form = fb.group({
      _id: [""],
      id: [""],
      taskId: ["", Validators.required],
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

  taskId = signal("");
  todoId = signal("");
  form: FormGroup;
  isEdit = signal(false);
  isSubmitting = signal(false);
  today = new Date();

  private saveSubscription: Subscription | null = null;

  dateClass = (date: Date): MatCalendarCellCssClasses => {
    const endDateValue = this.form.get("endDate")?.value;
    if (endDateValue) {
      const endDate = new Date(endDateValue);
      return date.getDate() === endDate.getDate() &&
        date.getMonth() === endDate.getMonth() &&
        date.getFullYear() === endDate.getFullYear()
        ? "end-date-marker"
        : "";
    }
    return "";
  };

  projectInfo = signal<Todo | null>(null);
  taskInfo = signal<Task | null>(null);

  userId: string = "";
  isOwner: boolean = true;
  isPrivate: boolean = true;

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
    this.saveSubscription = this.shortcutService.save$.subscribe(() => {
      this.onSubmit();
    });

    this.route.queryParams.subscribe((queryParams: any) => {
      if (queryParams.isPrivate !== undefined) {
        this.isPrivate = queryParams.isPrivate === "true";
      }
    });

    this.userId = this.authService.getValueByKey("id");

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

  ngOnDestroy(): void {
    this.saveSubscription?.unsubscribe();
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

  getSubtaskInfo(subtaskId: string) {
    this.dataSyncProvider
      .getAll<Subtask>(
        "subtask",
        { id: subtaskId },
        { isOwner: this.isOwner, isPrivate: this.isPrivate },
        this.todoId()
      )
      .subscribe({
        next: (subtasks) => {
          if (subtasks.length > 0) {
            const localDates = convertDatesFromUtcToLocal(subtasks[0]);
            this.form.patchValue(localDates);

            const startDate = localDates.startDate;
            const endDate = localDates.endDate;
            if (startDate && endDate) {
              this.updateEndDateValidation(startDate, endDate);
            }
          }
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to load subtask");
        },
      });
  }

  back() {
    this.location.back();
  }

  loadProjectInfo(todoId: string) {
    this.dataSyncProvider
      .get<Todo>(
        "todo",
        { id: todoId },
        { isOwner: this.isPrivate ? true : false, isPrivate: this.isPrivate }
      )
      .subscribe({
        next: (todo) => {
          this.projectInfo.set(todo);

          this.isOwner = todo.userId === this.userId;
          this.isPrivate = todo.visibility === "private";
        },
        error: (err) => {
          console.error("Error loading project info:", err);
        },
      });
  }

  loadTaskInfo(taskId: string) {
    this.dataSyncProvider
      .get<Task>("task", { id: taskId }, { isOwner: this.isOwner, isPrivate: this.isPrivate })
      .subscribe({
        next: (task) => {
          this.taskInfo.set(task);
        },
        error: (err) => {
          console.error("Error loading task info:", err);
        },
      });
  }

  duplicateSubtask() {
    if (this.form.valid) {
      this.dataSyncProvider
        .getAll<Subtask>(
          "subtask",
          { taskId: this.taskId() },
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todoId()
        )
        .subscribe({
          next: (subtasks) => {
            const order = subtasks.length;
            const currentData = this.form.value;
            const normalizedFormValue = normalizeSubtaskDates(currentData);
            const convertedDates = convertDatesToUtc(normalizedFormValue);
            const duplicateData = {
              ...convertedDates,
              id: "",
              _id: "",
              title: `${currentData.title} (Copy)`,
              status: TaskStatus.PENDING,
              order: order,
            };

            this.dataSyncProvider
              .create<any>(
                "subtask",
                duplicateData,
                { isOwner: this.isOwner, isPrivate: this.isPrivate },
                this.todoId()
              )
              .subscribe({
                next: (result) => {
                  this.notifyService.showSuccess("Subtask duplicated successfully");
                },
                error: (err) => {
                  this.notifyService.showError(err.message || "Failed to duplicate subtask");
                },
              });
          },
          error: (err) => {
            this.notifyService.showError("Failed to get existing subtasks count");
          },
        });
    }
  }

  viewTaskDetails() {
    if (this.todoId() && this.taskId()) {
      this.router.navigate(["/todos", this.todoId(), "tasks", this.taskId(), "edit_task"]);
    }
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
        this.updateSubtask();
      } else {
        this.createSubtask();
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
      return true;
    }

    if (!date) {
      return false;
    }

    const startDate = new Date(startDateValue);
    startDate.setHours(0, 0, 0, 0);
    return date >= startDate;
  };

  clearDates() {
    this.form.get("startDate")?.setValue("");
    this.form.get("endDate")?.setValue("");
  }

  createSubtask() {
    if (this.form.valid) {
      this.dataSyncProvider
        .getAll<Subtask>(
          "subtask",
          { field: "taskId", value: this.taskId() },
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.todoId()
        )
        .subscribe({
          next: (subtasks) => {
            const length = subtasks.length;
            const formValue = this.form.value;
            const normalizedFormValue = normalizeSubtaskDates(formValue);
            const convertedDates = convertDatesToUtc(normalizedFormValue);
            const body = {
              ...convertedDates,
              order: length,
              taskId: this.taskId(),
            };

            this.dataSyncProvider
              .create<any>(
                "subtask",
                body,
                { isOwner: this.isOwner, isPrivate: this.isPrivate },
                this.projectInfo()?.id
              )
              .subscribe({
                next: (result) => {
                  this.isSubmitting.set(false);
                  this.notifyService.showSuccess("Subtask created successfully");
                  this.back();
                },
                error: (err) => {
                  this.isSubmitting.set(false);
                  this.notifyService.showError(err.message || "Failed to create subtask");
                },
              });
          },
          error: (err) => {
            this.isSubmitting.set(false);
            this.notifyService.showError("Failed to get existing subtasks count");
          },
        });
    } else {
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  updateSubtask() {
    if (this.form.valid) {
      const formValue = this.form.value;
      const normalizedFormValue = normalizeSubtaskDates(formValue);
      const convertedDates = convertDatesToUtc(normalizedFormValue);
      const body = {
        ...convertedDates,
      };

      this.dataSyncProvider
        .update<any>(
          "subtask",
          body.id,
          body,
          { isOwner: this.isOwner, isPrivate: this.isPrivate },
          this.projectInfo()?.id
        )
        .subscribe({
          next: (result) => {
            this.isSubmitting.set(false);
            this.notifyService.showSuccess("Subtask updated successfully");
            this.back();
          },
          error: (err) => {
            this.isSubmitting.set(false);
            this.notifyService.showError(err.message || "Failed to update subtask");
          },
        });
    } else {
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
