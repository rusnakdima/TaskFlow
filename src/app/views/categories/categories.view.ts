/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, computed, inject } from "@angular/core";
import { RouterModule } from "@angular/router";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { firstValueFrom, Observable } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatButtonModule } from "@angular/material/button";

/* models */
import { Category } from "@models/category.model";
import { ResponseStatus } from "@models/response.model";
import { TableField, TableFieldActionButton } from "@models/table-field.model";
import { TABLE_ACTIONS } from "@constants/table-field.constants";

/* services */
import { REQUEST_SERVICE } from "@services/api.service";
import { AdminService } from "@services/data/admin.service";
import { ConfirmDialogService } from "@services/core/confirm-dialog.service";
import { RelationLoadingService } from "@services/core/relation-loading.service";

/* views */
import { BaseListView } from "@views/base-list.view";

/* helpers */
import { compareByTimestamp } from "@helpers/array.helper";

/* components */
import { CategoryFormComponent } from "@components/category-form/category-form.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { TableViewComponent } from "@components/table-view/table-view.component";
import { ItemCardComponent } from "@components/item-card/item-card.component";
import { ItemExpandDetailsComponent } from "@components/item-expand-details/item-expand-details.component";
import {
  PageToolbarComponent,
  PageToolbarConfig,
} from "@components/page-toolbar/page-toolbar.component";
import { CATEGORY_CARD_CONFIG, CATEGORY_TABLE_CONFIG } from "@constants/item-display.constants";

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
    BulkActionsComponent,
    TableViewComponent,
    ItemCardComponent,
    ItemExpandDetailsComponent,
    PageToolbarComponent,
  ],
  templateUrl: "./categories.view.html",
})
export class CategoriesView extends BaseListView implements OnInit {
  private adminService = inject(AdminService);
  private confirmDialogService = inject(ConfirmDialogService);
  private requestService = inject(REQUEST_SERVICE);
  private relationLoadingService = inject(RelationLoadingService);

  protected getItems(): { id: string }[] {
    return this.searchResults();
  }

  protected get selectedCategories() {
    return this.selectedItems;
  }

  searchResults = computed(() => {
    let cats = this.storageService.categories();
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
        comparison = compareByTimestamp(a, b);
      } else if (by === "updatedAt") {
        comparison = compareByTimestamp(a, b);
      }
      return order === "asc" ? comparison : -comparison;
    });
  });

  userId = signal("");
  showCreateForm = signal(false);
  editingCategory = signal<Category | null>(null);
  sortBy = signal<"title" | "createdAt" | "updatedAt">("createdAt");
  sortOrder = signal<"asc" | "desc">("desc");

  categoryCardConfig = CATEGORY_CARD_CONFIG;
  categoryTableConfig = CATEGORY_TABLE_CONFIG;
  categoryActions = [TABLE_ACTIONS.EDIT, TABLE_ACTIONS.ARCHIVE];

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

    this.requestService
      .loadPage("categories", { visibility: "private", limit: 50, skip: 0 })
      .subscribe();
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

  onCategoryExpand(item: Category): Observable<any> {
    return this.relationLoadingService.load<Category>("categories", item.id, ["user"]);
  }

  async archiveCategory(categoryId: string) {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Archive Category",
      message:
        "Are you sure you want to archive this category? This will remove it from all associated todos.",
      confirmText: "Archive",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
    });
    if (confirmed) {
      try {
        const response = await this.adminService.toggleDeleteStatusLocal("categories", categoryId);
        if (response.status === ResponseStatus.SUCCESS) {
          this.notifyService.showSuccess("Category archived successfully");
          this.requestService
            .loadPage("categories", { visibility: "private", limit: 50, skip: 0 })
            .subscribe();
          this.searchQuery.set("");
        } else {
          this.notifyService.showError(response.message || "Failed to archive category");
        }
      } catch (err: any) {
        this.notifyService.showError(err.message || "Failed to archive category");
      }
    }
  }

  deleteCategory(categoryId: string) {
    this.archiveCategory(categoryId);
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

  async bulkArchive(): Promise<void> {
    const selected = this.selectedCategories();
    if (selected.size === 0) return;

    const confirmed = await this.confirmDialogService.confirm({
      title: "Archive Categories",
      message: `Are you sure you want to archive ${selected.size} categorie(s)?`,
      confirmText: "Archive All",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
    });
    if (confirmed) {
      const archiveRequests = Array.from(selected).map((categoryId) =>
        firstValueFrom(this.requestService.get<Category>("categories", categoryId))
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

  onRowClick(category: Category): void {
    this.editCategory(category);
  }

  onTableAction(event: { action: string; item: Category }): void {
    const { action, item } = event;
    if (action === "edit") {
      this.editCategory(item);
    } else if (action === "archive") {
      this.archiveCategory(item.id);
    }
  }

  getCategoryTableActions(): TableFieldActionButton[] {
    return [TABLE_ACTIONS.EDIT, TABLE_ACTIONS.ARCHIVE];
  }

  onTableSelectAll(selectAll: boolean): void {
    this.selectedItems.update((categoryIds) => {
      const newSelected = new Set(categoryIds);
      const items = this.getItems();
      if (selectAll) {
        items.forEach((category) => newSelected.add(category.id));
      } else {
        items.forEach((category) => newSelected.delete(category.id));
      }
      return newSelected;
    });
  }

  getToolbarConfig(): PageToolbarConfig {
    return {
      sortMenu: {
        sortBy: this.sortBy(),
        sortOrder: this.sortOrder(),
        sortOptions: [
          { key: "createdAt", label: "Created Date", icon: "schedule" },
          { key: "updatedAt", label: "Updated Date", icon: "update" },
          { key: "title", label: "Title", icon: "sort_by_alpha" },
        ],
        onSort: (key) => {
          this.sortBy.set(key as "title" | "createdAt" | "updatedAt");
          this.sortOrder.set("desc");
        },
      },
      sortOrder: {
        onToggle: () => this.sortOrder.set(this.sortOrder() === "asc" ? "desc" : "asc"),
        currentOrder: this.sortOrder(),
      },
      newButton: {
        onClick: () => this.toggleCreateForm(),
        label: "New Category",
        icon: "add",
      },
      search: {
        query: this.searchQuery(),
        placeholder: "Search categories...",
        onSearch: (query) => this.onSearch(query),
      },
      viewMode: {
        mode: this.viewMode(),
        pageKey: "categories",
        onModeChange: (mode) => this.setViewMode(mode),
      },
    };
  }

  onSearch(query: string): void {
    this.searchQuery.set(query);
  }

  onCardClick(event: { event: MouseEvent; id: string }): void {
    if (event.event.shiftKey) {
      const anchorId = this.lastSelectedId();
      if (anchorId) {
        this.selectRange(anchorId, event.id, this.searchResults());
        return;
      }
    } else if (event.event.ctrlKey || event.event.metaKey) {
      this.toggleItemSelection(event.id);
      this.lastSelectedId.set(event.id);
      return;
    }
  }

  onCategoryAction(event: { action: string; item: Category }): void {
    switch (event.action) {
      case "edit":
        this.editCategory(event.item);
        break;
      case "archive":
        this.archiveCategory(event.item.id);
        break;
      case "delete":
        this.deleteCategory(event.item.id);
        break;
    }
  }
}
