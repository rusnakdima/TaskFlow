/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component, OnDestroy, OnInit, signal, ChangeDetectorRef } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { Subscription, Observable, of } from "rxjs";
import { map, catchError } from "rxjs/operators";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatDatepickerModule, MatCalendarCellCssClasses } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";
import { MatRadioModule } from "@angular/material/radio";
import { MatMenuModule } from "@angular/material/menu";
import { MatDividerModule } from "@angular/material/divider";

/* models */
import { Todo } from "@models/todo.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { TodoRelations, ProfileRelations } from "@models/relations.config";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { StorageService } from "@services/core/storage.service";
import { DataSyncService } from "@services/data/data-sync.service";
import { RelationLoadingService } from "@services/core/relation-loading.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* helpers */
import { DateHelper } from "@helpers/date-helpers";
import { ValidationHelper } from "@helpers/validation.helper";

@Component({
  selector: "app-manage-todo",
  standalone: true,
  providers: [AuthService, DataSyncProvider],
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
  templateUrl: "./manage-todo.view.html",
})
export class ManageTodoView implements OnInit, OnDestroy {
  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private location: Location,
    private authService: AuthService,
    private storageService: StorageService,
    private notifyService: NotifyService,
    private dataSyncProvider: DataSyncProvider,
    private shortcutService: ShortcutService,
    private dataSyncService: DataSyncService,
    private cdr: ChangeDetectorRef,
    private relationLoader: RelationLoadingService
  ) {
    this.form = fb.group({
      _id: [""],
      id: [""],
      userId: ["", Validators.required],
      title: ["", Validators.required],
      description: ["", Validators.required],
      startDate: [""],
      endDate: [""],
      priority: ["medium"],
      visibility: ["private"],
      categories: [[]],
      assignees: [[]],
      order: [0],
      isDeleted: [false],
      createdAt: [""],
      updatedAt: [""],
    });

    this.dateClass = DateHelper.createDateClass(this.form);
  }

  userId = signal("");

  form: FormGroup;
  isEdit = signal(false);
  isSubmitting = signal(false);
  isOwner: boolean = false;
  isPrivate: boolean = true;
  today = new Date();

  private saveSubscription: Subscription | null = null;

  dateClass!: (date: Date) => MatCalendarCellCssClasses;

  priorityOptions = [
    { value: "low", label: "Low", description: "Non-urgent tasks", colorClass: "bg-blue-500" },
    {
      value: "medium",
      label: "Medium",
      description: "Standard priority",
      colorClass: "bg-yellow-500",
    },
    {
      value: "high",
      label: "High",
      description: "Requires prompt attention",
      colorClass: "bg-orange-500",
    },
    {
      value: "urgent",
      label: "Urgent",
      description: "Critical, needs immediate action",
      colorClass: "bg-red-500",
    },
  ];

  availableProfiles = signal<Profile[]>([]);
  localTeamMembers = signal<Profile[]>([]);
  userSearchQuery = signal("");

  availableCategories = signal<Category[]>([]);
  newCategoryTitle = signal("");
  isCategoryListExpanded = signal(false);

  async ngOnInit() {
    this.saveSubscription = this.shortcutService.save$.subscribe(() => this.onSubmit());
    this.userId.set(this.authService.getValueByKey("id"));

    if (this.userId() && this.userId() != "") {
      this.form.controls["userId"].setValue(this.userId());
      await this.fetchProfiles();
      this.fetchCategories();
    }

    this.route.params.subscribe((params: any) => {
      if (params.todoId) {
        this.getTodoInfo(params.todoId);
        this.isEdit.set(true);
      }
    });

    setTimeout(() => {
      if (!this.isEdit()) this.fetchTodosCount();
    }, 1000);
  }

  ngOnDestroy(): void {
    this.saveSubscription?.unsubscribe();
  }

  getTodoInfo(todoId: string) {
    // First, try to get from storage with relations
    const todoFromStorage = this.storageService.getById("todos", todoId);
    if (todoFromStorage) {
      // Check if relations are already loaded with full objects (not just IDs)
      const hasTasks = todoFromStorage.tasks && todoFromStorage.tasks.length > 0;
      const hasCategories =
        todoFromStorage.categories &&
        todoFromStorage.categories.length > 0 &&
        typeof todoFromStorage.categories[0] === "object" &&
        "title" in todoFromStorage.categories[0]; // Full category object has 'title'
      const hasRelations = hasTasks || hasCategories;

      if (hasRelations) {
        // Use stored todo with relations
        const localDates = DateHelper.convertDatesFromUtcToLocal(todoFromStorage);
        this.isOwner = todoFromStorage.userId === this.userId();
        this.isPrivate = todoFromStorage.visibility === "private";

        // Prepare form values
        const formValues: any = {
          ...localDates,
          visibility: todoFromStorage.visibility,
          assignees: [],
        };
        console.log(formValues);

        // Load assignees - convert from user IDs to Profile objects if needed
        if (todoFromStorage.assignees && todoFromStorage.assignees.length > 0) {
          this.resolveAssigneesToProfiles(todoFromStorage.assignees).subscribe((profiles) => {
            formValues.assignees = profiles;
            console.log(profiles);
            this.form.patchValue(formValues);
            // Force change detection to update radio buttons and UI
            setTimeout(() => this.cdr.detectChanges(), 0);
          });
        } else {
          this.form.patchValue(formValues);
          setTimeout(() => this.cdr.detectChanges(), 0);
        }

        if (!this.isPrivate) {
          this.notifyService.showInfo(
            "You're editing a shared todo. Changes will be sent to the owner."
          );
        }

        return;
      }
      // If relations not loaded, fall through to fetch with relations
    }

    // Fetch todo with relations using RelationLoadingService
    this.relationLoader
      .load<Todo>(
        this.dataSyncProvider,
        "todos",
        todoId,
        TodoRelations.forDetailView() // ["user", "tasks", "tasks.subtasks", "tasks.comments", "categories"]
      )
      .subscribe({
        next: (todo: Todo) => {
          // Store the fetched todo with relations in storage
          // This ensures categories and other relations are available globally
          this.storageService.updateItem("todos", todo.id, todo);

          const localDates = DateHelper.convertDatesFromUtcToLocal(todo);
          this.isOwner = todo.userId === this.userId();
          this.isPrivate = todo.visibility === "private";

          // Prepare form values
          const formValues: any = {
            ...localDates,
            visibility: todo.visibility,
            assignees: [],
          };

          // Load assignees - convert from user IDs to Profile objects if needed
          if (todo.assignees && todo.assignees.length > 0) {
            this.resolveAssigneesToProfiles(todo.assignees).subscribe((profiles) => {
              formValues.assignees = profiles;
              this.form.patchValue(formValues);
              // Force change detection to update radio buttons and UI
              setTimeout(() => this.cdr.detectChanges(), 0);
            });
          } else {
            this.form.patchValue(formValues);
            setTimeout(() => this.cdr.detectChanges(), 0);
          }

          if (!this.isPrivate)
            this.notifyService.showInfo(
              "You're editing a shared todo. Changes will be sent to the owner."
            );
        },
        error: (err: any) => this.notifyService.showError(err.message || "Failed to load todo"),
      });
  }

  /**
   * Resolve assignees to Profile objects
   * Assignees are user IDs (strings), resolve to Profile objects from assigneesProfiles
   */
  private resolveAssigneesToProfiles(assignees: string[]): Observable<Profile[]> {
    // Extract user IDs from assignees
    const userIds = assignees.filter((a) => typeof a === "string") as string[];

    if (userIds.length === 0) {
      return of([]);
    }

    // First try to get profiles from storage using assigneesProfiles
    const storedProfiles = this.storageService
      .todos()
      .flatMap((todo) => todo.assigneesProfiles || [])
      .filter((p) => userIds.includes(p.userId));

    // Check if all stored profiles have user relation loaded
    const allHaveUser = storedProfiles.every((p) => p.user);

    // If we found all profiles in storage and they have user data, return them
    if (storedProfiles.length === userIds.length && allHaveUser) {
      return of(storedProfiles);
    }

    // Otherwise, fetch all profiles with user relation and filter
    return this.dataSyncProvider
      .crud<Profile[]>("getAll", "profiles", { filter: {}, load: ProfileRelations.user }, true)
      .pipe(
        map((profiles) => {
          if (!profiles || profiles.length === 0) {
            // Return what we found in storage
            return storedProfiles;
          }
          // Filter profiles by user IDs and merge with stored profiles
          const fetchedProfiles = profiles.filter((p) => userIds.includes(p.userId));
          const profileMap = new Map<string, Profile>();
          storedProfiles.forEach((p) => profileMap.set(p.userId, p));
          fetchedProfiles.forEach((p) => profileMap.set(p.userId, p));
          return Array.from(profileMap.values());
        }),
        catchError(() => {
          // On error, return what we found in storage
          return of(storedProfiles);
        })
      );
  }

  back() {
    this.location.back();
  }

  async fetchTodosCount() {
    const todos = this.storageService.todos();
    if (todos && todos.length > 0) {
      this.form.controls["order"].setValue(todos.length);
    }
  }

  async fetchProfiles(): Promise<void> {
    // Get current user's profile
    const currentProfile = this.storageService.profile();
    const profiles: Profile[] = currentProfile ? [currentProfile] : [];

    // Also collect all unique profiles from shared todos (assignees)
    const sharedTodos = this.storageService.sharedTodos();
    const profileMap = new Map<string, Profile>();

    // Add current user's profile
    if (currentProfile) {
      profileMap.set(currentProfile.userId, currentProfile);
    }

    // Collect profiles from assignees in shared todos
    sharedTodos.forEach((todo) => {
      if (todo.assigneesProfiles) {
        todo.assigneesProfiles.forEach((profile) => {
          if (profile?.userId) {
            profileMap.set(profile.userId, profile);
          }
        });
      }
    });

    // Merge profiles
    Array.from(profileMap.values()).forEach((p) => {
      if (!profiles.some((existing) => existing.userId === p.userId)) {
        profiles.push(p);
      }
    });

    // If we don't have profiles with user data, fetch from backend with relations
    const needsUserData = profiles.some((p) => !p.user);
    if (needsUserData || profiles.length === 0) {
      this.dataSyncProvider
        .crud<Profile[]>("getAll", "profiles", { filter: {}, load: ProfileRelations.user }, true)
        .subscribe({
          next: (fetchedProfiles) => {
            if (fetchedProfiles && fetchedProfiles.length > 0) {
              // Merge fetched profiles with existing ones
              const mergedMap = new Map<string, Profile>();
              profiles.forEach((p) => mergedMap.set(p.userId, p));
              fetchedProfiles.forEach((p) => mergedMap.set(p.userId, p));
              this.availableProfiles.set(Array.from(mergedMap.values()));
            } else {
              this.availableProfiles.set(profiles);
            }
          },
          error: (err) => {
            console.error("Failed to fetch profiles with user data:", err);
            // Use what we have from storage
            this.availableProfiles.set(profiles);
          },
        });
    } else {
      this.availableProfiles.set(profiles);
    }
  }

  getFilteredUsers() {
    if (!this.userSearchQuery()) return this.availableProfiles();
    return this.availableProfiles().filter((p) =>
      `${p.name} ${p.lastName} ${p.user?.email || ""}`
        .toLowerCase()
        .includes(this.userSearchQuery().toLowerCase())
    );
  }

  addProfile(profile: Profile) {
    const currentAssignees = this.form.get("assignees")?.value || [];
    if (!currentAssignees.some((p: Profile) => p.userId === profile.userId)) {
      this.form.patchValue({ assignees: [...currentAssignees, profile] });
    }
  }

  removeProfile(profile: Profile) {
    const currentAssignees = this.form.get("assignees")?.value || [];
    this.form.patchValue({
      assignees: currentAssignees.filter((p: Profile) => p.userId !== profile.userId),
    });
  }

  getMemberInitialsFromProfile(profile: Profile): string {
    return (profile.name.charAt(0) + profile.lastName.charAt(0)).toUpperCase();
  }

  getSelectedUsersText(): string {
    const assignees = this.form.get("assignees")?.value || [];
    return assignees.map((p: Profile) => `${p.name} ${p.lastName}`).join(", ");
  }

  fetchCategories() {
    const categories = this.storageService.categories();
    if (categories && categories.length > 0) {
      this.availableCategories.set(categories);
    } else {
      // If no categories in storage, fetch from backend
      this.dataSyncProvider
        .crud<Category[]>("getAll", "categories", { filter: { isDeleted: false } }, true)
        .subscribe({
          next: (cats) => {
            if (cats && cats.length > 0) {
              this.availableCategories.set(cats);
              // Also update storage for future use
              this.storageService.setCollection("categories", cats);
            }
          },
          error: (err) => {
            console.error("Failed to fetch categories:", err);
          },
        });
    }
  }

  getFilteredAvailableCategories() {
    if (!this.newCategoryTitle()) return this.availableCategories();
    return this.availableCategories().filter((cat) =>
      cat.title.toLowerCase().includes(this.newCategoryTitle().toLowerCase())
    );
  }

  isCategorySelected(category: Category): boolean {
    return (this.form.get("categories")?.value || []).some((c: Category) => c.id === category.id);
  }

  toggleCategory(category: Category) {
    const current = this.form.get("categories")?.value || [];
    const exists = current.some((c: Category) => c.id === category.id);
    this.form.patchValue({
      categories: exists
        ? current.filter((c: Category) => c.id !== category.id)
        : [...current, category],
    });
  }

  getSelectedCategoriesText(): string {
    return (this.form.get("categories")?.value || []).map((c: Category) => c.title).join(", ");
  }

  addCategory() {
    if (this.newCategoryTitle().trim()) {
      const title = this.newCategoryTitle().trim();

      this.newCategoryTitle.set("");

      // Sync with backend
      this.dataSyncProvider
        .crud<Category>("create", "categories", {
          data: {
            title: title,
            userId: this.userId(),
          },
        })
        .subscribe({
          next: (result: Category) => {
            this.storageService.addItem("categories", result);
            this.fetchCategories();
            this.notifyService.showSuccess("Category added successfully");
          },
          error: (err: any) => {
            this.notifyService.showError(err.message || "Failed to add category");
          },
        });
    }
  }

  onSubmit() {
    if (!ValidationHelper.validateForm(this.form, this.notifyService, this.isSubmitting())) {
      return;
    }
    this.isSubmitting.set(true);
    if (this.isEdit()) {
      this.updateTodo();
    } else {
      this.createTodo();
    }
  }

  createTodo() {
    if (this.form.valid) {
      const formValue = this.form.value;
      const normalizedFormValue = DateHelper.normalizeDateFields(formValue);
      const convertedDates = DateHelper.convertDatesToUtc(normalizedFormValue);

      // Only send fields that TodoCreateModel expects
      // Backend will generate: _id, id, createdAt, updatedAt
      // Backend will set default: isDeleted = false
      const body = {
        userId: convertedDates.userId,
        title: convertedDates.title,
        description: convertedDates.description,
        startDate: convertedDates.startDate,
        endDate: convertedDates.endDate,
        priority: formValue.priority || "medium",
        visibility: formValue.visibility || "private",
        categories: formValue.categories.map((c: Category) => c.id),
        assignees: formValue.assignees.map((p: Profile) => p.userId),
        order: formValue.order || 0,
      };

      this.dataSyncProvider
        .crud<Todo>("create", "todos", { data: body, parentTodoId: body.userId })
        .subscribe({
          next: (result: Todo) => {
            this.isSubmitting.set(false);
            this.notifyService.showSuccess("Todo created successfully");
            this.back();
          },
          error: (err: any) => {
            this.isSubmitting.set(false);
            this.notifyService.showError(err.message || "Failed to create todo");
          },
        });
    } else {
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  async updateTodo() {
    if (this.form.valid) {
      const formValue = this.form.value;
      const body = {
        ...DateHelper.convertDatesToUtc(DateHelper.normalizeDateFields(formValue)),
        priority: formValue.priority || "medium",
        categories: formValue.categories.map((c: Category) => c.id),
        assignees: formValue.assignees.map((p: Profile) => p.userId),
        visibility: formValue.visibility as "private" | "team",
      };

      const newVisibility = formValue.visibility as "private" | "team";
      const visibilityChanged = this.isPrivate !== (newVisibility === "private");
      const todoId = body.id;

      // Determine sync metadata based on ownership
      const isOwner = formValue.userId === this.userId();
      const syncMetadata = { isOwner, isPrivate: newVisibility === "private" };

      // ✅ MongoDB sync FIRST - update local storage only on success
      this.dataSyncProvider
        .crud<Todo>("update", "todos", {
          id: body.id,
          data: body,
          parentTodoId: body.id,
          ...syncMetadata,
        })
        .subscribe({
          next: async (result: Todo) => {
            // ✅ Update local storage AFTER MongoDB confirms success
            // This ensures local DB matches MongoDB state
            this.storageService.updateItem("todos", todoId, result);

            if (visibilityChanged) {
              try {
                // Sync visibility change to local storage
                // This imports the updated todo from cloud and TodoHandler auto-moves it
                await this.dataSyncProvider.syncSingleTodoVisibilityChange(todoId, newVisibility);
              } catch (err) {
                this.notifyService.showWarning("Todo updated, but sync may not have completed.");
              }
            }
            this.isPrivate = newVisibility === "private";
            this.isSubmitting.set(false);
            this.notifyService.showSuccess("Todo updated successfully");
            setTimeout(() => this.back(), 1000);
          },
          error: (err) => {
            this.isSubmitting.set(false);
            this.notifyService.showError(err.message || "Failed to update todo");
          },
        });
    } else {
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  endDateFilter = (date: Date | null): boolean =>
    ValidationHelper.createEndDateFilter("startDate", this.form)(date);
}
