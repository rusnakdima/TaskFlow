import { CommonModule, Location } from "@angular/common";
import {
  Component,
  OnInit,
  signal,
  inject,
  computed,
  ChangeDetectorRef,
  DestroyRef,
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
import { DataService } from "@services/data/data.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { RelationLoadingService } from "@services/core/relation-loading.service";
import { VisibilitySyncService } from "@services/core/visibility-sync.service";
import { GithubService } from "@services/github/github.service";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

import { ApiProvider } from "@providers/api.provider";
import { DateHelper } from "@helpers/date.helper";
import { bindSaveShortcut } from "@helpers/keyboard.helper";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";

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
    CheckboxComponent,
  ],
  templateUrl: "./manage-item.page.html",
})
export class ManageItemPage implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private authService = inject(AuthService);
  private jwtTokenService = inject(JwtTokenService);
  private dataService = inject(DataService);
  private notifyService = inject(NotifyService);
  private dataSyncProvider = inject(ApiProvider);
  private dataLoaderService = inject(DataLoaderService);
  private shortcutService = inject(ShortcutService);
  private cdr = inject(ChangeDetectorRef);
  private relationLoader = inject(RelationLoadingService);
  private visibilitySyncService = inject(VisibilitySyncService);
  private githubService = inject(GithubService);
  private destroyRef = inject(DestroyRef);

  form!: FormGroup;
  isEdit = signal(false);
  isSubmitting = signal(false);
  itemType = signal<ItemType>("todo");
  isOwner = signal(false);
  originalVisibility = signal<string>("");

  todos = signal<Todo[]>([]);
  tasks = signal<Task[]>([]);
  categories = signal<Category[]>([]);
  assignees = signal<Profile[]>([]);

  githubRepos = signal<any[]>([]);
  selectedGithubRepo = signal<string | null>(null);
  githubConnected = signal(false);
  publishToGithub = signal(false);

  categorySearchQuery = signal("");
  newCategoryTitle = signal("");
  selectedCategoryIds = signal<Set<string>>(new Set());
  assigneeSearchQuery = signal("");
  selectedAssigneeIds = signal<Set<string>>(new Set());

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

  showAssignees = computed(() => {
    return (
      this.itemType() === "todo" &&
      (this.visibility() === "shared" || this.visibility() === "public")
    );
  });

  pageTitle = computed(() => {
    const type = this.itemType();
    const edit = this.isEdit() ? "Edit" : "Create";
    return `${edit} ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  });

  ngOnInit(): void {
    this.initForm();
    this.subscribeToRoute();
    this.subscriptions.add(bindSaveShortcut(this.shortcutService, () => this.onSubmit()));
    this.loadGithubData();
    this.loadCategories();
    this.loadProfiles();
  }

  private loadCategories(): void {
    this.dataService.categories$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((categories) => this.categories.set(categories));

    this.dataService.getCategories().subscribe();
  }

  private loadProfiles(): void {
    this.dataService
      .getPublicProfiles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profiles) => this.assignees.set(profiles),
        error: () => {},
      });
  }

  private async loadGithubData(): Promise<void> {
    this.githubService.getConnectionStatus().subscribe({
      next: (status) => {
        this.githubConnected.set(status.connected);
        if (status.connected) {
          this.githubService.getRepos().subscribe({
            next: (repos) => this.githubRepos.set(repos),
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
    const type = this.itemType();

    this.dataService.todos$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((todos) => this.todos.set(todos));

    if (type === "task" || type === "subtask") {
      this.dataService.tasks$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((tasks) => this.tasks.set(tasks));
    }
  }

  private async loadExistingItem(params: RouteParams): Promise<void> {
    const config = this.currentConfig();
    const id = params.subtaskId || params.taskId || params.todoId;

    if (!id) return;

    try {
      let item: any;
      if (config.type === "todo") {
        item = await firstValueFrom(this.dataService.getTodo(id));
      } else if (config.type === "task") {
        item = await firstValueFrom(this.dataService.getTask(id));
      } else {
        item = await firstValueFrom(this.dataService.getSubtask(id));
      }

      if (item) {
        this.applyItemToForm(item);
      }
    } catch (err) {
      this.notifyService.showError("Failed to load item");
    }
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
    }

    if (item.visibility && !this.form.get("visibility")?.value) {
      this.form.patchValue({ visibility: item.visibility });
    }

    this.originalVisibility.set(item.visibility || "private");

    const userId = this.jwtTokenService.getUserId(this.jwtTokenService.getToken());
    this.isOwner.set(item.user_id === userId);

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

      if (this.isEdit()) {
        const id = formValue._id || formValue.id;
        if (config.type === "todo") {
          await firstValueFrom(this.dataService.updateTodo(id, payload));
        } else if (config.type === "task") {
          await firstValueFrom(this.dataService.updateTask(id, payload));
        } else {
          await firstValueFrom(this.dataService.updateSubtask(id, payload));
        }
      } else {
        if (config.type === "todo") {
          await firstValueFrom(this.dataService.createTodo(payload));
        } else if (config.type === "task") {
          await firstValueFrom(this.dataService.createTask(payload));
        } else {
          await firstValueFrom(this.dataService.createSubtask(payload));
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
        github_repo_id: formValue.github_repo_id || "",
        github_repo_name: this.getRepoName(formValue.github_repo_id),
      };
    } else if (config.type === "task") {
      const parentTodo = this.todos().find((t) => t.id === formValue.todo_id);
      return {
        ...base,
        todo_id: formValue.todo_id,
        repeat: formValue.repeat || "none",
        visibility: parentTodo?.visibility || "private",
        publish_to_github: formValue.publish_to_github || false,
      };
    } else {
      const parentTask = this.tasks().find((t) => t.id === formValue.task_id);
      const parentTodo = parentTask ? this.todos().find((t) => t.id === parentTask.todo_id) : null;
      return {
        ...base,
        task_id: formValue.task_id,
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
    if (fromVisibility === toVisibility || toVisibility === "private") {
      return;
    }

    try {
      const source = fromVisibility === "private" ? "Json" : "Mongo";
      const target = toVisibility === "private" ? "Json" : "Mongo";

      await firstValueFrom(
        this.dataSyncProvider.invokeCommand("sync_visibility_to_provider", {
          todo_id: todoId,
          source_provider: source,
          target_provider: target,
        })
      );

      if (toVisibility === "shared" || toVisibility === "public") {
        this.dataService.getTodos({ visibility: toVisibility }).subscribe();
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
    this.selectedGithubRepo.set(repoId);
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

    this.dataSyncProvider
      .crud<Category>("create", "categories", {
        data: { title, user_id: userId },
        visibility: "private",
      })
      .subscribe({
        next: (category: Category) => {
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
    } else {
      selected.add(assigneeId);
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

  private subscriptions = new Subscription();
}
