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
import { Subscription, firstValueFrom } from "rxjs";

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
import { FormValidatorService } from "@services/form-validator.service";
import { DateValidatorService } from "@services/date-validator.service";
import { StorageService } from "@services/storage.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* helpers */
import {
  normalizeDateFields,
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
    private storageService: StorageService,
    private shortcutService: ShortcutService,
    private formValidator: FormValidatorService,
    private dateValidator: DateValidatorService
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
        this.dateValidator.updateEndDateValidation(this.form, startDate);
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
    { value: PriorityTask.LOW, label: "Low", colorClass: "bg-blue-500" },
    { value: PriorityTask.MEDIUM, label: "Medium", colorClass: "bg-yellow-500" },
    { value: PriorityTask.HIGH, label: "High", colorClass: "bg-red-500" },
  ];

  ngOnInit() {
    this.saveSubscription = this.shortcutService.save$.subscribe(() => {
      this.onSubmit();
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

  endDateFilter = (date: Date | null): boolean => {
    return this.dateValidator.createEndDateFilter("startDate", this.form)(date);
  };

  async getSubtaskInfo(subtaskId: string) {
    try {
      const todoId = this.todoId();
      const subtasks = await firstValueFrom(
        this.dataSyncProvider.getAll<Subtask>("subtasks", { id: subtaskId }, undefined, todoId)
      );
      if (subtasks.length > 0) {
        const localDates = convertDatesFromUtcToLocal(subtasks[0]);
        this.form.patchValue(localDates);
        if (localDates.startDate)
          this.dateValidator.updateEndDateValidation(this.form, localDates.startDate);
      }
    } catch (err: any) {
      this.notifyService.showError(err.message || "Failed to load subtask");
    }
  }

  back() {
    this.location.back();
  }

  loadProjectInfo(todoId: string) {
    const cachedTodo = this.storageService.getTodoById(todoId);
    if (cachedTodo) {
      this.projectInfo.set(cachedTodo);
      this.isOwner = cachedTodo.userId === this.userId;
      this.isPrivate = cachedTodo.visibility === "private";
      return;
    }

    this.dataSyncProvider.get<Todo>("todos", { id: todoId }).subscribe({
      next: (todo) => {
        this.projectInfo.set(todo);
        this.isOwner = todo.userId === this.userId;
        this.isPrivate = todo.visibility === "private";
      },
      error: (err) => {
        // Error loading project info
      },
    });
  }

  loadTaskInfo(taskId: string) {
    this.dataSyncProvider.get<Task>("tasks", { id: taskId }, undefined, this.todoId()).subscribe({
      next: (task) => this.taskInfo.set(task),
      error: (err) => {
        // Error loading task info
      },
    });
  }

  async duplicateSubtask() {
    if (this.form.valid) {
      try {
        const todoId = this.todoId();
        const subtasks = await firstValueFrom(
          this.dataSyncProvider.getAll<Subtask>(
            "subtasks",
            { taskId: this.taskId() },
            undefined,
            todoId
          )
        );
        const formValue = this.form.value;
        const normalizedFormValue = normalizeDateFields(formValue);
        const convertedDates = convertDatesToUtc(normalizedFormValue);
        const duplicateData = {
          ...convertedDates,
          id: "",
          _id: "",
          title: `${formValue.title} (Copy)`,
          status: TaskStatus.PENDING,
          order: subtasks.length,
        };

        this.dataSyncProvider
          .create<Subtask>("subtasks", duplicateData, undefined, todoId)
          .subscribe({
            next: (result: Subtask) => {
              // Manually add to storage
              this.storageService.addItem("subtask", result);
              this.notifyService.showSuccess("Subtask duplicated successfully");
            },
            error: (err) =>
              this.notifyService.showError(err.message || "Failed to duplicate subtask"),
          });
      } catch (err) {
        this.notifyService.showError("Failed to get existing subtasks count");
      }
    }
  }

  viewTaskDetails() {
    if (this.todoId() && this.taskId()) {
      this.router.navigate(["/todos", this.todoId(), "tasks", this.taskId(), "edit_task"]);
    }
  }

  onSubmit() {
    if (!this.dateValidator.validateDatesFromForm(this.form)) return;
    if (!this.formValidator.validateForm(this.form, this.isSubmitting())) return;

    this.isSubmitting.set(true);
    if (this.isEdit()) this.updateSubtask();
    else this.createSubtask();
  }

  validateDates(): boolean {
    return this.dateValidator.validateDatesFromForm(this.form);
  }

  clearDates() {
    this.form.get("startDate")?.setValue("");
    this.form.get("endDate")?.setValue("");
  }

  async createSubtask() {
    if (this.form.valid) {
      try {
        const todoId = this.todoId();
        const subtasks = await firstValueFrom(
          this.dataSyncProvider.getAll<Subtask>(
            "subtasks",
            { field: "taskId", value: this.taskId() },
            undefined,
            todoId
          )
        );
        const formValue = this.form.value;
        const normalizedFormValue = normalizeDateFields(formValue);
        const convertedDates = convertDatesToUtc(normalizedFormValue);
        const body = { ...convertedDates, order: subtasks.length, taskId: this.taskId() };

        this.dataSyncProvider.create<Subtask>("subtasks", body, undefined, todoId).subscribe({
          next: (result: Subtask) => {
            // Manually add to storage
            this.storageService.addItem("subtask", result);
            this.isSubmitting.set(false);
            this.notifyService.showSuccess("Subtask created successfully");
            this.back();
          },
          error: (err) => {
            this.isSubmitting.set(false);
            this.notifyService.showError(err.message || "Failed to create subtask");
          },
        });
      } catch (err) {
        this.isSubmitting.set(false);
        this.notifyService.showError("Failed to get existing subtasks count");
      }
    } else {
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  updateSubtask() {
    if (this.form.valid) {
      const todoId = this.todoId();
      const formValue = this.form.value;
      const normalizedFormValue = normalizeDateFields(formValue);
      const convertedDates = convertDatesToUtc(normalizedFormValue);
      const body = { ...convertedDates };

      this.dataSyncProvider.update<any>("subtasks", body.id, body, undefined, todoId).subscribe({
        next: (result: Subtask) => {
          // Manually update storage
          this.storageService.updateItem("subtask", result.id, result);
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
