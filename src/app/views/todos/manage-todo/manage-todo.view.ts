/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component, OnDestroy, OnInit, signal, ChangeDetectorRef, computed } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { Subscription, Observable, of } from "rxjs";
import { map } from "rxjs/operators";

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

interface TodoCreateForm {
  id?: string;
  user_id: string;
  title: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  priority: string;
  visibility: string;
  categories: Category[];
  assignees: Profile[];
  order: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null | boolean;
}

interface RouteParams {
  todoId?: string;
}

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ShortcutService } from "@services/ui/shortcut.service";
import { StorageService } from "@services/core/storage.service";

import { RelationLoadingService } from "@services/core/relation-loading.service";
import { VisibilitySyncService } from "@services/core/visibility-sync.service";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* helpers */
import { DateHelper } from "@helpers/date.helper";

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

  availableProfiles = computed(() => this.storageService.profiles());
  localTeamMembers = signal<Profile[]>([]);
  userSearchQuery = signal("");

  availableCategories = signal<Category[]>([]);
  newCategoryTitle = signal("");
  isCategoryListExpanded = signal(false);
  selectedCategories = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.saveSubscription = this.shortcutService.save$.subscribe(() => this.onSubmit());
    this.userId.set(this.authService.getValueByKey("id"));

    if (this.userId() && this.userId() !== "") {
      this.form.controls["user_id"].setValue(this.userId());
      this.fetchCategories();
    }

    this.route.params.subscribe((params: RouteParams) => {
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
    const todo = this.storageService.getById("todos", todoId) as Todo | undefined;
    if (todo) {
      this.applyTodoToForm(todo);
    } else {
      this.loadTodoFromApi(todoId);
    }
  }

  private loadTodoFromApi(todoId: string): void {
    const syncMetadata = { is_owner: true, is_private: false };

    this.relationLoader
      .load<Todo>(
        this.dataSyncProvider,
        "todos",
        todoId,
        [
          "user",
          "categories",
          "tasks",
          "tasks.subtasks",
          "tasks.subtasks.comments",
          "tasks.comments",
          "assignees",
        ],
        syncMetadata
      )
      .subscribe({
        next: (todo: Todo) => {
          this.storageService.updateItem("todos", todo.id, todo);
          this.applyTodoToForm(todo);
        },
        error: (err: Error) => this.notifyService.showError(err.message || "Failed to load todo"),
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

    const formValues: TodoCreateForm = {
      ...localDates,
      visibility: todo.visibility,
      assignees: [],
      categories: categoriesFormValue,
    } as TodoCreateForm;

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
   * Resolve assignees to Profile objects from storage only
   */
  private resolveAssigneesToProfiles(assignees: string[]): Observable<Profile[]> {
    const userIds = assignees.filter((a) => typeof a === "string") as string[];
    if (userIds.length === 0) {
      return of([]);
    }

    const allProfiles = this.storageService.profiles();
    const matched = allProfiles.filter((p: Profile) => userIds.includes(p.user_id));
    return of(matched);
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

  getFilteredUsers() {
    if (!this.userSearchQuery()) return this.availableProfiles();
    return this.availableProfiles().filter((p: Profile) =>
      `${p.name} ${p.last_name}`.toLowerCase().includes(this.userSearchQuery().toLowerCase())
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
        .crud<Category[]>("getAll", "categories", { filter: { deleted_at: null } })
        .subscribe({
          next: (cats) => {
            if (cats && cats.length > 0) {
              this.availableCategories.set(cats);
              // Also update storage for future use
              this.storageService.setCollection("categories", cats);
            }
          },
          error: (err: any) => {
            this.notifyService.showError(err.message || "Failed to load categories");
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
      const categoryData = {
        title: title,
        user_id: this.userId(),
      };

      this.newCategoryTitle.set("");

      // Sync with backend
      this.dataSyncProvider
        .crud<Category>("create", "categories", {
          data: categoryData,
        })
        .subscribe({
          next: (result: Category) => {
            this.storageService.addItem("categories", result);
            this.fetchCategories();
            this.notifyService.showSuccess("Category added successfully");
          },
          error: (err: Error) => {
            this.notifyService.showError(err.message || "Failed to add category");
          },
        });
    }
  }

  onSubmit() {
    if (!DateHelper.validateForm(this.form, this.notifyService, this.isSubmitting())) {
      return;
    }
    this.isSubmitting.set(true);
    if (this.isEdit()) {
      this.updateTodo();
    } else {
      this.createTodo();
    }
  }

  toggleSelectAllCategories(): void {
    const allIds = this.availableCategories().map((c) => c.id);
    const selected = this.selectedCategories();
    if (selected.size === allIds.length) {
      this.selectedCategories.set(new Set());
    } else {
      this.selectedCategories.set(new Set(allIds));
    }
  }

  toggleCategorySelection(categoryId: string): void {
    const selected = this.selectedCategories();
    if (selected.has(categoryId)) {
      selected.delete(categoryId);
    } else {
      selected.add(categoryId);
    }
    this.selectedCategories.set(new Set(selected));
  }

  isAllCategoriesSelected = computed(() => {
    const allIds = this.availableCategories().map((c) => c.id);
    return allIds.length > 0 && this.selectedCategories().size === allIds.length;
  });

  isCategorySelectedById(categoryId: string): boolean {
    return this.selectedCategories().has(categoryId);
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

      const isPrivate = body.visibility !== "team";

      this.dataSyncProvider
        .crud<Todo>("create", "todos", {
          data: body,
          parentTodoId: body.user_id,
          isOwner: true,
          isPrivate,
        })
        .subscribe({
          next: (result: Todo) => {
            this.isSubmitting.set(false);
            this.notifyService.showSuccess("Todo created successfully");
            this.back();
          },
          error: (err: Error) => {
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
      const normalizedFormValue = DateHelper.normalizeDateFields(formValue);
      const convertedDates = DateHelper.convertDatesToUtc(normalizedFormValue);

      const body = {
        id: formValue.id,
        user_id: convertedDates.user_id,
        title: convertedDates.title,
        description: convertedDates.description,
        start_date: convertedDates.start_date || "",
        end_date: convertedDates.end_date || "",
        priority: formValue.priority || "medium",
        categories: Array.isArray(categories)
          ? categories.map((c: Category) => c?.id).filter(Boolean)
          : [],
        assignees: Array.isArray(assignees)
          ? assignees.map((p: Profile) => p?.user_id).filter(Boolean)
          : [],
        visibility: formValue.visibility as "private" | "team",
        order: convertedDates.order || 0,
      };

      const newVisibility = formValue.visibility as "private" | "team";
      const visibilityChanged = this.isPrivate !== (newVisibility === "private");
      const todoId = body.id;
      const isOwner = formValue.user_id === this.userId();
      const isPrivate = newVisibility === "private";

      // ✅ MongoDB sync FIRST - update local storage only on success
      this.dataSyncProvider
        .crud<Todo>("update", "todos", {
          id: body.id,
          data: body,
          parentTodoId: body.id,
          isOwner,
          isPrivate,
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
    DateHelper.createEndDateFilter("startDate", this.form)(date);
}
