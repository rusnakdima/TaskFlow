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
import { Subscription, firstValueFrom } from "rxjs";

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
import { DataSyncService } from "@services/data-sync.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* helpers */
import {
  normalizeEntityDates,
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
    private dateValidator: DateValidatorService,
    private dataSyncService: DataSyncService
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
    this.dataSyncProvider.get<Todo>("todos", { id: todoId }).subscribe({
      next: (todo) => {
        const localDates = convertDatesFromUtcToLocal(todo);
        this.form.patchValue(localDates);
        this.isOwner = todo.userId === this.userId();
        this.isPrivate = todo.visibility === "private";
        if (!this.isPrivate)
          this.notifyService.showInfo(
            "You're editing a shared todo. Changes will be sent to the owner."
          );
      },
      error: (err) => this.notifyService.showError(err.message || "Failed to load todo"),
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
      this.dataSyncProvider.getAll<Todo>("todos", { userId: this.userId() }).subscribe({
        next: (todos) => this.form.controls["order"].setValue(todos.length),
        error: () => this.notifyService.showError("Failed to get existing todos count"),
      });
    }
  }

  async fetchProfiles(): Promise<void> {
    this.dataSyncProvider.getAll<Profile>("profiles", {}).subscribe({
      next: (profiles) => this.availableProfiles.set(profiles),
      error: (err) => this.notifyService.showError(err.message || "Failed to load profiles"),
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
      this.dataSyncProvider.getAll<Category>("categories", { userId: this.userId() }).subscribe({
        next: (cats) => {
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
      this.dataSyncProvider
        .create<Category>("categories", {
          title: this.newCategoryTitle().trim(),
          userId: this.userId(),
        })
        .subscribe({
          next: (result: Category) => {
            this.newCategoryTitle.set("");
            this.fetchCategories();
            this.notifyService.showSuccess("Category added successfully");
            // Manually add to storage
            this.storageService.addItem("category", result);
          },
          error: (err) => this.notifyService.showError(err.message || "Failed to add category"),
        });
    }
  }

  onSubmit() {
    if (!this.formValidator.validateForm(this.form, this.isSubmitting())) return;
    this.isSubmitting.set(true);
    if (this.isEdit()) this.updateTodo();
    else this.createTodo();
  }

  createTodo() {
    if (this.form.valid) {
      const formValue = this.form.value;
      const body = {
        ...convertDatesToUtc(normalizeEntityDates(formValue)),
        priority: formValue.priority || "medium",
        categories: formValue.categories.map((c: Category) => c.id),
        assignees: formValue.assignees.map((p: Profile) => p.userId), // Send user ID, not profile ID
      };
      this.dataSyncProvider.create<Todo>("todos", body, undefined, body.id).subscribe({
        next: (result: Todo) => {
          // Manually add to storage
          this.storageService.addItem("todo", result);
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
      const body = {
        ...convertDatesToUtc(normalizeEntityDates(formValue)),
        priority: formValue.priority || "medium",
        categories: formValue.categories.map((c: Category) => c.id),
        assignees: formValue.assignees.map((p: Profile) => p.userId), // Send user ID, not profile ID
      };

      const newVisibility = formValue.visibility as "private" | "team";
      const visibilityChanged = (this.isPrivate ? "private" : "team") !== newVisibility;

      // Determine sync metadata based on visibility
      const isPrivate = newVisibility === "private";
      const syncMetadata = { isOwner: true, isPrivate };

      this.dataSyncProvider.update<Todo>("todos", body.id, body, syncMetadata, body.id).subscribe({
        next: async (result: Todo) => {
          // Update storage with visibility change handling
          this.storageService.updateItem("todo", result.id, result);

          if (visibilityChanged) {
            try {
              await this.dataSyncProvider.syncAfterVisibilityChange(newVisibility);
              // After sync, reload data to ensure consistency
              this.dataSyncService.loadAllData(true).subscribe();
            } catch (err) {
              console.error("Sync failed:", err);
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
    this.dateValidator.createEndDateFilter("startDate", this.form)(date);
}
