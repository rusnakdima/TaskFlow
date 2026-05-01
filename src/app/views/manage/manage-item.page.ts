import { CommonModule, Location } from "@angular/common";
import {
  Component,
  OnDestroy,
  OnInit,
  signal,
  inject,
  computed,
  ChangeDetectorRef,
} from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { Subscription, firstValueFrom } from "rxjs";

import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatDatepickerModule, MatCalendarCellCssClasses } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";
import { MatRadioModule } from "@angular/material/radio";
import { MatMenuModule } from "@angular/material/menu";
import { MatDividerModule } from "@angular/material/divider";

import { Todo } from "@models/todo.model";
import { Task, TaskStatus, PriorityTask, RepeatInterval } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";

import { AuthService } from "@services/auth/auth.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { StorageService } from "@services/core/storage.service";
import { RelationLoadingService } from "@services/core/relation-loading.service";
import { VisibilitySyncService } from "@services/core/visibility-sync.service";

import { ApiProvider } from "@providers/api.provider";
import { DateHelper } from "@helpers/date.helper";
import { bindSaveShortcut } from "@helpers/keyboard.helper";

type ItemType = "todo" | "task" | "subtask";

interface RouteParams {
  todoId?: string;
  taskId?: string;
  subtaskId?: string;
}

interface FormConfig {
  type: ItemType;
  parentField: string;
  table: string;
  statusEnum?: any;
  priorityEnum: any;
  repeatEnum?: any;
}

@Component({
  selector: "app-manage-item",
  standalone: true,
  providers: [AuthService, ApiProvider, RelationLoadingService, VisibilitySyncService],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatRadioModule,
    MatMenuModule,
    MatDividerModule,
  ],
  templateUrl: "./manage-item.page.html",
})
export class ManageItemPage implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private authService = inject(AuthService);
  private jwtTokenService = inject(JwtTokenService);
  private storageService = inject(StorageService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(ApiProvider);
  private shortcutService = inject(ShortcutService);
  private cdr = inject(ChangeDetectorRef);
  private relationLoader = inject(RelationLoadingService);
  private visibilitySyncService = inject(VisibilitySyncService);

  form!: FormGroup;
  isEdit = signal(false);
  isSubmitting = signal(false);
  itemType = signal<ItemType>("todo");
  isOwner = signal(false);

  todos = signal<Todo[]>([]);
  tasks = signal<Task[]>([]);
  categories = signal<Category[]>([]);
  assignees = signal<Profile[]>([]);

  private subscriptions = new Subscription();

  private configs: Record<ItemType, FormConfig> = {
    todo: {
      type: "todo",
      parentField: "",
      table: "todos",
      priorityEnum: { HIGH: "high", MEDIUM: "medium", LOW: "low" },
    },
    task: {
      type: "task",
      parentField: "todo_id",
      table: "tasks",
      statusEnum: TaskStatus,
      priorityEnum: PriorityTask,
      repeatEnum: RepeatInterval,
    },
    subtask: {
      type: "subtask",
      parentField: "task_id",
      table: "subtasks",
      statusEnum: { PENDING: "pending", COMPLETED: "completed" },
      priorityEnum: PriorityTask,
    },
  };

  currentConfig = computed(() => this.configs[this.itemType()]);

  pageTitle = computed(() => {
    const type = this.itemType();
    const edit = this.isEdit() ? "Edit" : "Create";
    return `${edit} ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  });

  ngOnInit(): void {
    this.initForm();
    this.subscribeToRoute();
    this.subscriptions.add(bindSaveShortcut(this.shortcutService, () => this.onSubmit()));
  }

  private initForm(): void {
    this.form = this.fb.group({
      _id: [""],
      id: [""],
      title: ["", Validators.required],
      description: [""],
      status: ["pending"],
      priority: ["medium"],
      start_date: [""],
      end_date: [""],
      order: [0],
      deleted_at: [false],
      todo_id: [""],
      task_id: [""],
      visibility: ["private"],
      categories: [[]],
      assignees: [[]],
      repeat: ["none"],
    });
  }

  private subscribeToRoute(): void {
    this.subscriptions.add(
      this.route.params.subscribe(async (params: RouteParams) => {
        await this.loadData(params);
      })
    );

    this.form.get("start_date")?.valueChanges.subscribe((startDate) => {
      this.updateDateValidation(startDate);
    });
  }

  private async loadData(params: RouteParams): Promise<void> {
    const path = this.route.snapshot.url.map((s) => s.path);

    // First set itemType based on path
    if (path.includes("subtasks")) {
      this.itemType.set("subtask");
      if (params.taskId) this.form.patchValue({ task_id: params.taskId });
    } else if (path.includes("tasks")) {
      this.itemType.set("task");
      if (params.todoId) this.form.patchValue({ todo_id: params.todoId });
    } else {
      this.itemType.set("todo");
    }

    // Load parent entities with correct visibility for loading existing item
    await this.loadParentEntities();

    // If editing, load the existing item
    // Only check entity's own ID params (taskId for tasks, subtaskId for subtasks, todoId for todos)
    // Note: todoId is set for create_todo path too, so we check based on itemType
    const isEntityIdSet =
      (this.itemType() === "todo" && params.todoId) ||
      (this.itemType() === "task" && params.taskId) ||
      (this.itemType() === "subtask" && params.subtaskId);

    if (isEntityIdSet) {
      this.isEdit.set(true);
      await this.loadExistingItem(params);
    }
  }

  private async loadParentEntities(): Promise<void> {
    const type = this.itemType();

    // Get todos from storage (already loaded with correct visibility)
    const allTodos = this.storageService.todos();
    this.todos.set(allTodos);

    if (type === "task" || type === "subtask") {
      // Get tasks from storage
      const allTasks = this.storageService.tasks();
      this.tasks.set(allTasks);
    }
  }

  private async loadExistingItem(params: RouteParams): Promise<void> {
    const config = this.currentConfig();
    const id = params.subtaskId || params.taskId || params.todoId;

    if (!id) return;

    // Try to get from local storage first
    const localItem = this.storageService.getById(config.table as any, id);

    if (localItem) {
      this.applyItemToForm(localItem);
    } else {
      // Load from API with appropriate visibility
      const visibilityValue = this.form.get("visibility")?.value;
      const visibility = !visibilityValue || visibilityValue === "private" ? "private" : "team";

      const response = await firstValueFrom(
        this.dataSyncProvider.crud<any>("get", config.table, {
          id,
          visibility,
        })
      );

      if (response?.data?.[0]) {
        this.applyItemToForm(response.data[0]);
      } else if (response) {
        this.applyItemToForm(response);
      }
    }
  }

  private applyItemToForm(item: any): void {
    this.form.patchValue({
      ...item,
      start_date: item.start_date || "",
      end_date: item.end_date || "",
    });

    if (item.categories && typeof item.categories === "string") {
      try {
        this.form.patchValue({ categories: JSON.parse(item.categories) });
      } catch {}
    }

    // Set visibility from item if not already set
    if (item.visibility && !this.form.get("visibility")?.value) {
      this.form.patchValue({ visibility: item.visibility });
    }

    // Handle permissions based on type and visibility
    const userId = this.jwtTokenService.getUserId(this.jwtTokenService.getToken());
    this.isOwner.set(item.user_id === userId);

    // Permission checks
    if (item.visibility === "shared" && item.user_id !== userId) {
      this.notifyService.showError("Only owner can manage project settings");
      setTimeout(() => this.location.back(), 500);
      return;
    }
    if (
      item.visibility === "public" &&
      item.user_id !== userId &&
      !this.isUserAssignee(item, userId ?? null)
    ) {
      this.notifyService.showError("You don't have permission to manage this project");
      setTimeout(() => this.location.back(), 500);
      return;
    }
  }

  isUserAssignee(item: any, userId?: string | null): boolean {
    const token = this.jwtTokenService.getToken();
    const uid = userId ?? this.jwtTokenService.getUserId(token) ?? undefined;
    if (!item?.assignees) return false;
    return item.assignees.some((a: any) => (typeof a === "string" ? a === uid : a.user_id === uid));
  }

  private updateDateValidation(startDate: string): void {
    const endDateControl = this.form.get("end_date");
    if (startDate && endDateControl) {
      endDateControl.setValidators([]);
      endDateControl.updateValueAndValidity();
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.notifyService.showError("Please fill in required fields");
      return;
    }

    this.isSubmitting.set(true);

    try {
      const config = this.currentConfig();
      const formValue = this.form.value;
      const payload = this.buildPayload(formValue, config);

      const action = this.isEdit() ? "update" : "create";
      await firstValueFrom(this.dataSyncProvider.crud(action, config.table, { data: payload }));

      this.notifyService.showSuccess(
        `${config.type} ${this.isEdit() ? "updated" : "created"} successfully`
      );
      this.location.back();
    } catch (err: any) {
      this.notifyService.showError(err.message || "Failed to save");
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private buildPayload(formValue: any, config: FormConfig): any {
    const token = this.jwtTokenService.getToken();
    const userId = this.jwtTokenService.getUserId(token);

    const base = {
      id: formValue.id || undefined,
      title: formValue.title,
      description: formValue.description || "",
      status: formValue.status || "pending",
      priority: formValue.priority,
      start_date: formValue.start_date || "",
      end_date: formValue.end_date || "",
      order: formValue.order || 0,
      deleted_at: null,
      user_id: userId,
    };

    if (config.type === "todo") {
      return {
        ...base,
        visibility: formValue.visibility || "private",
        categories: formValue.categories || [],
        assignees: formValue.assignees || [],
      };
    } else if (config.type === "task") {
      return {
        ...base,
        todo_id: formValue.todo_id,
        repeat: formValue.repeat || "none",
      };
    } else {
      return {
        ...base,
        task_id: formValue.task_id,
      };
    }
  }

  back(): void {
    this.location.back();
  }

  dateClass = (date: Date): MatCalendarCellCssClasses => {
    return DateHelper.createDateClass(this.form)(date);
  };

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
