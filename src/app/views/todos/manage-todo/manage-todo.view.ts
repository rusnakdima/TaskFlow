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

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { StorageService } from "@services/core/storage.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { RelationLoadingService } from "@services/core/relation-loading.service";
import { VisibilitySyncService } from "@services/core/visibility-sync.service";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* helpers */
import { DateHelper } from "@helpers/date.helper";
import { ValidationHelper } from "@helpers/validation.helper";

@Component({
  selector: "app-manage-todo",
  standalone: true,
  providers: [AuthService, ApiProvider],
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
    private dataSyncProvider: ApiProvider,
    private shortcutService: ShortcutService,
    private dataSyncService: DataLoaderService,
    private cdr: ChangeDetectorRef,
    private relationLoader: RelationLoadingService,
    private visibilitySyncService: VisibilitySyncService
  ) {
    this.form = fb.group({
      id: [""],
      user_id: ["", Validators.required],
      title: ["", Validators.required],
      description: ["", Validators.required],
      start_date: [""],
      end_date: [""],
      priority: ["medium"],
      visibility: ["private"],
      categories: [[]],
      assignees: [[]],
      order: [0],
      created_at: [""],
      updated_at: [""],
      deleted_at: [false],
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

  ngOnInit(): void {
    this.saveSubscription = this.shortcutService.save$.subscribe(() => this.onSubmit());
    this.userId.set(this.authService.getValueByKey("id"));

    if (this.userId() && this.userId() !== "") {
      this.form.controls["user_id"].setValue(this.userId());
      this.fetchProfiles(); // Storage-first, no await — form opens immediately
      this.fetchCategories();
    }

    this.route.params.subscribe((params: any) => {
      if (params.todo_id) {
        this.getTodoInfo(params.todo_id);
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
    // Use storage first — no network call when todo is already cached
    const todoFromStorage = this.storageService.getById("todos", todoId) as Todo | undefined;
    if (todoFromStorage) {
      this.applyTodoToForm(todoFromStorage);
      return;
    }

    // Determine sync_metadata - default to team visibility (MongoDB) since todo is not in storage
    const syncMetadata = { is_owner: true, is_private: false };

    // Todo not in storage — fetch once with relations
    this.relationLoader
      .load<Todo>(
        this.dataSyncProvider,
        "todos",
        todoId,
        [
          "user",
          "user.profile",
          "tasks",
          "tasks.subtasks",
          "tasks.comments",
          "categories",
          "assignees_profiles",
          "assignees_profiles.user",
        ],
        syncMetadata
      )
      .subscribe({
        next: (todo: Todo) => {
          this.storageService.updateItem("todos", todo.id, todo);
          this.applyTodoToForm(todo);
        },
        error: (err: any) => this.notifyService.showError(err.message || "Failed to load todo"),
      });
  }

  /**
   * Apply todo (from storage or API) to the form.
   * Resolves category IDs to full objects from storage when needed.
   */
  private applyTodoToForm(todo: Todo): void {
    const localDates = DateHelper.convertDatesFromUtcToLocal(todo);
    this.isOwner = todo.user_id === this.userId();
    this.isPrivate = todo.visibility === "private";

    // Resolve categories: IDs -> full objects from storage if needed
    const allCategories = this.storageService.categories();
    let categoriesFormValue: Category[] = [];
    if (todo.categories && todo.categories.length > 0) {
      const first = todo.categories[0];
      if (typeof first === "object" && first !== null && "title" in first) {
        categoriesFormValue = todo.categories as Category[];
      } else {
        const ids = todo.categories as unknown as string[];
        categoriesFormValue = ids
          .map((id) => allCategories.find((c) => c.id === id))
          .filter((c): c is Category => !!c);
      }
    }

    const formValues: any = {
      ...localDates,
      visibility: todo.visibility,
      assignees: [],
      categories: categoriesFormValue,
    };

    if (todo.assignees && todo.assignees.length > 0) {
      this.resolveAssigneesToProfiles(todo.assignees).subscribe((profiles) => {
        formValues.assignees = profiles;
        this.form.patchValue(formValues);
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

    // First try to get profiles from storage using assignees_profiles
    const storedProfiles = this.storageService
      .todos()
      .flatMap((todo) => todo.assignees_profiles || [])
      .filter((p) => userIds.includes(p.user_id));

    // Check if all stored profiles have user relation loaded
    const allHaveUser = storedProfiles.every((p) => p.user);

    // If we found all profiles in storage and they have user data, return them
    if (storedProfiles.length === userIds.length && allHaveUser) {
      return of(storedProfiles);
    }

    // Otherwise, fetch all profiles and filter
    return this.dataSyncProvider.crud<Profile[]>("getAll", "profiles", { filter: {} }, true).pipe(
      map((profiles) => {
        if (!profiles || profiles.length === 0) {
          // Return what we found in storage
          return storedProfiles;
        }
        // Filter profiles by user IDs and merge with stored profiles
        const fetchedProfiles = profiles.filter((p) => userIds.includes(p.user_id));
        const profileMap = new Map<string, Profile>();
        storedProfiles.forEach((p) => profileMap.set(p.user_id, p));
        fetchedProfiles.forEach((p) => profileMap.set(p.user_id, p));
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

  fetchProfiles(): void {
    // 1. Use storage first — show dropdown immediately (no long load)
    const currentProfile = this.storageService.profile();
    const profileMap = new Map<string, Profile>();
    if (currentProfile) {
      profileMap.set(currentProfile.user_id, currentProfile);
    }
    this.storageService.sharedTodos().forEach((todo) => {
      todo.assignees_profiles?.forEach((profile: any) => {
        if (profile?.user_id) profileMap.set(profile.user_id, profile);
      });
    });
    const fromStorage = Array.from(profileMap.values());
    this.availableProfiles.set(fromStorage);

    // 2. Load all profiles from backend/JSON in background;
    //    update storage with current user's profile so header gets profile with user
    this.dataSyncProvider
      .crud<Profile[]>(
        "getAll",
        "profiles",
        {
          filter: {},
          isPrivate: false,
          isOwner: false,
        },
        true
      )
      .subscribe({
        next: (fetchedProfiles) => {
          if (!fetchedProfiles?.length) return;
          const merged = new Map<string, Profile>();
          fromStorage.forEach((p) => merged.set(p.user_id, p));
          fetchedProfiles.forEach((p) => merged.set(p.user_id, p));
          this.availableProfiles.set(Array.from(merged.values()));
          const myProfile = fetchedProfiles.find((p) => p.user_id === this.userId());
          if (myProfile) {
            this.storageService.setCollection("profiles", myProfile);
          }
        },
        error: () => {},
      });
  }

  getFilteredUsers() {
    if (!this.userSearchQuery()) return this.availableProfiles();
    return this.availableProfiles().filter((p) =>
      `${p.name} ${p.last_name} ${p.user?.email || ""}`
        .toLowerCase()
        .includes(this.userSearchQuery().toLowerCase())
    );
  }

  addProfile(profile: Profile) {
    const currentAssignees = this.form.get("assignees")?.value || [];
    if (!currentAssignees.some((p: Profile) => p.user_id === profile.user_id)) {
      this.form.patchValue({ assignees: [...currentAssignees, profile] });
    }
  }

  removeProfile(profile: Profile) {
    const currentAssignees = this.form.get("assignees")?.value || [];
    this.form.patchValue({
      assignees: currentAssignees.filter((p: Profile) => p.user_id !== profile.user_id),
    });
  }

  getMemberInitialsFromProfile(profile: Profile): string {
    return (profile.name.charAt(0) + profile.last_name.charAt(0)).toUpperCase();
  }

  getSelectedUsersText(): string {
    const assignees = this.form.get("assignees")?.value || [];
    return assignees.map((p: Profile) => `${p.name} ${p.last_name}`).join(", ");
  }

  fetchCategories() {
    const categories = this.storageService.categories();
    if (categories && categories.length > 0) {
      this.availableCategories.set(categories);
    } else {
      // If no categories in storage, fetch from backend
      this.dataSyncProvider
        .crud<Category[]>("getAll", "categories", { filter: { deleted_at: null } }, true)
        .subscribe({
          next: (cats) => {
            if (cats && cats.length > 0) {
              this.availableCategories.set(cats);
              // Also update storage for future use
              this.storageService.setCollection("categories", cats);
            }
          },
          error: () => {
            // Silently handle error
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
            user_id: this.userId(),
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
      const categories = formValue.categories ?? [];
      const assignees = formValue.assignees ?? [];

      // Only send fields that TodoCreateModel expects
      const body = {
        user_id: convertedDates.user_id,
        title: convertedDates.title,
        description: convertedDates.description,
        start_date: convertedDates.start_date,
        end_date: convertedDates.end_date,
        priority: formValue.priority || "medium",
        visibility: formValue.visibility || "private",
        categories: Array.isArray(categories)
          ? categories.map((c: Category) => c?.id).filter(Boolean)
          : [],
        assignees: Array.isArray(assignees)
          ? assignees.map((p: Profile) => p?.user_id).filter(Boolean)
          : [],
        order: formValue.order || 0,
      };

      this.dataSyncProvider
        .crud<Todo>("create", "todos", { data: body, parentTodoId: body.user_id })
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
      const categories = formValue.categories ?? [];
      const assignees = formValue.assignees ?? [];
      const body = {
        ...DateHelper.convertDatesToUtc(DateHelper.normalizeDateFields(formValue)),
        priority: formValue.priority || "medium",
        categories: Array.isArray(categories)
          ? categories.map((c: Category) => c?.id).filter(Boolean)
          : [],
        assignees: Array.isArray(assignees)
          ? assignees.map((p: Profile) => p?.user_id).filter(Boolean)
          : [],
        visibility: formValue.visibility as "private" | "team",
      };

      const newVisibility = formValue.visibility as "private" | "team";
      const visibilityChanged = this.isPrivate !== (newVisibility === "private");
      const todoId = body.id;

      // Determine sync metadata based on ownership
      const isOwner = formValue.user_id === this.userId();
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
                await this.visibilitySyncService.syncSingleTodoVisibilityChange(
                  todoId,
                  newVisibility
                );
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
