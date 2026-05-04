/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, computed, inject } from "@angular/core";
import { RouterModule } from "@angular/router";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatButtonModule } from "@angular/material/button";

/* models */
import { Category } from "@models/category.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { StorageService } from "@services/core/storage.service";
import { ApiProvider } from "@providers/api.provider";
import { DataLoaderService } from "@services/data/data-loader.service";

/* views */
import { BaseListView } from "@views/base-list.view";

/* components */
import { CategoryFormComponent } from "@components/category-form/category-form.component";
import { CategoryCardComponent } from "@components/category-card/category-card.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { TableViewComponent } from "@components/table-view/table-view.component";
import { ViewModeSwitcherComponent } from "@components/view-mode-switcher/view-mode-switcher.component";
import { TableField } from "@components/table-view/table-field.model";

@Component({
  selector: "app-categories",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    MatMenuModule,
    MatButtonModule,
    CategoryFormComponent,
    CategoryCardComponent,
    BulkActionsComponent,
    CheckboxComponent,
    TableViewComponent,
    ViewModeSwitcherComponent,
  ],
  templateUrl: "./categories.view.html",
})
export class CategoriesView extends BaseListView implements OnInit {
  private storageService = inject(StorageService);
  private dataSyncProvider = inject(ApiProvider);
  private dataLoaderService = inject(DataLoaderService);

  categories = this.storageService.categories;

  searchResults = computed(() => {
    let cats = this.categories();
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      cats = cats.filter((cat) => cat.title.toLowerCase().includes(query));
    }
    const order = this.sortOrder();
    const by = this.sortBy();
    return [...cats].sort((a, b) => {
      let comparison = 0;
      if (by === "title") {
        comparison = (a.title || "").localeCompare(b.title || "");
      } else if (by === "createdAt") {
        comparison = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      } else if (by === "updatedAt") {
        comparison = new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime();
      }
      return order === "asc" ? comparison : -comparison;
    });
  });

  userId = signal("");
  showCreateForm = signal(false);
  editingCategory = signal<Category | null>(null);
  sortBy = signal<"title" | "createdAt" | "updatedAt">("createdAt");
  sortOrder = signal<"asc" | "desc">("desc");

  selectedCategories = this.selectedItems;

  categoryTableFields: TableField[] = [
    {
      key: "title",
      label: "Title",
      sortable: true,
      type: "text",
    },
    {
      key: "created_at",
      label: "Created",
      sortable: true,
      type: "date",
    },
    {
      key: "updated_at",
      label: "Updated",
      sortable: true,
      type: "date",
    },
  ];

  override ngOnInit(): void {
    super.ngOnInit();

    this.userId.set(this.authService.getValueByKey("id"));
    this.pageKey = "categories";
    this.viewMode.set(this.loadViewModePreference());

    this.subscriptions.add(
      this.shortcutService.createCategory$.subscribe(() => {
        this.toggleCreateForm();
      })
    );
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
          this.searchQuery.set("");
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

  override toggleSelectAll(): void {
    super.toggleSelectAll(
      () => this.searchResults(),
      () => this.isAllSelected()
    );
  }

  override isAllSelected(): boolean {
    return super.isAllSelected(() => this.searchResults());
  }

  bulkArchive(): void {
    const selected = this.selectedCategories();
    if (selected.size === 0) return;

    if (confirm(`Are you sure you want to archive ${selected.size} categorie(s)?`)) {
      const archiveRequests = Array.from(selected).map((categoryId) =>
        firstValueFrom(this.dataSyncProvider.crud("delete", "categories", { id: categoryId }))
      );

      Promise.all(archiveRequests)
        .then(() => {
          this.notifyService.showSuccess(`${selected.size} categori(es) archived successfully`);
          this.clearSelection();
          this.searchQuery.set("");
        })
        .catch((err) => {
          this.notifyService.showError(err.message || "Failed to archive categories");
        });
    }
  }

  override clearSelection(): void {
    super.clearSelection();
  }

  onRowClick(category: Category): void {
    this.editCategory(category);
  }

  onTableAction(event: { action: string; item: Category }): void {
    const { action, item } = event;
    if (action === "edit") {
      this.editCategory(item);
    } else if (action === "delete") {
      this.deleteCategory(item.id);
    }
  }

  onTableSelectAll(): void {
    this.toggleSelectAll();
  }
}
