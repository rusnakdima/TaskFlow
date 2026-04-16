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
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { StorageService } from "@services/core/storage.service";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* helpers */
import { DateHelper } from "@helpers/date-helpers";
import { ValidationHelper } from "@helpers/validation.helper";

interface PriorityOption {
  value: PriorityTask;
  label: string;
  colorClass: string;
}

@Component({
  selector: "app-manage-subtask",
  standalone: true,
  providers: [AuthService, ApiProvider],
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
    private dataSyncProvider: ApiProvider,
    private storageService: StorageService,
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
      deleted_at: [false],
      created_at: [""],
      updated_at: [""],
    });

    this.form.get("startDate")?.valueChanges.subscribe((startDate) => {
      const endDateControl = this.form.get("endDate");
      if (!startDate) {
        endDateControl?.setValue("");
      } else {
        ValidationHelper.updateEndDateValidation(this.form, startDate);
      }
    });

    this.dateClass = DateHelper.createDateClass(this.form);
  }

  taskId = signal("");
  todoId = signal("");
  form: FormGroup;
  isEdit = signal(false);
  isSubmitting = signal(false);
  today = new Date();

  private saveSubscription: Subscription | null = null;

  dateClass!: (date: Date) => MatCalendarCellCssClasses;

  projectInfo = signal<Todo | null>(null);
  taskInfo = signal<Task | null>(null);

  userId = "";
  isOwner = false;
  isPrivate = true;

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
      if (params.taskId && params.taskId.trim() !== "") {
        this.taskId.set(params.taskId);
        this.form.controls["taskId"].setValue(params.taskId);
        this.loadTaskInfo(params.taskId);
      }
      if (params.subtaskId && params.subtaskId.trim() !== "") {
        this.getSubtaskInfo(params.subtaskId);
        this.isEdit.set(true);
      }
    });
  }

  ngOnDestroy(): void {
    this.saveSubscription?.unsubscribe();
  }

  endDateFilter = (date: Date | null): boolean => {
    return ValidationHelper.createEndDateFilter("startDate", this.form)(date);
  };

  async getSubtaskInfo(subtaskId: string) {
    // First, try to get from storage
    const subtaskFromStorage = this.storageService.getById("subtasks", subtaskId);
    if (subtaskFromStorage) {
      const localDates = DateHelper.convertDatesFromUtcToLocal(subtaskFromStorage);
      this.form.patchValue(localDates);
      if (localDates.startDate)
        ValidationHelper.updateEndDateValidation(this.form, localDates.startDate);
      return;
    }

    // Fallback to fetch if not in storage
    try {
      const todoId = this.todoId();
      const subtasks = await firstValueFrom(
        this.dataSyncProvider.crud<Subtask[]>(
          "getAll",
          "subtasks",
          { filter: { id: subtaskId }, parentTodoId: todoId },
          true
        )
      );
      if (subtasks.length > 0) {
        const localDates = DateHelper.convertDatesFromUtcToLocal(subtasks[0]);
        this.form.patchValue(localDates);
        if (localDates.startDate)
          ValidationHelper.updateEndDateValidation(this.form, localDates.startDate);
      }
    } catch (err: any) {
      this.notifyService.showError(err.message || "Failed to load subtask");
    }
  }

  back() {
    this.location.back();
  }

  loadProjectInfo(todoId: string) {
    const cachedTodo = this.storageService.getById("todos", todoId);
    if (cachedTodo) {
      this.projectInfo.set(cachedTodo);
      this.isOwner = cachedTodo.userId === this.userId;
      this.isPrivate = cachedTodo.visibility === "private";
      return;
    }

    this.dataSyncProvider.crud<Todo>("get", "todos", { filter: { id: todoId } }).subscribe({
      next: (todo: Todo) => {
        this.projectInfo.set(todo);
        this.isOwner = todo.userId === this.userId;
        this.isPrivate = todo.visibility === "private";
      },
      error: (err: any) => {
        // Error loading project info
      },
    });
  }

  loadTaskInfo(taskId: string) {
    // First, try to get from storage
    const taskFromStorage = this.storageService.getById("tasks", taskId);
    if (taskFromStorage) {
      this.taskInfo.set(taskFromStorage);
      return;
    }

    // Fallback to fetch if not in storage
    this.dataSyncProvider
      .crud<Task>("get", "tasks", { filter: { id: taskId }, parentTodoId: this.todoId() })
      .subscribe({
        next: (task: Task) => this.taskInfo.set(task),
        error: (err: any) => {
          // Error loading task info
        },
      });
  }

  async duplicateSubtask() {
    if (this.form.valid) {
      try {
        const todoId = this.todoId();
        const subtasks = this.storageService.getAllByParentId("subtasks", this.taskId());
        const formValue = this.form.value;
        const normalizedFormValue = DateHelper.normalizeDateFields(formValue);
        const convertedDates = DateHelper.convertDatesToUtc(normalizedFormValue);
        const duplicateData = {
          ...convertedDates,
          id: "",
          _id: "",
          title: `${formValue.title} (Copy)`,
          status: TaskStatus.PENDING,
          order: subtasks.length,
        };

        this.dataSyncProvider
          .crud<Subtask>("create", "subtasks", { data: duplicateData, parentTodoId: todoId })
          .subscribe({
            next: () => {
              this.notifyService.showSuccess("Subtask duplicated successfully");
            },
            error: (err: any) =>
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
    if (!ValidationHelper.validateDates(this.form, this.notifyService)) return;
    if (!ValidationHelper.validateForm(this.form, this.notifyService, this.isSubmitting())) return;

    this.isSubmitting.set(true);
    if (this.isEdit()) this.updateSubtask();
    else this.createSubtask();
  }

  validateDates(): boolean {
    return ValidationHelper.validateDates(this.form, this.notifyService);
  }

  clearDates() {
    this.form.get("startDate")?.setValue("");
    this.form.get("endDate")?.setValue("");
  }

  async createSubtask() {
    if (this.form.valid) {
      try {
        const todoId = this.todoId();

        // ✅ Check parent todo visibility to determine if subtask should sync to MongoDB only
        const parentTodo = this.storageService.getById("todos", todoId);
        const isPrivate = parentTodo?.visibility !== "team";

        const subtasks = this.storageService.getAllByParentId("subtasks", this.taskId());
        const formValue = this.form.value;
        const normalizedFormValue = DateHelper.normalizeDateFields(formValue);
        const convertedDates = DateHelper.convertDatesToUtc(normalizedFormValue);
        const body = { ...convertedDates, order: subtasks.length, taskId: this.taskId() };

        this.dataSyncProvider
          .crud<Subtask>("create", "subtasks", {
            data: body,
            parentTodoId: todoId,
            isPrivate: isPrivate,
          })
          .subscribe({
            next: (result: Subtask) => {
              this.isSubmitting.set(false);
              this.notifyService.showSuccess("Subtask created successfully");
              this.back();
            },
            error: (err: any) => {
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
      if (!todoId) {
        this.notifyService.showError("Project ID not found");
        return;
      }

      // ✅ Check parent todo visibility to determine if subtask should sync to MongoDB only
      const parentTodo = this.storageService.getById("todos", todoId);
      const isPrivate = parentTodo?.visibility !== "team";

      const formValue = this.form.value;
      const normalizedFormValue = DateHelper.normalizeDateFields(formValue);
      const convertedDates = DateHelper.convertDatesToUtc(normalizedFormValue);

      // Ensure id is included in the update payload
      const body = {
        ...convertedDates,
        id: formValue.id, // Include id field for backend validation
      };

      // Update subtask via ApiProvider - pass isPrivate flag to control storage behavior
      this.dataSyncProvider
        .crud<Subtask>("update", "subtasks", {
          id: body.id,
          data: body,
          parentTodoId: todoId,
          isPrivate: isPrivate,
        })
        .subscribe({
          next: (result: Subtask) => {
            this.isSubmitting.set(false);
            this.notifyService.showSuccess("Subtask updated successfully");
            this.back();
          },
          error: (err: any) => {
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
