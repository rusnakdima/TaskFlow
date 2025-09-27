/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { RouterModule } from "@angular/router";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { Category } from "@models/category";

/* services */
import { AuthService } from "@services/auth.service";
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";

/* components */
import { SearchComponent } from "@components/fields/search/search.component";
import { CategoryFormComponent } from "@components/category-form/category-form.component";
import { CategoryCardComponent } from "@components/category-card/category-card.component";

@Component({
  selector: "app-categories",
  standalone: true,
  providers: [MainService],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    SearchComponent,
    CategoryFormComponent,
    CategoryCardComponent,
  ],
  templateUrl: "./categories.view.html",
})
export class CategoriesView implements OnInit {
  constructor(
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService
  ) {}

  listCategories: Array<Category> = [];
  tempListCategories: Array<Category> = [];

  userId: string = "";
  showCreateForm: boolean = false;
  editingCategory: Category | null = null;

  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");
    this.loadCategories();
  }

  loadCategories(): void {
    if (this.userId && this.userId != "") {
      this.mainService
        .getAllByField<Array<Category>>("category", "userId", this.userId)
        .then((response: Response<Array<Category>>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.tempListCategories = response.data;
            this.listCategories = [...this.tempListCategories];
          } else {
            this.notifyService.showError(response.message);
          }
        })
        .catch((err: Response<string>) => {
          this.notifyService.showError(err.message);
        });
    }
  }

  searchFunc(data: Array<any>) {
    this.listCategories = data;
  }

  toggleCreateForm() {
    this.showCreateForm = !this.showCreateForm;
    this.editingCategory = null;
  }

  editCategory(category: Category) {
    this.editingCategory = category;
    this.showCreateForm = true;
  }

  onFormClose() {
    this.showCreateForm = false;
    this.editingCategory = null;
  }

  onFormSaved() {
    this.loadCategories();
    this.onFormClose();
  }

  deleteCategory(categoryId: string) {
    if (
      confirm(
        "Are you sure you want to delete this category? This will remove it from all associated todos."
      )
    ) {
      this.mainService
        .delete<string>("category", categoryId)
        .then((response: Response<string>) => {
          this.notifyService.showNotify(response.status, response.message);
          if (response.status === ResponseStatus.SUCCESS) {
            this.loadCategories();
          }
        })
        .catch((err: Response<string>) => {
          this.notifyService.showError(err.message);
        });
    }
  }

  cancelEdit() {
    this.toggleCreateForm();
  }
}
