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
import { Subscription } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatRadioModule } from "@angular/material/radio";
import { MatDatepickerModule, MatCalendarCellCssClasses } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";

/* models */
import { PriorityTask, Task, TaskStatus, PriorityOption } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Todo } from "@models/todo.model";

interface RouteParams {
  todoId?: string;
  taskId?: string;
  subtaskId?: string;
}

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { StorageService } from "@services/core/storage.service";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* helpers */
import { DateHelper } from "@helpers/date.helper";

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
      task_id: ["", Validators.required],
      title: ["", Validators.required],
      description: [""],
      status: [TaskStatus.PENDING],
      priority: ["", Validators.required],
      start_date: [""],
      end_date: [""],
      order: [0],
      deleted_at: [false],
      created_at: [""],
      updated_at: [""],
    });

    this.form.get("start_date")?.valueChanges.subscribe((startDate) => {
      const endDateControl = this.form.get("end_date");
      if (!startDate) {
        endDateControl?.setValue("");
      } else {
        DateHelper.updateEndDateValidation(this.form, startDate);
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
    {
      value: PriorityTask.LOW,
      label: "Low",
      description: "Nice to have",
      colorClass: "bg-blue-500",
    },
    {
      value: PriorityTask.MEDIUM,
      label: "Medium",
      description: "Important",
      colorClass: "bg-yellow-500",
    },
    { value: PriorityTask.HIGH, label: "High", description: "Critical", colorClass: "bg-red-500" },
  ];

  ngOnInit() {
    this.saveSubscription = this.shortcutService.save$.subscribe(() => {
      this.onSubmit();
    });

    this.userId = this.authService.getValueByKey("id");

    this.route.params.subscribe((params: RouteParams) => {
      if (params.todoId) {
        this.todoId.set(params.todoId);
        this.loadProjectInfo(params.todoId);
      }
      if (params.taskId && params.taskId.trim() !== "") {
        this.taskId.set(params.taskId);
        this.form.controls["task_id"].setValue(params.taskId);
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
    return DateHelper.createEndDateFilter("start_date", this.form)(date);
  };

  getSubtaskInfo(subtaskId?: string) {
    if (!subtaskId) return;
    const subtask = this.storageService.getById("subtasks", subtaskId);
    if (subtask) {
      const localDates = DateHelper.convertDatesFromUtcToLocal(subtask);
      this.form.patchValue(localDates);
      if (localDates.start_date)
        DateHelper.updateEndDateValidation(this.form, localDates.start_date);
    } else {
      this.notifyService.showError("Subtask not found");
      this.back();
    }
  }

  back() {
    this.location.back();
  }

  loadProjectInfo(todoId?: string) {
    if (!todoId) return;
    const todo = this.storageService.getById("todos", todoId);
    if (todo) {
      this.projectInfo.set(todo);
      this.isOwner = todo.user_id === this.userId;
      this.isPrivate = todo.visibility === "private";
    } else {
      this.notifyService.showError("Todo not found");
    }
  }

  loadTaskInfo(taskId?: string) {
    if (!taskId) return;
    const task = this.storageService.getById("tasks", taskId);
    if (task) {
      this.taskInfo.set(task);
    } else {
      this.notifyService.showError("Task not found");
    }
  }

  async duplicateSubtask() {
    if (this.form.valid) {
      try {
        const todoId = this.todoId();
        const taskId = this.taskId();
        const subtasks = this.storageService.getAllByParentId("subtasks", taskId);
        const formValue = this.form.value;
        const normalizedFormValue = DateHelper.normalizeDateFields(formValue);
        const convertedDates = DateHelper.convertDatesToUtc(normalizedFormValue);
        const duplicateData = {
          task_id: taskId,
          title: `${formValue.title} (Copy)`,
          description: convertedDates.description || "",
          priority: convertedDates.priority,
          start_date: convertedDates.start_date || "",
          end_date: convertedDates.end_date || "",
          order: subtasks.length,
        };

        const parentTodo = this.storageService.getById("todos", todoId);
        const isPrivate = parentTodo?.visibility !== "team";

        this.dataSyncProvider
          .crud<Subtask>("create", "subtasks", {
            data: duplicateData,
            parentTodoId: todoId,
            isOwner: this.isOwner,
            isPrivate,
          })
          .subscribe({
            next: () => {
              this.notifyService.showSuccess("Subtask duplicated successfully");
            },
            error: (err: unknown) => {
              const message = err instanceof Error ? err.message : "Failed to duplicate subtask";
              this.notifyService.showError(message);
            },
          });
      } catch (err) {
        this.notifyService.showError("Failed to get existing subtasks count");
      }
    }
  }

  viewTaskDetails() {
    const todoId = this.todoId();
    const taskId = this.taskId();
    if (todoId && taskId) {
      this.router.navigate(["/todos", todoId, "tasks", taskId, "edit_task"]);
    }
  }

  onSubmit() {
    if (!DateHelper.validateDates(this.form, this.notifyService)) return;
    if (!DateHelper.validateForm(this.form, this.notifyService, this.isSubmitting())) return;

    this.isSubmitting.set(true);
    if (this.isEdit()) this.updateSubtask();
    else this.createSubtask();
  }

  validateDates(): boolean {
    return DateHelper.validateDates(this.form, this.notifyService);
  }

  clearDates() {
    this.form.get("start_date")?.setValue("");
    this.form.get("end_date")?.setValue("");
  }

  async createSubtask() {
    if (this.form.valid) {
      try {
        const todoId = this.todoId();
        const taskId = this.taskId();

        const parentTodo = this.storageService.getById("todos", todoId);
        const isPrivate = parentTodo?.visibility !== "team";

        const subtasks = this.storageService.getAllByParentId("subtasks", taskId);
        const formValue = this.form.value;
        const normalizedFormValue = DateHelper.normalizeDateFields(formValue);
        const convertedDates = DateHelper.convertDatesToUtc(normalizedFormValue);
        const body = {
          task_id: taskId,
          title: convertedDates.title,
          description: convertedDates.description || "",
          priority: convertedDates.priority,
          start_date: convertedDates.start_date || "",
          end_date: convertedDates.end_date || "",
          order: subtasks.length,
        };

        this.dataSyncProvider
          .crud<Subtask>("create", "subtasks", {
            data: body,
            parentTodoId: todoId,
            isOwner: this.isOwner,
            isPrivate: isPrivate,
          })
          .subscribe({
            next: (result: Subtask) => {
              this.isSubmitting.set(false);
              this.notifyService.showSuccess("Subtask created successfully");
              this.back();
            },
            error: (err: unknown) => {
              this.isSubmitting.set(false);
              const message = err instanceof Error ? err.message : "Failed to create subtask";
              this.notifyService.showError(message);
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

      const parentTodo = this.storageService.getById("todos", todoId);
      const isPrivate = parentTodo?.visibility !== "team";

      const formValue = this.form.value;
      const normalizedFormValue = DateHelper.normalizeDateFields(formValue);
      const convertedDates = DateHelper.convertDatesToUtc(normalizedFormValue);

      const body = {
        id: formValue.id,
        task_id: formValue.task_id,
        title: convertedDates.title,
        description: convertedDates.description || "",
        status: convertedDates.status,
        priority: convertedDates.priority,
        start_date: convertedDates.start_date || "",
        end_date: convertedDates.end_date || "",
        order: convertedDates.order || 0,
      };

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
          error: (err: unknown) => {
            this.isSubmitting.set(false);
            const message = err instanceof Error ? err.message : "Failed to update subtask";
            this.notifyService.showError(message);
          },
        });
    } else {
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
