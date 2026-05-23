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
import { StorageService } from "@services/storage.service";
import { GithubService } from "@services/github/github.service";
import { MongoConnectionService } from "@services/core/mongo-connection.service";
import { ApiService } from "@services/api.service";
import { bindSaveShortcut } from "@helpers/keyboard.helper";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { TransferOwnershipDialogComponent } from "@components/transfer-ownership-dialog/transfer-ownership-dialog.component";
import { PermissionService, TodoPermission } from "@services/core/permission.service";

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
  ],
  templateUrl: "./manage-todo.view.html",
})
export class ManageTodoPage implements OnInit {
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
  private apiService = inject(ApiService);
  private requestService = inject(ApiService);
  private permissionService = inject(PermissionService);

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
    [TodoPermission.ADMIN, TodoPermission.MODERATOR, TodoPermission.OWNER].includes(
      this.userPermission()
    )
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
    if (this.form.invalid) {
      this.notifyService.showError("Please fill in required fields");
      return;
    }

    this.isSubmitting.set(true);

    try {
      const formValue = this.form.value;
      const payload = this.buildPayload(formValue);
      const visibility = this.isEdit() ? this.visibility() : formValue.visibility || "private";

      if (this.isEdit()) {
        const id = formValue._id || formValue.id;
        const result = await firstValueFrom(this.apiService.todos.update(id, payload, visibility));
        this.storageService.modify("todos", "update", { ...result, id });

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

  private buildPayload(formValue: any): any {
    const token = this.jwtTokenService.getToken();
    const userId = this.jwtTokenService.getUserId(token);

    return {
      id: formValue.id || undefined,
      title: formValue.title,
      description: formValue.description || "",
      priority: formValue.priority,
      start_date: formValue.start_date || "",
      end_date: formValue.end_date || "",
      user_id: userId,
      categories: formValue.categories || [],
      assignees: formValue.assignees || [],
      assignee_roles: this.assigneeRoles(),
      github_repo_id: formValue.github_repo_id || "",
      github_repo_name: this.getRepoName(formValue.github_repo_id),
      order: formValue.order ?? 0,
    };
  }

  private getRepoName(repoId: string): string {
    if (!repoId) return "";
    const numericId = parseInt(repoId, 10);
    if (isNaN(numericId)) return "";
    const repo = this.githubRepos().find((r) => r.id === numericId);
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
        this.storageService.updateEntityVisibility("todos", todoId, toVisibility);
        return;
      }

      await firstValueFrom(
        this.requestService.invokeCommand("sync_visibility_to_provider", {
          todo_id: todoId,
          entity_type: "todos",
          source_provider: source,
          target_provider: target,
          new_visibility: toVisibility,
        })
      );

      this.storageService.updateEntityVisibility("todos", todoId, toVisibility);

      await firstValueFrom(this.apiService.todos.get(todoId, toVisibility));
    } catch (error: any) {
      this.notifyService.showError(
        "Failed to sync visibility: " + (error.message || "Unknown error")
      );
    }
  }

  onGithubRepoChange(repoId: number | null): void {
    this.selectedGithubRepoId.set(repoId);
    this.form.patchValue({ github_repo_id: repoId ? String(repoId) : "" });
    this.githubRepoSearchQuery.set("");
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
