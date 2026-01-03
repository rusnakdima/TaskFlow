/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";
import { MatRadioModule } from "@angular/material/radio";
import { MatMenuModule } from "@angular/material/menu";
import { MatButtonModule } from "@angular/material/button";
import { MatDividerModule } from "@angular/material/divider";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { Todo } from "@models/todo.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";

/* services */
import { AuthService } from "@services/auth.service";
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";

/* helpers */
import { normalizeTodoDates } from "@helpers/date-conversion.helper";

@Component({
  selector: "app-manage-todo",
  standalone: true,
  providers: [AuthService, MainService],
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
    MatButtonModule,
    MatDividerModule,
  ],
  templateUrl: "./manage-todo.view.html",
})
export class ManageTodoView implements OnInit {
  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private location: Location,
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService
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

  userId: string = "";

  form: FormGroup;
  isEdit: boolean = false;
  isSubmitting: boolean = false;

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

  availableProfiles: Profile[] = [];
  localTeamMembers: Profile[] = [];
  userSearchQuery: string = "";

  availableCategories: Category[] = [];
  newCategoryTitle: string = "";

  async ngOnInit() {
    this.userId = this.authService.getValueByKey("id");
    if (this.userId && this.userId != "") {
      this.form.controls["userId"].setValue(this.userId);
      await this.fetchProfiles();
      this.fetchCategories();
    }
    this.route.params.subscribe((params: any) => {
      if (params.todoId) {
        this.getTodoInfo(params.todoId);
        this.isEdit = true;
      }
    });

    setTimeout(() => {
      if (!this.isEdit) {
        this.fetchTodosCount();
      }
    }, 1000);
  }

  getTodoInfo(todoId: string) {
    this.mainService
      .getByField<Todo>("todo", "id", todoId)
      .then((response: Response<Todo>) => {
        if (response.status == ResponseStatus.SUCCESS) {
          const todo = response.data;
          this.form.patchValue(todo);
          if (this.form.get("assignees")?.value.length > 0) {
            this.form.get("visibility")?.setValue("team");
          }
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message ?? err.toString());
      });
  }

  back() {
    this.location.back();
  }

  async fetchTodosCount() {
    this.mainService
      .getAllByField<Todo[]>("todo", "userId", this.userId)
      .then((response: Response<Todo[]>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.form.controls["order"].setValue(response.data.length + 1);
        } else {
          this.isSubmitting = false;
          this.notifyService.showError("Failed to get existing todos count");
        }
      })
      .catch((err: Response<string>) => {
        this.isSubmitting = false;
        this.notifyService.showError(err.message ?? err.toString());
      });
  }

  async fetchProfiles(): Promise<void> {
    return this.mainService
      .getAllByField<Profile[]>("profile")
      .then((response: Response<Profile[]>) => {
        if (response.status == ResponseStatus.SUCCESS) {
          this.availableProfiles = response.data;
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message ?? err.toString());
      });
  }

  getFilteredUsers() {
    if (!this.userSearchQuery) return this.availableProfiles;
    return this.availableProfiles.filter((p) =>
      `${p.name} ${p.lastName} ${p.user.email}`
        .toLowerCase()
        .includes(this.userSearchQuery.toLowerCase())
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
    this.mainService
      .getAllByField<Category[]>("category", "userId", this.userId)
      .then((response: Response<Category[]>) => {
        if (response.status == ResponseStatus.SUCCESS) {
          this.availableCategories = response.data;
        }
      })
      .catch((err: Response<string>) => {
        this.notifyService.showError(err.message ?? err.toString());
      });
  }

  getFilteredAvailableCategories() {
    if (!this.newCategoryTitle) return this.availableCategories;
    return this.availableCategories.filter((category) =>
      category.title.toLowerCase().includes(this.newCategoryTitle.toLowerCase())
    );
  }

  addCategory() {
    if (this.newCategoryTitle.trim()) {
      const categoryData: any = {
        title: this.newCategoryTitle.trim(),
        userId: this.userId,
      };
      this.mainService
        .create<string, Category>("category", categoryData)
        .then((response: Response<string>) => {
          if (response.status == ResponseStatus.SUCCESS) {
            this.newCategoryTitle = "";
            this.fetchCategories();
            this.notifyService.showNotify(response.status, "Category added successfully");
          }
        })
        .catch((err: Response<string>) => {
          this.notifyService.showError(err.message ?? err.toString());
        });
    }
  }

  selectCategory(category: Category) {
    const currentCategories = this.form.get("categories")?.value || [];
    const exists = currentCategories.some((c: Category) => c.id === category.id);
    if (!exists) {
      this.form.patchValue({
        categories: [...currentCategories, category],
      });
    }
  }

  removeCategory(category: Category) {
    const currentCategories = this.form.get("categories")?.value || [];
    this.form.patchValue({
      categories: currentCategories.filter((c: Category) => c.id !== category.id),
    });
  }

  getSelectedCategoriesText(): string {
    const categories = this.form.get("categories")?.value || [];
    return categories.map((c: Category) => c.title).join(", ");
  }

  onSubmit() {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((control) => {
        control.markAsTouched();
      });
      this.notifyService.showError("Please fill in all required fields");
      return;
    }

    if (this.form.valid) {
      this.isSubmitting = true;
      if (this.isEdit) {
        this.updateTask();
      } else {
        this.createTask();
      }
    }
  }

  createTask() {
    if (this.form.valid) {
      const formValue = this.form.value;
      const normalizedFormValue = normalizeTodoDates(formValue);
      const body = {
        ...normalizedFormValue,
        categories: this.form.get("categories")?.value.map((category: Category) => category.id),
        assignees: this.form.get("assignees")?.value.map((p: Profile) => p.id),
        deadline: this.form.value.deadline ? new Date(this.form.value.deadline) : "",
      };

      this.mainService
        .create<string, Todo>("todo", body)
        .then((response: Response<string>) => {
          this.isSubmitting = false;
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            this.back();
          }
        })
        .catch((err: Response<string>) => {
          this.isSubmitting = false;
          this.notifyService.showError(err.message ?? err.toString());
        });
    } else {
      this.isSubmitting = false;
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }

  updateTask() {
    if (this.form.valid) {
      const formValue = this.form.value;
      const normalizedFormValue = normalizeTodoDates(formValue);
      const body = {
        ...normalizedFormValue,
        categories: this.form.get("categories")?.value.map((category: Category) => category.id),
        assignees: this.form.get("assignees")?.value.map((p: Profile) => p.id),
      };

      this.mainService
        .update<string, Todo>("todo", body.id, body)
        .then((response: Response<string>) => {
          this.isSubmitting = false;
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            this.back();
          }
        })
        .catch((err: Response<string>) => {
          this.isSubmitting = false;
          this.notifyService.showError(err.message ?? err.toString());
        });
    } else {
      this.isSubmitting = false;
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
