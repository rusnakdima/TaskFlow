import { CommonModule, Location } from "@angular/common";
import { Component, OnInit, signal, inject, computed, DestroyRef } from "@angular/core";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { Subscription, firstValueFrom } from "rxjs";

import { MatIconModule } from "@angular/material/icon";

import { Category, Profile } from "@models/generated/api.types";

import { AuthService } from "@services/auth/auth.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { UnifiedStorageService } from "@core/services/unified-storage.service";
import { GithubService } from "@services/github/github.service";
import { MongoConnectionService } from "@core/services/mongo-connection.service";
import { ApiService } from "@services/api.service";
import { bindSaveShortcut } from "@helpers/keyboard.helper";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { TransferOwnershipDialogComponent } from "@components/transfer-ownership-dialog/transfer-ownership-dialog.component";
import { AppButtonComponent } from "@components/shared/button/button.component";
import { PermissionService, TodoPermission } from "@core/services/permission.service";
import { LoggerService } from "@shared/services/logger.service";

import { BasicInfoSectionComponent } from "@components/form/basic-info-section.component";
import { CategorySectionComponent } from "@components/form/category-section.component";
import { PrioritySectionComponent } from "@components/form/priority-section.component";
import { VisibilitySectionComponent } from "@components/form/visibility-section.component";
import { AssigneesSectionComponent } from "@components/form/assignees-section.component";
import { PermissionsSectionComponent } from "@components/form/permissions-section.component";
import { GithubRepoSectionComponent } from "@components/form/github-repo-section.component";
import { GithubRepo as GithubRepoModel } from "@models/github.model";

@Component({
  selector: "app-manage-todo",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    BasicInfoSectionComponent,
    CategorySectionComponent,
    PrioritySectionComponent,
    VisibilitySectionComponent,
    AssigneesSectionComponent,
    PermissionsSectionComponent,
    GithubRepoSectionComponent,
    TransferOwnershipDialogComponent,
    AppButtonComponent,
  ],
  templateUrl: "./manage-todo.view.html",
})
export class ManageTodoPage implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private authService = inject(AuthService);
  private jwtTokenService = inject(JwtTokenService);
  private storage = inject(UnifiedStorageService);
  private notifyService = inject(NotifyService);
  private shortcutService = inject(ShortcutService);
  private githubService = inject(GithubService);
  private destroyRef = inject(DestroyRef);
  private mongoConnectionService = inject(MongoConnectionService);
  private apiService = inject(ApiService);
  private requestService = inject(ApiService);
  private permissionService = inject(PermissionService);
  private loggingService = inject(LoggerService);

  form!: FormGroup;

  isEdit = signal(false);
  isSubmitting = signal(false);
  isOwner = signal(false);
  originalVisibility = signal<string>("");
  userPermission = signal<TodoPermission>(TodoPermission.VIEWER);

  categories = signal<Category[]>([]);
  assignees = signal<Profile[]>([]);

  githubRepos = signal<GithubRepoModel[]>([]);
  selectedGithubRepoId = signal<number | null>(null);
  githubConnected = signal(false);
  githubRepoSearchQuery = signal("");

  categorySearchQuery = signal("");
  newCategoryTitle = signal("");
  selectedCategoryIds = signal<Set<string>>(new Set());
  assigneeSearchQuery = signal("");
  selectedAssigneeIds = signal<Set<string>>(new Set());
  assigneeRoles = signal<Record<string, string>>({});
  showPermissionsSection = computed(() => {
    const visibility = this.visibility();
    const isSharedOrPublic = visibility === "shared" || visibility === "public";
    return isSharedOrPublic && this.isOwner();
  });
  showTransferOwnershipDialog = signal(false);

  canEditVisibility = computed(() => this.userPermission() === TodoPermission.OWNER);
  canManageAssignees = computed(() => this.userPermission() === TodoPermission.OWNER);
  canManageGhRepo = computed(() => this.userPermission() === TodoPermission.OWNER);
  canManageCategories = computed(() =>
    [TodoPermission.MODERATOR, TodoPermission.OWNER].includes(this.userPermission())
  );
  canEditPriority = computed(() =>
    [TodoPermission.MODERATOR, TodoPermission.OWNER].includes(this.userPermission())
  );

  visibility = signal<string>("private");

  showAssignees = computed(() => {
    return this.visibility() === "shared" || this.visibility() === "public";
  });

  pageTitle = computed(() => {
    return this.isEdit() ? "Edit Project" : "Create Project";
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

    if (!this.isEdit()) {
      this.userPermission.set(TodoPermission.OWNER);
      this.isOwner.set(true);
    }
  }

  private loadCategories(): void {
    this.categories.set(this.storage.categories());

    this.requestService
      .loadPage<Category>("categories", { visibility: "private", limit: 50, skip: 0 })
      .subscribe({
        next: (categories: Category[]) => {
          this.categories.set(categories);
        },
        error: () => {
          this.categories.set(this.storage.categories());
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
      basicInfo: this.fb.group({
        title: ["", Validators.required],
        description: [""],
      }),
      priority: ["medium"],
      start_date: [""],
      end_date: [""],
      visibility: ["private"],
      categories: [[]],
      assignees: [[]],
      assignee_roles: [{}],
      github_repo_id: [""],
      order: [0],
    });
  }

  private subscribeToRoute(): void {
    this.subscriptions.add(
      this.route.params.subscribe(async (params) => {
        await this.loadData(params);
      })
    );

    this.form.get("visibility")?.valueChanges.subscribe((visibility) => {
      this.visibility.set(visibility || "private");
    });
    this.visibility.set(this.form.get("visibility")?.value || "private");
  }

  private async loadData(params: any): Promise<void> {
    const todoId = params.todoId;
    const visibility = this.route.snapshot.queryParamMap.get("visibility") || undefined;

    if (todoId) {
      this.isEdit.set(true);
      await this.loadExistingTodo(todoId, visibility);
    }
  }

  private async loadExistingTodo(todoId: string, visibility?: string): Promise<void> {
    try {
      const item = await firstValueFrom(this.apiService.todos.get(todoId, visibility));

      if (item) {
        await this.loadAndSetUserPermission(item);
        this.applyItemToForm(item);
      }
    } catch (err) {
      this.notifyService.showError("Failed to load project");
    }
  }

  private async loadAndSetUserPermission(item: any): Promise<void> {
    const userId = this.getCurrentUserId();
    const profileId = this.getCurrentProfileId();

    if (item.user_id === userId) {
      this.userPermission.set(TodoPermission.OWNER);
      return;
    }

    if (item.assignee_roles && item.assignee_roles[userId]) {
      this.userPermission.set(this.permissionService.fromStr(item.assignee_roles[userId]));
      return;
    }

    if (item.visibility === "public") {
      this.userPermission.set(TodoPermission.VIEWER);
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
  }

  private applyItemToForm(item: any): void {
    this.form.patchValue({
      _id: item._id || "",
      id: item.id || "",
      priority: item.priority || "medium",
      start_date: item.start_date || "",
      end_date: item.end_date || "",
      visibility: item.visibility || "private",
      github_repo_id: item.github_repo_id || "",
      order: item.order ?? 0,
    });

    this.form.get("basicInfo")?.patchValue({
      title: item.title || "",
      description: item.description || "",
    });

    if (item.categories) {
      let categoryIds: string[] = [];
      if (typeof item.categories === "string") {
        try {
          categoryIds = JSON.parse(item.categories);
        } catch (error) {
          this.loggingService.error("Failed to parse categories", error, {
            categories: item.categories,
          });
        }
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

    this.loadAssigneeRoles(item);
  }

  private loadAssigneeRoles(item: any): void {
    const roles: Record<string, string> = {};
    if (item.assignee_roles && typeof item.assignee_roles === "object") {
      Object.entries(item.assignee_roles).forEach(([key, value]) => {
        roles[key] = typeof value === "string" ? value : "viewer";
      });
    }
    this.assigneeRoles.set(roles);
  }

  getCurrentUserId(): string {
    return this.authService.getValueByKey("id");
  }

  getCurrentProfileId(): string | null {
    return this.jwtTokenService.getProfileId(this.jwtTokenService.getToken());
  }

  onVisibilityChange(visibility: string): void {
    this.form.patchValue({ visibility });
  }

  async onSubmit(): Promise<void> {
    this.loggingService.debug("onSubmit", { formInvalid: this.form.invalid });
    this.loggingService.debug("onSubmit form value", { formValue: this.form.value });
    this.loggingService.debug("onSubmit basicInfo group", {
      basicInfo: this.form.get("basicInfo")?.value,
    });
    this.loggingService.debug("onSubmit basicInfo invalid", {
      invalid: this.form.get("basicInfo")?.invalid,
    });
    this.loggingService.debug("onSubmit basicInfo title errors", {
      errors: this.form.get("basicInfo.title")?.errors,
    });

    if (this.form.invalid) {
      this.notifyService.showError("Please fill in required fields");
      return;
    }

    this.isSubmitting.set(true);

    try {
      const formValue = this.form.value;
      const basicInfo = formValue.basicInfo;
      const payload = this.buildPayload(formValue, basicInfo);
      const visibility = this.isEdit() ? this.visibility() : formValue.visibility || "private";

      if (this.isEdit()) {
        const id = formValue._id || formValue.id;
        const result = await firstValueFrom(this.apiService.todos.update(id, payload, visibility));
        this.storage.updateEntitySignal("todos", id, { ...result, id });

        await this.syncTodoVisibilityOnChange(
          formValue.id,
          this.originalVisibility(),
          formValue.visibility
        );
      } else {
        await firstValueFrom(this.apiService.todos.create(payload, visibility));
      }

      this.notifyService.showSuccess(
        `Project ${this.isEdit() ? "updated" : "created"} successfully`
      );

      this.location.back();
    } catch (err: any) {
      this.notifyService.showError(err.message || "Failed to save");
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private buildPayload(formValue: any, basicInfo: any): any {
    const token = this.jwtTokenService.getToken();
    const userId = this.jwtTokenService.getUserId(token);

    return {
      id: formValue.id || undefined,
      title: basicInfo.title,
      description: basicInfo.description || "",
      priority: formValue.priority,
      start_date: formValue.start_date || "",
      end_date: formValue.end_date || "",
      user_id: userId,
      categories: formValue.categories || [],
      assignees: formValue.assignees || [],
      assignee_roles: this.assigneeRoles(),
      github_repo_id: formValue.github_repo_id || "",
      github_repo_name: this.getRepoName(parseInt(formValue.github_repo_id, 10)),
      order: formValue.order ?? 0,
    };
  }

  private getRepoName(repoId: number): string {
    if (!repoId || isNaN(repoId)) return "";
    const repo = this.githubRepos().find((r) => r.id === repoId);
    return repo?.full_name || "";
  }

  private async syncTodoVisibilityOnChange(
    todoId: string,
    fromVisibility: string,
    toVisibility: string
  ): Promise<void> {
    if (fromVisibility === toVisibility) return;

    try {
      const source = fromVisibility === "private" ? "Json" : "Mongo";
      const target = toVisibility === "private" ? "Json" : "Mongo";

      if (source === target) {
        this.storage.updateEntitySignal("todos", todoId, { id: todoId, visibility: toVisibility });
        return;
      }

      await firstValueFrom(
        this.requestService.invokeCommand("sync_visibility_to_provider", {
          todo_id: todoId,
          entity_type: "todos",
          source_provider: source,
          target_provider: target,
          new_visibility: toVisibility,
          delete_from_source: source === "Json",
        })
      );

      this.storage.updateEntitySignal("todos", todoId, { id: todoId, visibility: toVisibility });

      await firstValueFrom(this.apiService.todos.get(todoId, toVisibility));
    } catch (error: any) {
      this.notifyService.showError(
        "Failed to sync visibility: " + (error.message || "Unknown error")
      );
    }
  }

  onGithubRepoChange(repoData: { repoId: number | null; searchQuery: string }): void {
    this.selectedGithubRepoId.set(repoData.repoId);
    this.form.patchValue({ github_repo_id: repoData.repoId ? String(repoData.repoId) : "" });
    this.githubRepoSearchQuery.set(repoData.searchQuery);
  }

  back(): void {
    this.location.back();
  }

  addCategory(): void {
    const title = this.newCategoryTitle().trim();
    if (!title) return;

    const userId = this.authService.getValueByKey("id");
    this.newCategoryTitle.set("");

    this.apiService.categories.create({ title, user_id: userId }).subscribe({
      next: (category: Category) => {
        this.categories.update((cats) => [...cats, category]);
        const currentIds = this.form.get("categories")?.value || [];
        const newIds = [...currentIds, category.id];
        this.form.patchValue({ categories: newIds });
        this.selectedCategoryIds.set(new Set(newIds));
      },
      error: (err: Error) =>
        this.notifyService.showError(err.message || "Failed to create category"),
    });
  }

  toggleCategorySelection(categoryId: string): void {
    const currentIds = this.form.get("categories")?.value || [];
    let newIds: string[];
    if (currentIds.includes(categoryId)) {
      newIds = currentIds.filter((id: string) => id !== categoryId);
    } else {
      newIds = [...currentIds, categoryId];
    }
    this.form.patchValue({ categories: newIds });
    this.selectedCategoryIds.set(new Set(newIds));
  }

  toggleSelectAllCategories(): void {
    const allIds = this.categories().map((c: Category) => c.id);
    const currentIds = this.form.get("categories")?.value || [];
    const newIds = currentIds.length === allIds.length ? [] : allIds;
    this.form.patchValue({ categories: newIds });
    this.selectedCategoryIds.set(new Set(newIds));
  }

  toggleAssigneeSelection(assigneeId: string): void {
    const currentIds = this.form.get("assignees")?.value || [];
    let newIds: string[];
    if (currentIds.includes(assigneeId)) {
      newIds = currentIds.filter((id: string) => id !== assigneeId);
      this.assigneeRoles.update((roles) => {
        const newRoles = { ...roles };
        delete newRoles[assigneeId];
        return newRoles;
      });
    } else {
      newIds = [...currentIds, assigneeId];
      this.assigneeRoles.update((roles) => ({ ...roles, [assigneeId]: "viewer" }));
    }
    this.form.patchValue({ assignees: newIds });
    this.selectedAssigneeIds.set(new Set(newIds));
  }

  toggleSelectAllAssignees(): void {
    const allIds = this.assignees().map((a: Profile) => a.user_id);
    const currentIds = this.form.get("assignees")?.value || [];
    const newIds = currentIds.length === allIds.length ? [] : allIds;
    this.form.patchValue({ assignees: newIds });
    this.selectedAssigneeIds.set(new Set(newIds));
  }

  onRoleChange(event: { profileId: string; role: string }): void {
    this.assigneeRoles.update((roles) => ({ ...roles, [event.profileId]: event.role }));
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

  private subscriptions = new Subscription();
}
