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
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { ShortcutService } from "@services/shortcut.service";
import { FormValidatorService } from "@services/form-validator.service";
import { DateValidatorService } from "@services/date-validator.service";
import { StorageService } from "@services/storage.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* helpers */
import {
  normalizeTodoDates,
  convertDatesToUtc,
  convertDatesFromUtcToLocal,
} from "@helpers/date-conversion.helper";

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
    private formValidator: FormValidatorService,
    private dateValidator: DateValidatorService
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
  }

  userId = signal("");

  form: FormGroup;
  isEdit = signal(false);
  isSubmitting = signal(false);
  isOwner: boolean = false;
  isPrivate: boolean = true;
  today = new Date();

  private saveSubscription: Subscription | null = null;

  dateClass = (date: Date): MatCalendarCellCssClasses => {
    const endDateValue = this.form.get("endDate")?.value;
    if (endDateValue) {
      const endDate = new Date(endDateValue);
      return date.getDate() === endDate.getDate() &&
        date.getMonth() === endDate.getMonth() &&
        date.getFullYear() === endDate.getFullYear()
        ? "end-date-marker"
        : "";
    }
    return "";
  };

  priorityOptions = [
    {
      value: "low",
      label: "Low",
      description: "Non-urgent tasks",
      colorClass: "bg-blue-500",
    },
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
    this.saveSubscription = this.shortcutService.save$.subscribe(() => {
      this.onSubmit();
    });

    this.route.queryParams.subscribe((queryParams: any) => {
      if (queryParams.isPrivate !== undefined) {
        this.isPrivate = queryParams.isPrivate === "true";
      }
    });

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
      if (!this.isEdit()) {
        this.fetchTodosCount();
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    this.saveSubscription?.unsubscribe();
  }

  getTodoInfo(todoId: string) {
    this.dataSyncProvider
      .get<Todo>(
        "todos",
        { id: todoId },
        { isOwner: this.isPrivate ? true : false, isPrivate: this.isPrivate }
      )
      .subscribe({
        next: (todo) => {
          const localDates = convertDatesFromUtcToLocal(todo);
          this.form.patchValue(localDates);

          this.isOwner = todo.userId === this.userId();
          this.isPrivate = todo.visibility === "private";

          if (!this.isPrivate) {
            this.notifyService.showInfo(
              "You're editing a shared todo. Changes will be sent to the owner."
            );
          }
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to load todo");
        },
      });
  }

  back() {
    this.location.back();
  }

  async fetchTodosCount() {
    // Get todos from StorageService cache instead of direct API call
    const todos = this.storageService.todos();
    if (todos && todos.length > 0) {
      this.form.controls["order"].setValue(todos.length);
    } else {
      // Fallback: load from backend if cache is empty
      this.dataSyncProvider
        .getAll<Todo>(
          "todos",
          { userId: this.userId() },
          { isOwner: this.isPrivate ? true : false, isPrivate: this.isPrivate }
        )
        .subscribe({
          next: (todos) => {
            this.form.controls["order"].setValue(todos.length);
          },
          error: (err) => {
            this.isSubmitting.set(false);
            this.notifyService.showError("Failed to get existing todos count");
          },
        });
    }
  }

  async fetchProfiles(): Promise<void> {
    this.dataSyncProvider.getAll<Profile>("profiles", {}).subscribe({
      next: (profiles) => {
        this.availableProfiles.set(profiles);
      },
      error: (err) => {
        this.notifyService.showError(err.message || "Failed to load profiles");
      },
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
    const exists = currentAssignees.some((p: Profile) => p.id === profile.id);
    if (!exists) {
      this.form.patchValue({
        assignees: [...currentAssignees, profile],
      });
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
    // Get categories from StorageService cache instead of direct API call
    const categories = this.storageService.categories();
    if (categories && categories.length > 0) {
      this.availableCategories.set(categories);
    } else {
      // Fallback: load from backend using DataSyncProvider (correct endpoint)
      this.dataSyncProvider.getAll<Category>("categories", { userId: this.userId() }).subscribe({
        next: (cats) => {
          this.availableCategories.set(cats);
          // Update StorageService cache
          this.storageService.setCategories(cats);
        },
        error: (err) => {
          this.notifyService.showError(err.message ?? err.toString());
        },
      });
    }
  }

  getFilteredAvailableCategories() {
    if (!this.newCategoryTitle()) return this.availableCategories();
    return this.availableCategories().filter((category) =>
      category.title.toLowerCase().includes(this.newCategoryTitle().toLowerCase())
    );
  }

  isCategorySelected(category: Category): boolean {
    const currentCategories = this.form.get("categories")?.value || [];
    return currentCategories.some((c: Category) => c.id === category.id);
  }

  toggleCategory(category: Category) {
    const currentCategories = this.form.get("categories")?.value || [];
    const exists = currentCategories.some((c: Category) => c.id === category.id);

    if (exists) {
      this.form.patchValue({
        categories: currentCategories.filter((c: Category) => c.id !== category.id),
      });
    } else {
      this.form.patchValue({
        categories: [...currentCategories, category],
      });
    }
  }

  getSelectedCategoriesText(): string {
    const categories = this.form.get("categories")?.value || [];
    return categories.map((c: Category) => c.title).join(", ");
  }

  addCategory() {
    if (this.newCategoryTitle().trim()) {
      const categoryData: any = {
        title: this.newCategoryTitle().trim(),
        userId: this.userId(),
      };
      this.dataSyncProvider.create<Category>("categories", categoryData).subscribe({
        next: (result) => {
          this.newCategoryTitle.set("");
          this.fetchCategories();
          this.notifyService.showSuccess("Category added successfully");
          // Update StorageService cache
          this.storageService.addCategory(result);
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to add category");
        },
      });
    }
  }

  onSubmit() {
    if (!this.formValidator.validateForm(this.form, this.isSubmitting())) {
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
      const normalizedFormValue = normalizeTodoDates(formValue);
      const convertedDates = convertDatesToUtc(normalizedFormValue);
      const body = {
        ...convertedDates,
        categories: this.form.get("categories")?.value.map((category: Category) => category.id),
        assignees: this.form.get("assignees")?.value.map((p: Profile) => p.id),
      };

      this.isPrivate = body.visibility === "private";

      this.dataSyncProvider
        .create<Todo>("todos", body, { isOwner: true, isPrivate: this.isPrivate })
        .subscribe({
          next: (result: Todo) => {
            // Add the new todo with real ID from backend to cache
            this.storageService.addTodo(result);
            this.isSubmitting.set(false);
            this.notifyService.showSuccess("Todo created successfully");
            this.back();
          },
          error: (err) => {
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
      const normalizedFormValue = normalizeTodoDates(formValue);
      const convertedDates = convertDatesToUtc(normalizedFormValue);
      const body = {
        ...convertedDates,
        categories: this.form.get("categories")?.value.map((category: Category) => category.id),
        assignees: this.form.get("assignees")?.value.map((p: Profile) => p.id),
      };

      const newVisibility = this.form.get("visibility")?.value as "private" | "team";
      const originalVisibility = this.isPrivate ? "private" : "team";
      const visibilityChanged = originalVisibility !== newVisibility;

      // Store previous state for rollback
      const previousTodo = { ...body };

      // Optimistic update: update cache immediately
      this.storageService.updateTodo(body.id, body);

      this.dataSyncProvider
        .update<Todo>("todos", body.id, body, {
          isOwner: true,
          isPrivate: this.isPrivate,
        })
        .subscribe({
          next: async (result) => {
            if (visibilityChanged) {
              try {
                await this.dataSyncProvider.syncAfterVisibilityChange(newVisibility);
              } catch (syncError) {
                console.error("Failed to sync after visibility change:", syncError);
                this.notifyService.showWarning("Todo updated, but sync may not have completed.");
              }
            }
            this.isPrivate = !this.isPrivate;
            this.isSubmitting.set(false);
            this.notifyService.showSuccess("Todo updated successfully");
            setTimeout(() => {
              this.back();
            }, 1000);
          },
          error: (err) => {
            // Rollback on failure
            this.storageService.updateTodo(body.id, previousTodo);
            console.error("Failed to update todo:", err);
            this.isSubmitting.set(false);
            this.notifyService.showError(err.message || "Failed to update todo");
          },
        });
    } else {
      this.isSubmitting.set(false);
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  endDateFilter = (date: Date | null): boolean => {
    return this.dateValidator.createEndDateFilter("startDate", this.form)(date);
  };
}
