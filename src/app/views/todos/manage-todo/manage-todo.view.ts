/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component, OnDestroy, OnInit, signal } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { Subscription } from "rxjs";

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
import { DataSyncService } from "@services/data/data-sync.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* helpers */
import {
  normalizeDateFields,
  convertDatesToUtc,
  convertDatesFromUtcToLocal,
} from "@helpers/date-conversion.helper";
import { DateHelper } from "@helpers/date.helper";
import { FormValidatorHelper } from "@helpers/form-validator.helper";
import { DateValidatorHelper } from "@helpers/date-validator.helper";

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
  private formValidator: FormValidatorHelper;
  private dateValidator: DateValidatorHelper;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private location: Location,
    private authService: AuthService,
    private storageService: StorageService,
    private notifyService: NotifyService,
    private dataSyncProvider: DataSyncProvider,
    private shortcutService: ShortcutService,
    private dataSyncService: DataSyncService
  ) {
    this.formValidator = new FormValidatorHelper(notifyService);
    this.dateValidator = new DateValidatorHelper(notifyService);
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
    // First, try to get from storage
    const todoFromStorage = this.storageService.getTodoById(todoId);
    if (todoFromStorage) {
      const localDates = convertDatesFromUtcToLocal(todoFromStorage);
      this.form.patchValue(localDates);
      this.isOwner = todoFromStorage.userId === this.userId();
      this.isPrivate = todoFromStorage.visibility === "private";

      // Update form with correct visibility
      this.form.patchValue({ visibility: todoFromStorage.visibility });

      if (!this.isPrivate) {
        this.notifyService.showInfo(
          "You're editing a shared todo. Changes will be sent to the owner."
        );
      }
      return;
    }

    // Fallback to fetch if not in storage
    this.dataSyncProvider.crud<Todo>("get", "todos", { filter: { id: todoId } }).subscribe({
      next: (todo: Todo) => {
        const localDates = convertDatesFromUtcToLocal(todo);
        this.form.patchValue(localDates);
        this.isOwner = todo.userId === this.userId();
        this.isPrivate = todo.visibility === "private";

        // Update form with correct visibility
        this.form.patchValue({ visibility: todo.visibility });

        if (!this.isPrivate)
          this.notifyService.showInfo(
            "You're editing a shared todo. Changes will be sent to the owner."
          );
      },
      error: (err: any) => this.notifyService.showError(err.message || "Failed to load todo"),
    });
  }

  back() {
    this.location.back();
  }

  async fetchTodosCount() {
    const todos = this.storageService.todos();
    if (todos && todos.length > 0) {
      this.form.controls["order"].setValue(todos.length);
    } else {
      this.dataSyncProvider.crud<Todo[]>("getAll", "todos", { filter: { userId: this.userId() } }, true).subscribe({
        next: (todos: Todo[]) => this.form.controls["order"].setValue(todos.length),
        error: () => this.notifyService.showError("Failed to get existing todos count"),
      });
    }
  }

  async fetchProfiles(): Promise<void> {
    this.dataSyncProvider.crud<Profile[]>("getAll", "profiles", { filter: {} }, true).subscribe({
      next: (profiles: Profile[]) => this.availableProfiles.set(profiles),
      error: (err: any) => this.notifyService.showError(err.message || "Failed to load profiles"),
    });
  }

  getFilteredUsers() {
    if (!this.userSearchQuery()) return this.availableProfiles();
    return this.availableProfiles().filter(
      (p) =>
        p.user &&
        `${p.name} ${p.lastName} ${p.user.email}`
          .toLowerCase()
          .includes(this.userSearchQuery().toLowerCase())
    );
  }

  addProfile(profile: Profile) {
    const currentAssignees = this.form.get("assignees")?.value || [];
    if (!currentAssignees.some((p: Profile) => p.id === profile.id)) {
      this.form.patchValue({ assignees: [...currentAssignees, profile] });
    }
  }

  removeProfile(profile: Profile) {
    const currentAssignees = this.form.get("assignees")?.value || [];
    this.form.patchValue({
      assignees: currentAssignees.filter((p: Profile) => p.id !== profile.id),
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
      this.dataSyncProvider.crud<Category[]>("getAll", "categories", { filter: { userId: this.userId() } }, true).subscribe({
        next: (cats: Category[]) => {
          this.availableCategories.set(cats);
          this.storageService.setCategories(cats);
        },
        error: (err) => this.notifyService.showError(err.message ?? err.toString()),
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
            this.notifyService.showSuccess("Category added successfully");
          },
          error: (err: any) => {
            this.notifyService.showError(err.message || "Failed to add category");
          },
        });
    }
  }

  onSubmit() {
    console.log("[ManageTodoView] onSubmit triggered");
    if (!this.formValidator.validateForm(this.form, this.isSubmitting())) {
      console.warn("[ManageTodoView] Form validation failed");
      return;
    }
    this.isSubmitting.set(true);
    if (this.isEdit()) {
      console.log("[ManageTodoView] Updating existing todo");
      this.updateTodo();
    } else {
      console.log("[ManageTodoView] Creating new todo");
      this.createTodo();
    }
  }

  createTodo() {
    console.log("[ManageTodoView] createTodo started");
    if (this.form.valid) {
      const formValue = this.form.value;
      const normalizedFormValue = normalizeDateFields(formValue);
      const convertedDates = convertDatesToUtc(normalizedFormValue);

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
        assignees: formValue.assignees.map((p: Profile) => p.userId), // Send user ID, not profile ID
        order: formValue.order || 0,
      };

      console.log('[ManageTodoView] Calling dataSyncProvider.crud("create", "todos")');
      // Sync with backend
      this.dataSyncProvider.crud<Todo>("create", "todos", { data: body, parentTodoId: body.userId }).subscribe({
        next: (result: Todo) => {
          console.log("[ManageTodoView] Todo created successfully by backend:", result);

          // ✅ Navigate back AFTER successful creation
          this.isSubmitting.set(false);
          this.notifyService.showSuccess("Todo created successfully");
          this.back();
        },
        error: (err: any) => {
          console.error("[ManageTodoView] Failed to create todo:", err);
          this.isSubmitting.set(false);
          this.notifyService.showError(err.message || "Failed to create todo");
        },
      });
    } else {
      console.warn("[ManageTodoView] Form is invalid");
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  async updateTodo() {
    console.log("[ManageTodoView] updateTodo started");
    if (this.form.valid) {
      const formValue = this.form.value;
      const body = {
        ...convertDatesToUtc(normalizeDateFields(formValue)),
        priority: formValue.priority || "medium",
        categories: formValue.categories.map((c: Category) => c.id),
        assignees: formValue.assignees.map((p: Profile) => p.userId), // Send user ID, not profile ID
        visibility: formValue.visibility as "private" | "team", // Ensure visibility is included
      };

      console.log("[ManageTodoView] Update todo body:", body);

      const newVisibility = formValue.visibility as "private" | "team";
      const visibilityChanged = this.isPrivate !== (newVisibility === "private");

      // Determine sync metadata based on visibility and ownership
      const isPrivate = newVisibility === "private";
      const isOwner = formValue.userId === this.userId();
      const syncMetadata = { isOwner, isPrivate };

      console.log('[ManageTodoView] Calling dataSyncProvider.crud("update", "todos")');
      // Update todo via DataSyncProvider (storage updated automatically)
      this.dataSyncProvider.crud<Todo>("update", "todos", { id: body.id, data: body, parentTodoId: body.id, ...syncMetadata })
        .subscribe({
          next: async (result: Todo) => {
            console.log("[ManageTodoView] Todo updated successfully:", result);
            // Handle visibility change if needed
            if (visibilityChanged) {
              console.log("[ManageTodoView] Visibility changed, syncing...");
              try {
                await this.dataSyncProvider.syncAfterVisibilityChange(newVisibility);
                // After sync, reload data to ensure consistency
                this.dataSyncService.loadAllData(true).subscribe();
              } catch (err) {
                console.error("[ManageTodoView] Visibility sync failed:", err);
                this.notifyService.showWarning("Todo updated, but sync may not have completed.");
              }
            }
            this.isPrivate = newVisibility === "private";
            this.isSubmitting.set(false);
            this.notifyService.showSuccess("Todo updated successfully");
            setTimeout(() => this.back(), 1000);
          },
          error: (err) => {
            console.error("[ManageTodoView] Failed to update todo:", err);
            this.isSubmitting.set(false);
            this.notifyService.showError(err.message || "Failed to update todo");
          },
        });
    } else {
      console.warn("[ManageTodoView] Form is invalid");
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  endDateFilter = (date: Date | null): boolean =>
    this.dateValidator.createEndDateFilter("startDate", this.form)(date);
}
