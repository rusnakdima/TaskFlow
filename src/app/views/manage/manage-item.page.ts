import { CommonModule, Location } from "@angular/common";
import { Component, OnInit, signal, inject, computed, DestroyRef } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
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

import { Todo, Task, TaskStatus, Category, Profile } from "@models/generated/api.types";
import { PriorityTask, RepeatInterval } from "@models/task-enums.model";

import { AuthService } from "@services/auth/auth.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { StorageService } from "@services/storage.service";
import { GithubService } from "@services/github/github.service";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { MongoConnectionService } from "@services/core/mongo-connection.service";
import { ApiService } from "@services/api.service";
import { DateHelper } from "@helpers/date.helper";
import { bindSaveShortcut } from "@helpers/keyboard.helper";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { TransferOwnershipDialogComponent } from "@components/transfer-ownership-dialog/transfer-ownership-dialog.component";
import { PermissionService, TodoPermission } from "@services/core/permission.service";

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
    CheckboxComponent,
    TransferOwnershipDialogComponent,
  ],
  templateUrl: "./manage-item.page.html",
})
export class ManageItemPage implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private authService = inject(AuthService);
  private jwtTokenService = inject(JwtTokenService);
  private storageService = inject(StorageService);
  private notifyService = inject(NotifyService);
  private shortcutService = inject(ShortcutService);
  private githubService = inject(GithubService);
  private destroyRef = inject(DestroyRef);
  private mongoConnectionService = inject(MongoConnectionService);
  private requestService = inject(ApiService);
  private apiService = inject(ApiService);
  private permissionService = inject(PermissionService);

  form!: FormGroup;
  isEdit = signal(false);
  isSubmitting = signal(false);
  itemType = signal<ItemType>("todo");
  isOwner = signal(false);
  originalVisibility = signal<string>("");
  userPermission = signal<TodoPermission>(TodoPermission.VIEWER);

  todos = signal<Todo[]>([]);
  tasks = signal<Task[]>([]);
  categories = signal<Category[]>([]);
  assignees = signal<Profile[]>([]);

  githubRepos = signal<any[]>([]);
  selectedGithubRepoId = signal<string | null>(null);
  githubConnected = signal(false);
  publishToGithub = signal(false);
  githubRepoSearchQuery = signal("");

  categorySearchQuery = signal("");
  newCategoryTitle = signal("");
  selectedCategoryIds = signal<Set<string>>(new Set());
  assigneeSearchQuery = signal("");
  selectedAssigneeIds = signal<Set<string>>(new Set());
  assigneeRoles = signal<Record<string, string>>({});
  showPermissionsSection = computed(() => {
    const visibility = this.visibility();
    const isTodo = this.itemType() === "todo";
    const isSharedOrPublic = visibility === "shared" || visibility === "public";
    return isTodo && isSharedOrPublic && this.isOwner();
  });
  showTransferOwnershipDialog = signal(false);

  canEditTodoFields = computed(() =>
    [TodoPermission.ADMIN, TodoPermission.MODERATOR, TodoPermission.OWNER].includes(
      this.userPermission()
    )
  );
  canEditVisibility = computed(() => this.userPermission() === TodoPermission.OWNER);
  canManageAssignees = computed(() => this.userPermission() === TodoPermission.OWNER);
  canManageGhRepo = computed(() => this.userPermission() === TodoPermission.OWNER);
  canManagePermissions = computed(() => this.userPermission() === TodoPermission.OWNER);
  canManageCategories = computed(() =>
    [TodoPermission.ADMIN, TodoPermission.MODERATOR, TodoPermission.OWNER].includes(
      this.userPermission()
    )
  );

  private updateFormFieldPermissions(): void {
    const permission = this.userPermission();
    const isOwner = permission === TodoPermission.OWNER;
    const isAdminOrModerator = [TodoPermission.ADMIN, TodoPermission.MODERATOR].includes(
      permission
    );

    const basicFields = ["title", "description", "priority", "start_date", "end_date"];
    for (const field of basicFields) {
      if (isOwner || isAdminOrModerator) {
        this.form.get(field)?.enable();
      } else {
        this.form.get(field)?.disable();
      }
    }

    if (isOwner) {
      this.form.get("visibility")?.enable();
      this.form.get("assignees")?.enable();
      this.form.get("github_repo_id")?.enable();
    } else {
      this.form.get("visibility")?.disable();
      this.form.get("assignees")?.disable();
      this.form.get("github_repo_id")?.disable();
    }
  }

  getCurrentUserId(): string {
    return this.authService.getValueByKey("id");
  }

  getCurrentProfileId(): string | null {
    return this.jwtTokenService.getProfileId(this.jwtTokenService.getToken());
  }

  filteredCategories = computed(() => {
    const query = this.categorySearchQuery().toLowerCase();
    const selected = this.selectedCategoryIds();
    let categories = query
      ? this.categories().filter((c: Category) => c.title.toLowerCase().includes(query))
      : this.categories();

    return [...categories].sort((a: Category, b: Category) => {
      const aSelected = selected.has(a.id);
      const bSelected = selected.has(b.id);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return a.title.localeCompare(b.title);
    });
  });

  filteredAssignees = computed(() => {
    const query = this.assigneeSearchQuery().toLowerCase();
    if (!query) return this.assignees();
    return this.assignees().filter(
      (p: Profile) =>
        `${p.name} ${p.last_name}`.toLowerCase().includes(query) ||
        (p.user?.email || "").toLowerCase().includes(query)
    );
  });

  filteredGithubRepos = computed(() => {
    const query = this.githubRepoSearchQuery().toLowerCase();
    if (!query) return this.githubRepos();
    return this.githubRepos().filter((r: any) => r.full_name.toLowerCase().includes(query));
  });

  isAllCategoriesSelected = computed(() => {
    const allIds = this.categories().map((c: Category) => c.id);
    return allIds.length > 0 && this.selectedCategoryIds().size === allIds.length;
  });

  isAllAssigneesSelected = computed(() => {
    const allIds = this.assignees().map((a: Profile) => a.user_id);
    return allIds.length > 0 && this.selectedAssigneeIds().size === allIds.length;
  });

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

  visibility = signal<string>("private");
  startDateForEndDate = signal<Date | null>(null);

  hasStartDate = computed(() => {
    return !!this.startDateForEndDate();
  });

  minEndDate = computed(() => {
    return this.startDateForEndDate();
  });

  showAssignees = computed(() => {
    return (
      this.itemType() === "todo" &&
      (this.visibility() === "shared" || this.visibility() === "public")
    );
  });

  parentTodoHasGithubRepo = computed(() => {
    if (this.itemType() !== "task") return false;
    const todoId = this.form.get("todo_id")?.value;
    if (!todoId) return false;
    const parentTodo = this.todos().find((t) => t.id === todoId);
    return !!parentTodo?.github_repo_id;
  });

  pageTitle = computed(() => {
    const type = this.itemType();
    const edit = this.isEdit() ? "Edit" : "Create";
    return `${edit} ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  });

  ngOnInit(): void {
    this.initForm();
    this.subscribeToRoute();
    bindSaveShortcut(this.shortcutService, () => this.onSubmit())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
    this.loadGithubData();
    this.loadCategories();
    this.loadProfiles();

    if (this.itemType() === "todo" && !this.isEdit()) {
      this.userPermission.set(TodoPermission.OWNER);
      this.updateFormFieldPermissions();
    }
  }

  private loadCategories(): void {
    this.categories.set(this.storageService.categories());

    this.requestService
      .loadPage<Category>("categories", { visibility: "private", limit: 50, skip: 0 })
      .subscribe({
        next: (categories: Category[]) => {
          this.categories.set(categories);
        },
        error: () => {
          this.categories.set(this.storageService.categories());
        },
      });
  }

  private loadProfiles(): void {
    if (!this.mongoConnectionService.isConnected()) {
      this.assignees.set([]);
      return;
    }

    this.apiService.profiles
      .getAll({ visibility: "public" })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.assignees.set(response || []),
        error: () => {
          this.assignees.set([]);
        },
      });
  }

  private async loadGithubData(): Promise<void> {
    this.githubService.getConnectionStatus().subscribe({
      next: (status) => {
        this.githubConnected.set(status.connected);
        if (status.connected) {
          this.githubService.getRepos().subscribe({
            next: (repos) => {
              this.githubRepos.set(repos);
              const currentRepoId = this.form.get("github_repo_id")?.value;
              if (currentRepoId) {
                this.selectedGithubRepoId.set(currentRepoId);
              }
            },
            error: () => {},
          });
        }
      },
      error: () => {},
    });
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
      github_repo_id: [""],
      publish_to_github: [false],
    });
  }

  private subscribeToRoute(): void {
    this.subscriptions.add(
      this.route.params.subscribe(async (params: RouteParams) => {
        await this.loadData(params);
      })
    );

    this.form.get("start_date")?.valueChanges.subscribe((startDate) => {
      this.startDateForEndDate.set(startDate || null);
      this.updateDateValidation(startDate);
    });

    this.form.get("visibility")?.valueChanges.subscribe((visibility) => {
      this.visibility.set(visibility || "private");
    });
    this.visibility.set(this.form.get("visibility")?.value || "private");
  }

  private async loadData(params: RouteParams): Promise<void> {
    const path = this.route.snapshot.url.map((s) => s.path);

    if (path.includes("subtasks")) {
      this.itemType.set("subtask");
      if (params.taskId) this.form.patchValue({ task_id: params.taskId });
    } else if (path.includes("tasks")) {
      this.itemType.set("task");
      if (params.todoId) this.form.patchValue({ todo_id: params.todoId });
    } else {
      this.itemType.set("todo");
    }

    await this.loadParentEntities();

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
    this.todos.set(this.storageService.todos());

    const type = this.itemType();
    if (type === "task" || type === "subtask") {
      this.tasks.set(this.storageService.tasks());
    }
  }

  private async loadExistingItem(params: RouteParams): Promise<void> {
    const config = this.currentConfig();
    const id = params.subtaskId || params.taskId || params.todoId;
    const visibility = this.route.snapshot.queryParamMap.get("visibility") || undefined;

    if (!id) return;

    try {
      let item: any;
      if (config.type === "todo") {
        item = await firstValueFrom(this.apiService.todos.get(id, visibility));
      } else if (config.type === "task") {
        item = await firstValueFrom(this.apiService.tasks.get(id, visibility));
      } else {
        item = await firstValueFrom(this.apiService.subtasks.get(id, visibility));
      }

      if (item) {
        if (config.type === "todo") {
          await this.loadAndSetUserPermission(item);
        } else if (config.type === "task" || config.type === "subtask") {
          await this.loadAndSetUserPermissionForTaskOrSubtask(item, visibility);
        }
        this.applyItemToForm(item);
      }
    } catch (err) {
      this.notifyService.showError("Failed to load item");
    }
  }

  private async loadAndSetUserPermission(item: any): Promise<void> {
    const userId = this.getCurrentUserId();
    const profileId = this.getCurrentProfileId();

    if (item.user_id === userId) {
      this.userPermission.set(TodoPermission.OWNER);
      this.updateFormFieldPermissions();
      return;
    }

    if (item.assignee_roles && item.assignee_roles[userId]) {
      this.userPermission.set(this.permissionService.fromStr(item.assignee_roles[userId]));
      this.updateFormFieldPermissions();
      return;
    }

    if (item.visibility === "public") {
      this.userPermission.set(TodoPermission.VIEWER);
      this.updateFormFieldPermissions();
      return;
    }

    const token = this.jwtTokenService.getToken() || "";

    const assigneeRoles = await this.permissionService.getTodoPermissionsAsync(
      item.id,
      item.visibility || "shared",
      token
    );

    this.assigneeRoles.set(assigneeRoles);

    const role = assigneeRoles[userId] || (profileId ? assigneeRoles[profileId] : null) || "viewer";

    this.userPermission.set(this.permissionService.fromStr(role));
    this.updateFormFieldPermissions();
  }

  private async loadAndSetUserPermissionForTaskOrSubtask(
    item: any,
    visibility?: string
  ): Promise<void> {
    const userId = this.getCurrentUserId();
    const profileId = this.getCurrentProfileId();
    const config = this.currentConfig();

    let parentTodoId: string;

    if (config.type === "subtask") {
      const parentTask = await firstValueFrom(this.apiService.tasks.get(item.task_id, visibility));
      parentTodoId = parentTask.todo_id;
    } else {
      parentTodoId = item.todo_id;
    }

    const parentTodo: any = await firstValueFrom(
      this.apiService.todos.get(parentTodoId, visibility)
    );

    if (!parentTodo) {
      this.userPermission.set(TodoPermission.VIEWER);
      this.updateFormFieldPermissions();
      return;
    }

    if (parentTodo.user_id === userId) {
      this.userPermission.set(TodoPermission.OWNER);
      this.updateFormFieldPermissions();
      return;
    }

    if (parentTodo.assignee_roles && parentTodo.assignee_roles[userId]) {
      this.userPermission.set(this.permissionService.fromStr(parentTodo.assignee_roles[userId]));
      this.updateFormFieldPermissions();
      return;
    }

    if (parentTodo.visibility === "public") {
      this.userPermission.set(TodoPermission.VIEWER);
      this.updateFormFieldPermissions();
      return;
    }

    const token = this.jwtTokenService.getToken() || "";

    const assigneeRoles = await this.permissionService.getTodoPermissionsAsync(
      parentTodo.id,
      parentTodo.visibility || "shared",
      token
    );

    this.assigneeRoles.set(assigneeRoles);

    const role = assigneeRoles[userId] || (profileId ? assigneeRoles[profileId] : null) || "viewer";

    this.userPermission.set(this.permissionService.fromStr(role));
    this.updateFormFieldPermissions();
  }

  private applyItemToForm(item: any): void {
    this.form.patchValue({
      ...item,
      start_date: item.start_date || "",
      end_date: item.end_date || "",
    });

    if (item.categories) {
      let categoryIds: string[] = [];
      if (typeof item.categories === "string") {
        try {
          categoryIds = JSON.parse(item.categories);
        } catch {}
      } else if (Array.isArray(item.categories)) {
        categoryIds = item.categories;
      }
      this.form.patchValue({ categories: categoryIds });
      this.selectedCategoryIds.set(new Set(categoryIds.filter((id: string) => id)));
    }

    if (item.assignees) {
      const assigneeIds = Array.isArray(item.assignees)
        ? item.assignees.map((a: any) => (typeof a === "string" ? a : a.user_id))
        : [];
      this.form.patchValue({ assignees: assigneeIds });
      this.selectedAssigneeIds.set(new Set(assigneeIds.filter((id: string) => id)));

      if (item.assignee_roles) {
        const newRoles: Record<string, string> = {};
        for (const assigneeId of assigneeIds) {
          const profile = this.assignees().find((p) => p.id === assigneeId);
          if (profile && profile.user_id) {
            newRoles[profile.user_id] = item.assignee_roles[assigneeId] || "viewer";
          } else {
            newRoles[assigneeId] = item.assignee_roles[assigneeId] || "viewer";
          }
        }
        this.assigneeRoles.set(newRoles);
      }
    }

    if (item.visibility && !this.form.get("visibility")?.value) {
      this.form.patchValue({ visibility: item.visibility });
    }

    this.originalVisibility.set(item.visibility || "private");

    const userId = this.jwtTokenService.getUserId(this.jwtTokenService.getToken());
    this.isOwner.set(item.user_id === userId);

    const isAdminOrModeratorAssignee =
      userId &&
      item.assignee_roles &&
      (item.assignee_roles[userId] === "admin" || item.assignee_roles[userId] === "moderator");

    if (item.visibility === "shared" && item.user_id !== userId && !isAdminOrModeratorAssignee) {
      this.notifyService.showError("Only owner can manage project settings");
      setTimeout(() => this.location.back(), 500);
      return;
    }
    if (
      item.visibility === "public" &&
      item.user_id !== userId &&
      !this.isUserAssignee(item, userId ?? null) &&
      !isAdminOrModeratorAssignee
    ) {
      this.notifyService.showError("You don't have permission to manage this project");
      setTimeout(() => this.location.back(), 500);
      return;
    }

    this.loadAssigneeRoles(item);
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
      endDateControl.enable();
      endDateControl.updateValueAndValidity();
    } else if (endDateControl) {
      endDateControl.disable();
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.notifyService.showError("Please fill in required fields");
      return;
    }

    if (!this.canEditTodoFields() && this.isEdit()) {
      this.notifyService.showError("You don't have permission to edit this item");
      return;
    }

    this.isSubmitting.set(true);

    try {
      const config = this.currentConfig();
      const formValue = this.form.value;
      const { data: payload, visibility } = this.buildPayload(formValue, config);

      let savedTaskId: string | null = null;

      if (this.isEdit()) {
        const id = formValue._id || formValue.id;
        savedTaskId = id;
        if (config.type === "todo") {
          const result = await firstValueFrom(
            this.apiService.todos.update(id, payload, visibility)
          );
          this.storageService.modify("todos", "update", { ...result, id });
        } else if (config.type === "task") {
          await firstValueFrom(this.apiService.tasks.update(id, payload, visibility));
        } else {
          await firstValueFrom(this.apiService.subtasks.update(id, payload, visibility));
        }
      } else {
        let result: any;
        if (config.type === "todo") {
        } else if (config.type === "task") {
          result = await firstValueFrom(this.apiService.tasks.create(payload, visibility));
          savedTaskId = result?.id || result?._id || null;
          if (result?.todo_id) {
            const parentTodo = this.todos().find((t) => t.id === result.todo_id);
            if (parentTodo) {
              this.storageService.modify("todos", "update", {
                id: result.todo_id,
                tasks_count: (parentTodo.tasks_count || 0) + 1,
              });
            }
          }
        } else {
          result = await firstValueFrom(this.apiService.subtasks.create(payload, visibility));
        }
      }

      this.notifyService.showSuccess(
        `${config.type} ${this.isEdit() ? "updated" : "created"} successfully`
      );

      if (config.type === "todo" && this.isEdit()) {
        await this.syncTodoVisibilityOnChange(
          formValue.id,
          this.originalVisibility(),
          formValue.visibility
        );
      }

      if (config.type === "task" && savedTaskId) {
        await this.handleGithubIssueForTask(savedTaskId, formValue);
      }

      this.location.back();
    } catch (err: any) {
      this.notifyService.showError(err.message || "Failed to save");
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private buildPayload(formValue: any, config: FormConfig): { data: any; visibility: string } {
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
        data: {
          ...base,
          categories: formValue.categories || [],
          assignees: formValue.assignees || [],
          assignee_roles: this.assigneeRoles(),
          github_repo_id: formValue.github_repo_id || "",
          github_repo_name: this.getRepoName(formValue.github_repo_id),
        },
        visibility: this.isEdit() ? this.visibility() : formValue.visibility || "private",
      };
    } else if (config.type === "task") {
      const parentTodo = this.todos().find((t) => t.id === formValue.todo_id);
      return {
        data: {
          ...base,
          todo_id: formValue.todo_id,
          repeat: formValue.repeat || "none",
          publish_to_github: formValue.publish_to_github || false,
        },
        visibility: parentTodo?.visibility || "private",
      };
    } else {
      const parentTask = this.tasks().find((t) => t.id === formValue.task_id);
      const parentTodo = parentTask ? this.todos().find((t) => t.id === parentTask.todo_id) : null;
      return {
        data: {
          ...base,
          task_id: formValue.task_id,
        },
        visibility: parentTodo?.visibility || "private",
      };
    }
  }

  back(): void {
    this.location.back();
  }

  private async syncTodoVisibilityOnChange(
    todoId: string,
    fromVisibility: string,
    toVisibility: string
  ): Promise<void> {
    if (fromVisibility === toVisibility) {
      return;
    }

    try {
      const source = fromVisibility === "private" ? "Json" : "Mongo";
      const target = toVisibility === "private" ? "Json" : "Mongo";

      if (source === target) {
        this.storageService.updateEntityVisibility("todos", todoId, toVisibility);
        return;
      }

      await firstValueFrom(
        this.requestService.invokeCommand("sync_visibility_to_provider", {
          todo_id: todoId,
          entity_type: "todos",
          source_provider: source,
          target_provider: target,
        })
      );

      this.storageService.updateEntityVisibility("todos", todoId, toVisibility);

      if (toVisibility === "shared" || toVisibility === "public") {
        this.apiService.todos.getAll({ visibility: toVisibility }).subscribe();
      }
    } catch (error: any) {
      this.notifyService.showError(
        "Failed to sync visibility: " + (error.message || "Unknown error")
      );
    }
  }

  private getRepoName(repoId: string): string {
    if (!repoId) return "";
    const repo = this.githubRepos().find((r) => r.id === repoId);
    return repo?.full_name || "";
  }

  onGithubRepoChange(repoId: string): void {
    this.selectedGithubRepoId.set(repoId || null);
    this.form.patchValue({ github_repo_id: repoId });
  }

  dateClass = (date: Date): MatCalendarCellCssClasses => {
    return DateHelper.createDateClass(this.form)(date);
  };

  addCategory(): void {
    const title = this.newCategoryTitle().trim();
    if (!title) return;

    const userId = this.authService.getValueByKey("id");
    this.newCategoryTitle.set("");

    this.apiService.categories.create({ title, user_id: userId }).subscribe({
      next: (category: Category) => {
        this.categories.update((cats) => [...cats, category]);
        this.toggleCategorySelection(category.id);
      },
      error: (err: Error) =>
        this.notifyService.showError(err.message || "Failed to create category"),
    });
  }

  toggleCategorySelection(categoryId: string): void {
    const selected = new Set(this.selectedCategoryIds());
    if (selected.has(categoryId)) {
      selected.delete(categoryId);
    } else {
      selected.add(categoryId);
    }
    this.selectedCategoryIds.set(selected);
    this.form.patchValue({ categories: Array.from(selected) });
  }

  toggleSelectAllCategories(): void {
    const allIds = this.categories().map((c: Category) => c.id);
    const currentSelected = this.selectedCategoryIds();
    if (currentSelected.size === allIds.length) {
      this.selectedCategoryIds.set(new Set());
    } else {
      this.selectedCategoryIds.set(new Set(allIds));
    }
    this.form.patchValue({ categories: Array.from(this.selectedCategoryIds()) });
  }

  isCategorySelectedById(categoryId: string): boolean {
    return this.selectedCategoryIds().has(categoryId);
  }

  toggleAssigneeSelection(assigneeId: string): void {
    const selected = new Set(this.selectedAssigneeIds());
    if (selected.has(assigneeId)) {
      selected.delete(assigneeId);
      this.assigneeRoles.update((roles) => {
        const newRoles = { ...roles };
        delete newRoles[assigneeId];
        return newRoles;
      });
    } else {
      selected.add(assigneeId);
      this.assigneeRoles.update((roles) => ({ ...roles, [assigneeId]: "viewer" }));
    }
    this.selectedAssigneeIds.set(selected);
    this.form.patchValue({ assignees: Array.from(selected) });
  }

  toggleSelectAllAssignees(): void {
    const allIds = this.assignees().map((a: Profile) => a.user_id);
    const currentSelected = this.selectedAssigneeIds();
    if (currentSelected.size === allIds.length) {
      this.selectedAssigneeIds.set(new Set());
    } else {
      this.selectedAssigneeIds.set(new Set(allIds));
    }
    this.form.patchValue({ assignees: Array.from(this.selectedAssigneeIds()) });
  }

  isAssigneeSelectedById(assigneeId: string): boolean {
    return this.selectedAssigneeIds().has(assigneeId);
  }

  isAssigneeHasAdminRole(assigneeId: string): boolean {
    const roles = this.assigneeRoles();
    return roles[assigneeId] === "admin";
  }

  setAssigneeRole(assigneeId: string, role: string): void {
    this.assigneeRoles.update((roles) => ({ ...roles, [assigneeId]: role }));
  }

  getRoleIcon(role: string): string {
    const icons: Record<string, string> = {
      viewer: "visibility",
      editor: "edit",
      admin: "admin_panel_settings",
      moderator: "security",
    };
    return icons[role] || "visibility";
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      viewer: "Viewer",
      editor: "Editor",
      admin: "Admin",
      moderator: "Moderator",
    };
    return labels[role] || "Viewer";
  }

  savePermissions(): void {
    const todoId = this.form.get("id")?.value || this.form.get("_id")?.value;
    if (!todoId) return;

    const visibility = this.form.get("visibility")?.value || "private";
    const token = this.jwtTokenService.getToken();
    this.requestService
      .invokeCommand("update_todo_permissions", {
        todo_id: todoId,
        assignee_roles: this.assigneeRoles(),
        visibility,
        token,
      })
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Permissions updated successfully");
        },
        error: (err: Error) => {
          this.notifyService.showError(err.message || "Failed to update permissions");
        },
      });
  }

  onTransferOwnership(): void {
    this.showTransferOwnershipDialog.set(true);
  }

  onTransferOwnershipConfirm(newOwnerId: string): void {
    const todoId = this.form.get("id")?.value || this.form.get("_id")?.value;
    if (!newOwnerId || !todoId) return;

    const visibility = this.form.get("visibility")?.value || "private";
    const token = this.jwtTokenService.getToken();
    this.requestService
      .invokeCommand("transfer_todo_ownership", {
        todo_id: todoId,
        new_user_id: newOwnerId,
        visibility,
        token,
      })
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Ownership transferred successfully");
          this.showTransferOwnershipDialog.set(false);
          this.location.back();
        },
        error: (err: Error) => {
          this.notifyService.showError(err.message || "Failed to transfer ownership");
        },
      });
  }

  onTransferOwnershipCancel(): void {
    this.showTransferOwnershipDialog.set(false);
  }

  loadAssigneeRoles(item: any): void {
    const roles: Record<string, string> = {};
    if (item.assignee_roles && typeof item.assignee_roles === "object") {
      Object.entries(item.assignee_roles).forEach(([key, value]) => {
        roles[key] = typeof value === "string" ? value : "viewer";
      });
    }
    this.assigneeRoles.set(roles);
  }

  getProfileById(profileId: string): Profile | undefined {
    return this.assignees().find((p: Profile) => p.user_id === profileId);
  }

  private async handleGithubIssueForTask(taskId: string, formValue: any): Promise<void> {
    const todo = this.todos().find((t) => t.id === formValue.todo_id);
    if (!todo?.github_repo_id || !todo?.github_repo_name) return;

    const [owner, repo] = todo.github_repo_name.split("/");
    const issueBody = this.buildIssueBody(formValue);
    const existingTask = this.storageService.tasks().find((t) => t.id === taskId);

    if (existingTask?.github_issue_id) {
      this.githubService
        .updateIssue(owner, repo, existingTask.github_issue_number!, formValue.title, issueBody)
        .subscribe();
    } else if (formValue.publish_to_github) {
      this.githubService.createIssue(owner, repo, formValue.title, issueBody).subscribe({
        next: (result) => {
          this.requestService
            .update<Task>("tasks", taskId, {
              github_issue_id: String(result.id),
              github_issue_number: result.number,
              github_issue_url: result.html_url,
            })
            .subscribe();
        },
      });
    }
  }

  private buildIssueBody(formValue: any): string {
    return `**Task Details**

**Description:** ${formValue.description || "N/A"}
**Priority:** ${formValue.priority || "medium"}
**Due Date:** ${formValue.end_date || "N/A"}
**Created in:** TaskFlow

---
[View in TaskFlow](taskflow://tasks/${formValue.id || formValue._id})`;
  }

  private subscriptions = new Subscription();
}
