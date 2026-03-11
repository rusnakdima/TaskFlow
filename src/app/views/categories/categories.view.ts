/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, effect } from "@angular/core";
import { RouterModule } from "@angular/router";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Category } from "@models/category.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";
import { StorageService } from "@services/storage.service";
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { SearchComponent } from "@components/fields/search/search.component";
import { CategoryFormComponent } from "@components/category-form/category-form.component";
import { CategoryCardComponent } from "@components/category-card/category-card.component";

@Component({
  selector: "app-categories",
  standalone: true,
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
    private storageService: StorageService,
    private dataSyncProvider: DataSyncProvider,
    private notifyService: NotifyService
  ) {
    // Watch for categories data changes and load when data is available
    effect(() => {
      const cats = this.storageService.categories();
      if (cats.length > 0) {
        this.loadCategories();
      }
    });
  }

  // Use storage signals directly for source data
  categories = this.storageService.categories;

  // Separate signals for filtered/sorted display list
  listCategories = signal<Category[]>([]);
  tempListCategories = signal<Category[]>([]);

  userId = signal("");
  showCreateForm = signal(false);
  editingCategory = signal<Category | null>(null);

  ngOnInit(): void {
    this.userId.set(this.authService.getValueByKey("id"));
  }

  loadCategories(): void {
    // Read directly from storage
    const cachedCategories = this.categories();
    if (cachedCategories && cachedCategories.length > 0) {
      this.listCategories.set(cachedCategories);
      this.tempListCategories.set(cachedCategories);
    }
  }

  searchFunc(data: Array<any>) {
    this.listCategories.set(data);
  }

  toggleCreateForm() {
    this.showCreateForm.update((val) => !val);
    this.editingCategory.set(null);
  }

  editCategory(category: Category) {
    this.editingCategory.set(category);
    this.showCreateForm.set(true);
  }

  onFormClose() {
    this.showCreateForm.set(false);
    this.editingCategory.set(null);
  }

  onFormSaved() {
    // No need to reload - storage auto-updates
    this.onFormClose();
  }

  deleteCategory(categoryId: string) {
    if (
      confirm(
        "Are you sure you want to delete this category? This will remove it from all associated todos."
      )
    ) {
      // Optimistic update - remove from storage immediately
      const categoryToRemove = this.storageService.getCategoryById(categoryId);
      if (categoryToRemove) {
        this.storageService.removeItem("category", categoryId);
      }

      this.dataSyncProvider.delete("categories", categoryId).subscribe({
        next: () => {
          this.notifyService.showSuccess("Category deleted successfully");
        },
        error: (err) => {
          // Rollback on error
          if (categoryToRemove) {
            this.storageService.addItem("category", categoryToRemove);
          }
          this.notifyService.showError(err.message || "Failed to delete category");
        },
      });
    }
  }

  cancelEdit() {
    this.toggleCreateForm();
  }
}
