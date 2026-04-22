/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component, OnDestroy, OnInit, signal, inject } from "@angular/core";
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

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* models */
import { PriorityTask, Task, TaskStatus, RepeatInterval, PriorityOption } from "@models/task.model";
import { Todo } from "@models/todo.model";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { StorageService } from "@services/core/storage.service";

/* helpers */
import { DateHelper } from "@helpers/date-helpers";
import { ValidationHelper } from "@helpers/validation.helper";

@Component({
  selector: "app-manage-task",
  standalone: true,
  providers: [AuthService, ApiProvider],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatIconModule,
    MatRadioModule,
    MatDatepickerModule,
    MatInputModule,
    MatSelectModule,
    CheckboxComponent,
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
    private dataSyncProvider: ApiProvider,
    private storageService: StorageService,
    private shortcutService: ShortcutService
  ) {
    this.form = fb.group({
      _id: [""],
      id: [""],
      todo_id: ["", Validators.required],
      title: ["", Validators.required],
      description: [""],
      status: [TaskStatus.PENDING],
      priority: ["", Validators.required],
      start_date: [""],
      end_date: [""],
      repeat: [RepeatInterval.NONE],
      order: [0],
      deleted_at: [false],
      created_at: [""],
      updated_at: [""],
      depends_on: [[]],
    });

    this.form.get("start_date")?.valueChanges.subscribe((startDate) => {
      const endDateControl = this.form.get("end_date");
      if (!startDate) {
        endDateControl?.setValue("");
      } else {
        ValidationHelper.updateEndDateValidation(this.form, startDate);
      }
    });

    this.dateClass = DateHelper.createDateClass(this.form);
  }

  todoId = signal("");
  form: FormGroup;
  isEdit = signal(false);
  isSubmitting = signal(false);
  today = new Date();

  private saveSubscription: Subscription | null = null;

  dateClass!: (date: Date) => MatCalendarCellCssClasses;

  projectInfo = signal<Todo | null>(null);
  newSubtaskTitle = signal("");
  availableTasksForDependency = signal<Task[]>([]);

  userId = "";
  isOwner = false;
  isPrivate = true;

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
        this.form.controls["todo_id"].setValue(params.todoId);
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
    return ValidationHelper.createEndDateFilter("start_date", this.form)(date);
  };

  getTaskInfo(taskId?: string) {
    if (!taskId) return;
    const taskFromStorage = this.storageService.getById("tasks", taskId);
    if (taskFromStorage) {
      const localDates = DateHelper.convertDatesFromUtcToLocal(taskFromStorage);
      this.form.patchValue(localDates);

      const startDate = localDates.start_date;
      const endDate = localDates.end_date;
      if (startDate && endDate) {
        ValidationHelper.updateEndDateValidation(this.form, startDate);
      }
      return;
    }

    this.dataSyncProvider.crud<Task>("get", "tasks", { id: taskId }).subscribe({
      next: (taskData: Task) => {
        const localDates = DateHelper.convertDatesFromUtcToLocal(taskData);
        this.form.patchValue(localDates);

        const startDate = localDates.start_date;
        const endDate = localDates.end_date;
        if (startDate && endDate) {
          ValidationHelper.updateEndDateValidation(this.form, startDate);
        }
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.notifyService.showError(message || "Failed to update task");
      },
    });
  }

  back() {
    this.location.back();
  }

  loadProjectInfo(todoId?: string) {
    if (!todoId) return;
    const cachedTodo = this.storageService.getById("todos", todoId);
    if (cachedTodo) {
      this.projectInfo.set(cachedTodo);
      this.isOwner = cachedTodo.user_id === this.userId;
      this.isPrivate = cachedTodo.visibility === "private";
      return;
    }

    this.dataSyncProvider.crud<Todo>("get", "todos", { id: todoId }).subscribe({
      next: (todo: Todo) => {
        this.projectInfo.set(todo);
        this.isOwner = todo.user_id === this.userId;
        this.isPrivate = todo.visibility === "private";
      },
      error: (err: unknown) => {
      },
    });
  }

  onSubmit() {
    if (!ValidationHelper.validateDates(this.form, this.notifyService)) {
      return;
    }

    if (!ValidationHelper.validateForm(this.form, this.notifyService, this.isSubmitting())) {
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
    return ValidationHelper.validateDates(this.form, this.notifyService);
  }

  clearDates() {
    this.form.get("start_date")?.setValue("");
    this.form.get("end_date")?.setValue("");
  }

  async createTask() {
    if (this.form.valid) {
      try {
        const todoId = this.projectInfo()?.id;
        if (!todoId) throw new Error("Project ID not found");

        const parentTodo = this.storageService.getById("todos", todoId);
        const isPrivate = parentTodo?.visibility !== "team";

        const tasks = this.storageService.getAllByParentId("tasks", todoId);
        const formValue = this.form.value;
        const normalizedFormValue = DateHelper.normalizeDateFields(formValue);
        const convertedDates = DateHelper.convertDatesToUtc(normalizedFormValue);
        const body = {
          ...convertedDates,
          order: tasks.length,
          todo_id: todoId,
        };

        this.dataSyncProvider
          .crud<Task>("create", "tasks", {
            data: body,
            parentTodoId: todoId,
            isOwner: this.isOwner,
            isPrivate: isPrivate,
          })
          .subscribe({
            next: (result: Task) => {
              this.isSubmitting.set(false);
              this.notifyService.showSuccess("Task created successfully");
              this.back();
            },
            error: (err: unknown) => {
              this.isSubmitting.set(false);
              const message = err instanceof Error ? err.message : String(err);
              this.notifyService.showError(message || "Failed to create task");
            },
          });
      } catch (err: unknown) {
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
      if (!todoId) {
        this.notifyService.showError("Project ID not found");
        return;
      }

      const parentTodo = this.storageService.getById("todos", todoId);
      const isPrivate = parentTodo?.visibility !== "team";

      const formValue = this.form.value;
      const normalizedFormValue = DateHelper.normalizeDateFields(formValue);
      const convertedDates = DateHelper.convertDatesToUtc(normalizedFormValue);

      const { _id, ...updateData } = convertedDates;

      this.dataSyncProvider
        .crud<Task>("update", "tasks", {
          id: formValue.id,
          data: updateData,
          parentTodoId: todoId,
          isPrivate: isPrivate,
        })
        .subscribe({
          next: (result: Task) => {
            this.isSubmitting.set(false);
            this.notifyService.showSuccess("Task updated successfully");
            this.back();
          },
          error: (err: unknown) => {
            this.isSubmitting.set(false);
            const message = err instanceof Error ? err.message : String(err);
            this.notifyService.showError(message || "Failed to update task");
          },
        });
    } else {
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  isTaskDependent(taskId?: string): boolean {
    const dependsOn = this.form.get("depends_on")?.value || [];
    return dependsOn.includes(taskId);
  }

  toggleDependency(taskId?: string): void {
    const dependsOn = this.form.get("depends_on")?.value || [];
    const index = dependsOn.indexOf(taskId);
    if (index === -1) dependsOn.push(taskId);
    else dependsOn.splice(index, 1);
    this.form.get("depends_on")?.setValue([...dependsOn]);
  }

  checkDependenciesCompleted(dependsOn: string[]): boolean {
    if (!dependsOn || dependsOn.length === 0) return true;
    const tasks = this.projectInfo()?.tasks || [];
    return dependsOn.every((depId: string) => {
      const task = tasks.find((t) => t.id === depId);
      return task && (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.SKIPPED);
    });
  }
}