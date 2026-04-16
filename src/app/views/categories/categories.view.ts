/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, effect, computed } from "@angular/core";
import { RouterModule } from "@angular/router";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Category } from "@models/category.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { StorageService } from "@services/core/storage.service";
import { ApiProvider } from "@providers/api.provider";

/* components */
import { SearchComponent } from "@components/fields/search/search.component";
import { CategoryFormComponent } from "@components/category-form/category-form.component";
import { CategoryCardComponent } from "@components/category-card/category-card.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

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
    BulkActionsComponent,
    CheckboxComponent,
  ],
  templateUrl: "./categories.view.html",
})
export class CategoriesView implements OnInit {
  constructor(
    private authService: AuthService,
    private storageService: StorageService,
    private dataSyncProvider: ApiProvider,
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

  // Signal for display list - will be synced with categories via effect
  listCategories = signal<Category[]>([]);
  tempListCategories = signal<Category[]>([]);

  private categoriesEffect = effect(() => {
    const cats = this.categories();
    this.listCategories.set(cats);
    this.tempListCategories.set(cats);
  });

  userId = signal("");
  showCreateForm = signal(false);
  editingCategory = signal<Category | null>(null);

  // Bulk selection state
  selectedCategories = signal<Set<string>>(new Set());

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
      this.dataSyncProvider.crud("delete", "categories", { id: categoryId }).subscribe({
        next: () => {
          this.notifyService.showSuccess("Category deleted successfully");
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to delete category");
        },
      });
    }
  }

  cancelEdit() {
    this.toggleCreateForm();
  }

  // Bulk Actions Methods

  /**
   * Toggle selection of a single category
   */
  toggleCategorySelection(categoryId: string): void {
    this.selectedCategories.update((selected) => {
      const next = new Set(selected);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }

  /**
   * Toggle select all categories in current view
   */
  toggleSelectAll(): void {
    if (this.isAllSelected()) {
      this.selectedCategories.set(new Set());
    } else {
      this.selectedCategories.set(new Set(this.listCategories().map((cat) => cat.id)));
    }
  }

  /**
   * Check if all categories are selected
   */
  isAllSelected(): boolean {
    const list = this.listCategories();
    return list.length > 0 && this.selectedCategories().size === list.length;
  }

  /**
   * Bulk delete selected categories
   */
  bulkDelete(): void {
    const selected = this.selectedCategories();
    if (selected.size === 0) return;

    if (confirm(`Are you sure you want to delete ${selected.size} categorie(s)?`)) {
      const deleteRequests = Array.from(selected).map((categoryId) =>
        this.dataSyncProvider.crud("delete", "categories", { id: categoryId })
      );

      Promise.all(deleteRequests)
        .then(() => {
          this.notifyService.showSuccess(`${selected.size} categori(es) deleted successfully`);
          this.clearSelection();
        })
        .catch((err) => {
          this.notifyService.showError(err.message || "Failed to delete categories");
        });
    }
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selectedCategories.set(new Set());
  }
}
