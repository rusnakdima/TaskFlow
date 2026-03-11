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
import { ActivatedRoute } from "@angular/router";
import { Subscription, firstValueFrom } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatRadioModule } from "@angular/material/radio";
import { MatInputModule } from "@angular/material/input";
import { MatDatepickerModule, MatCalendarCellCssClasses } from "@angular/material/datepicker";
import { MatSelectModule } from "@angular/material/select";
import { MatNativeDateModule } from "@angular/material/core";

/* models */
import { PriorityTask, Task, TaskStatus, RepeatInterval } from "@models/task.model";
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
export class ManageTaskView implements OnInit, OnDestroy {
  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
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
      todoId: ["", Validators.required],
      title: ["", Validators.required],
      description: [""],
      status: [TaskStatus.PENDING],
      priority: ["", Validators.required],
      startDate: [""],
      endDate: [""],
      repeat: [RepeatInterval.NONE],
      order: [0],
      isDeleted: [false],
      createdAt: [""],
      updatedAt: [""],
      dependsOn: [[]],
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
  newSubtaskTitle = signal("");
  availableTasksForDependency = signal<Task[]>([]);

  userId = "";
  isOwner: boolean = true;
  isPrivate: boolean = true;

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

  repeatOptions = [
    { value: RepeatInterval.NONE, label: "None" },
    { value: RepeatInterval.DAILY, label: "Daily" },
    { value: RepeatInterval.WEEKLY, label: "Weekly" },
    { value: RepeatInterval.MONTHLY, label: "Monthly" },
  ];

  ngOnInit() {
    this.saveSubscription = this.shortcutService.save$.subscribe(() => {
      this.onSubmit();
    });

    this.userId = this.authService.getValueByKey("id");
    this.route.params.subscribe((params: any) => {
      if (params.todoId) {
        this.todoId.set(params.todoId);
        this.form.controls["todoId"].setValue(params.todoId);
        this.loadProjectInfo(params.todoId);
      }
      if (params.taskId && params.taskId.trim() !== "") {
        this.getTaskInfo(params.taskId);
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

  getTaskInfo(taskId: string) {
    // First, try to get from storage
    const taskFromStorage = this.storageService.getTaskById(taskId);
    if (taskFromStorage) {
      const localDates = convertDatesFromUtcToLocal(taskFromStorage);
      this.form.patchValue(localDates);

      const startDate = localDates.startDate;
      const endDate = localDates.endDate;
      if (startDate && endDate) {
        this.dateValidator.updateEndDateValidation(this.form, startDate);
      }
      return;
    }

    // Fallback to fetch if not in storage
    this.dataSyncProvider.get<Task>("tasks", { id: taskId }).subscribe({
      next: (taskData) => {
        const localDates = convertDatesFromUtcToLocal(taskData);
        this.form.patchValue(localDates);

        const startDate = localDates.startDate;
        const endDate = localDates.endDate;
        if (startDate && endDate) {
          this.dateValidator.updateEndDateValidation(this.form, startDate);
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
    // Try to get from storage first
    const cachedTodo = this.storageService.getTodoById(todoId);
    if (cachedTodo) {
      this.projectInfo.set(cachedTodo);
      this.isOwner = cachedTodo.userId === this.userId;
      this.isPrivate = cachedTodo.visibility === "private";
      return;
    }

    // Fallback to fetch if not in storage
    this.dataSyncProvider.get<Todo>("todos", { id: todoId }).subscribe({
      next: (todo) => {
        this.projectInfo.set(todo);
        this.isOwner = todo.userId === this.userId;
        this.isPrivate = todo.visibility === "private";
      },
      error: (err) => {
        // Error loading project info - already in storage or fetch failed
      },
    });
  }

  onSubmit() {
    if (!this.dateValidator.validateDatesFromForm(this.form)) {
      return;
    }

    if (!this.formValidator.validateForm(this.form, this.isSubmitting())) {
      return;
    }

    this.isSubmitting.set(true);
    if (this.isEdit()) {
      this.updateTask();
    } else {
      this.createTask();
    }
  }

  validateDates(): boolean {
    return this.dateValidator.validateDatesFromForm(this.form);
  }

  clearDates() {
    this.form.get("startDate")?.setValue("");
    this.form.get("endDate")?.setValue("");
  }

  async createTask() {
    if (this.form.valid) {
      try {
        const todoId = this.projectInfo()?.id;
        if (!todoId) throw new Error("Project ID not found");

        const tasks = await firstValueFrom(this.dataSyncProvider.getAll<Task>("tasks", { todoId }));
        const formValue = this.form.value;
        const normalizedFormValue = normalizeDateFields(formValue);
        const convertedDates = convertDatesToUtc(normalizedFormValue);
        const body = {
          ...convertedDates,
          order: tasks.length,
          todoId: todoId,
        };

        this.dataSyncProvider.create<Task>("tasks", body, undefined, todoId).subscribe({
          next: (result: Task) => {
            // Manually add to storage to ensure it shows up immediately
            this.storageService.addItem("task", result);
            this.isSubmitting.set(false);
            this.notifyService.showSuccess("Task created successfully");
            this.back();
          },
          error: (err) => {
            this.isSubmitting.set(false);
            this.notifyService.showError(err.message || "Failed to create task");
          },
        });
      } catch (err) {
        this.isSubmitting.set(false);
        this.notifyService.showError("Failed to get existing tasks count");
      }
    } else {
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  updateTask() {
    if (this.form.valid) {
      const todoId = this.projectInfo()?.id;
      const formValue = this.form.value;
      const normalizedFormValue = normalizeDateFields(formValue);
      const convertedDates = convertDatesToUtc(normalizedFormValue);

      // Ensure id is included in the update payload
      const body = {
        ...convertedDates,
        id: formValue.id, // Include id field for backend validation
      };

      this.dataSyncProvider.update<Task>("tasks", body.id, body, undefined, todoId).subscribe({
        next: (result: Task) => {
          // Manually update storage
          this.storageService.updateItem("task", result.id, result);
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

  isTaskDependent(taskId: string): boolean {
    const dependsOn = this.form.get("dependsOn")?.value || [];
    return dependsOn.includes(taskId);
  }

  toggleDependency(taskId: string): void {
    const dependsOn = this.form.get("dependsOn")?.value || [];
    const index = dependsOn.indexOf(taskId);
    if (index === -1) dependsOn.push(taskId);
    else dependsOn.splice(index, 1);
    this.form.get("dependsOn")?.setValue([...dependsOn]);
  }

  checkDependenciesCompleted(dependsOn: string[]): boolean {
    if (!dependsOn || dependsOn.length === 0) return true;
    const tasks = this.projectInfo()?.tasks || [];
    return dependsOn.every((depId) => {
      const task = tasks.find((t) => t.id === depId);
      return task && (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.SKIPPED);
    });
  }
}
