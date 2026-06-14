/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, signal, computed, inject, OnInit } from "@angular/core";
import { RouterModule, ActivatedRoute } from "@angular/router";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { Observable } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatButtonModule } from "@angular/material/button";

/* models */
import { Category } from "@models/generated/api.types";
import { ResponseStatus } from "@models/response.model";
import { TableField, TableFieldActionButton } from "@models/table-field.model";
import { TABLE_ACTIONS } from "@shared/utils/constants";
import { StorageTarget } from "@models/entity-config.model";
import {
  SegmentSelectorComponent,
  SegmentOption,
} from "@components/segment-selector/segment-selector.component";

/* services */
import { AdminService } from "@services/data/admin.service";
import { ConfirmDialogService } from "@services/core/confirm-dialog.service";
import { RelationLoadingService } from "@services/core/relation-loading.service";
import { SearchService } from "@services/core/search.service";
import { EntityStoreService } from "@services/core/entity-store.service";
import { ApiService } from "@services/api.service";
import { TauriApiService } from "@app/api/tauri-api.service";

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
import { CATEGORY_CARD_CONFIG, CATEGORY_TABLE_CONFIG } from "@shared/utils/constants";

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
    BulkActionsComponent,
    TableViewComponent,
    ItemCardComponent,
    ItemExpandDetailsComponent,
    PageToolbarComponent,
    CategoryFormComponent,
    SegmentSelectorComponent,
  ],
  templateUrl: "./categories.view.html",
})
export class CategoriesView extends BaseListView implements OnInit {
  private adminService = inject(AdminService);
  private confirmDialogService = inject(ConfirmDialogService);
  private relationLoadingService = inject(RelationLoadingService);
  private searchService = inject(SearchService);
  private entityStore = inject(EntityStoreService);
  private route = inject(ActivatedRoute);
  private _apiService = inject(ApiService);
  private tauriApi = inject(TauriApiService);

  refreshState = signal<"idle" | "refreshing">("idle");
  override loading = signal(false);

  activeVisibility = signal<"all" | "local" | "cloud">("all");

  private localCategoryIds = signal<Set<string>>(new Set());
  private cloudCategoryIds = signal<Set<string>>(new Set());

  categoriesPagination = signal<{
    skip: number;
    limit: number;
    total: number;
    hasMore: boolean;
    loading: boolean;
  }>({ skip: 0, limit: 10, total: 0, hasMore: true, loading: false });

  allCategories = computed(() =>
    this.entityStore.categories().filter((c: Category) => !c.deleted_at)
  );

  localCategories = computed(() => {
    const localIds = this.localCategoryIds();
    return this.allCategories().filter((c) => localIds.has(c.id));
  });

  cloudCategories = computed(() => {
    const cloudIds = this.cloudCategoryIds();
    return this.allCategories().filter((c) => cloudIds.has(c.id));
  });

  visibilityOptions = computed<SegmentOption[]>(() => [
    {
      id: "all",
      label: "All",
      icon: "apps",
      count: this.allCategories().length,
    },
    {
      id: "local",
      label: "Local",
      icon: "folder",
      count: this.localCategories().length,
    },
    {
      id: "cloud",
      label: "Cloud",
      icon: "cloud",
      count: this.cloudCategories().length,
    },
  ]);

  protected getItems(): { id: string }[] {
    return this.searchResults();
  }

  protected get selectedCategories() {
    return this.selectedItems;
  }

  showOfflineBanner = computed(() => {
    const vis = this.activeVisibility();
    return vis === "cloud" && this.isOffline();
  });

  cloudOffline = computed(() => {
    const vis = this.activeVisibility();
    const offline = this.isOffline();
    return vis === "cloud" && offline;
  });

  searchResults = computed(() => {
    if (this.cloudOffline()) {
      return [];
    }

    const vis = this.activeVisibility();
    const cats =
      vis === "local"
        ? this.localCategories()
        : vis === "cloud"
          ? this.cloudCategories()
          : this.allCategories();

    let filtered = [...cats];

    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      filtered = filtered.filter((cat: Category) =>
        (cat.title || "").toLowerCase().includes(query)
      );
    }
    const order = this.sortOrder();
    const by = this.sortBy();
    return filtered.sort((a, b) => {
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

  override onSearchChange(query: string): void {
    super.onSearchChange(query);
    this.searchService.search("categories", query);
  }

  showCreateForm = signal(false);
  editingCategory = signal<Category | null>(null);
  sortBy = signal<"title" | "createdAt" | "updatedAt">("createdAt");
  sortOrder = signal<"asc" | "desc">("desc");
  highlightCategoryId = signal<string | null>(null);

  categoryCardConfig = CATEGORY_CARD_CONFIG;
  categoryTableConfig = CATEGORY_TABLE_CONFIG;
  categoryActions = [TABLE_ACTIONS.EDIT, TABLE_ACTIONS.ARCHIVE];
  categoryExpandFields: TableField[] = [];

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

    this.pageKey = "categories";
    this.viewMode.set(this.loadViewModePreference());

    this.subscriptions.add(
      this.shortcutService.createCategory$.subscribe(() => {
        this.toggleCreateForm();
      })
    );

    this.subscriptions.add(
      this.route.queryParams.subscribe((queryParams: any) => {
        const highlightId = queryParams.highlightCategoryId;
        if (highlightId) {
          this.highlightCategoryId.set(highlightId);
        }
        super.handleHighlightQueryParams(queryParams, "highlightCategoryId", "category-", () =>
          this.highlightCategoryId.set(null)
        );
      })
    );

    this.loadCategories();
  }

  loadCategories(): void {
    const visibility = this.activeVisibility();
    if (visibility === "cloud" && this.isOffline()) {
      return;
    }
    this.categoriesPagination.update((p) => ({ ...p, loading: true }));

    this.loadLocalCategories();
    this.loadCloudCategories();

    this.categoriesPagination.update((p) => ({
      ...p,
      loading: false,
      skip: p.limit,
      hasMore: true,
    }));
  }

  private loadLocalCategories(): void {
    this.subscriptions.add(
      this.tauriApi
        .invoke<any>("get_all_from_json", { table: "categories", limit: 1000 })
        .subscribe({
          next: (response: any) => {
            const localCats = Array.isArray(response) ? response : response?.data;
            if (localCats && localCats.length > 0) {
              const localIds = new Set<string>(localCats.map((c: any) => c.id));
              this.localCategoryIds.set(localIds);

              localCats.forEach((cat: any) => {
                this.entityStore.addEntity("categories", cat);
              });
            }
          },
          error: () => {},
        })
    );
  }

  private loadCloudCategories(): void {
    this.subscriptions.add(
      this._apiService.categories.getAll({ visibility: "all", limit: 1000 }).subscribe({
        next: (cloudCats: Category[]) => {
          const cloudIds = new Set<string>(cloudCats.map((c: Category) => c.id));
          this.cloudCategoryIds.set(cloudIds);
          cloudCats.forEach((cat: Category) => {
            this.entityStore.addEntity("categories", cat as any);
          });
        },
        error: () => {},
      })
    );
  }

  loadMoreCategories(): void {
    if (this.categoriesPagination().loading || !this.categoriesPagination().hasMore) return;
    this.categoriesPagination.update((p) => ({ ...p, loading: true }));
    this.entityStore.loadMoreCategories();
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
    this.loadCategories();
  }

  onCategoryExpand(item: Category): Observable<any> {
    return this.relationLoadingService.load<Category>("categories", item.id, ["user"]);
  }

  private getCategoryStorageType(categoryId: string): "local" | "cloud" {
    if (this.localCategoryIds().has(categoryId)) {
      return "local";
    }
    if (this.cloudCategoryIds().has(categoryId)) {
      return "cloud";
    }
    return "cloud";
  }

  getCategoryStorageTarget(): StorageTarget {
    const editing = this.editingCategory();
    if (!editing) return "local";
    return this.getCategoryStorageType(editing.id) as StorageTarget;
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
        const storageType = this.getCategoryStorageType(categoryId);

        if (storageType === "local") {
          const response = await this.adminService.toggleDeleteStatusLocal(
            "categories",
            categoryId,
            "local"
          );
          if (response.status === ResponseStatus.SUCCESS) {
            this.notifyService.showSuccess("Category archived successfully");
            this.entityStore.categories.update((cats) =>
              cats.map((c) =>
                c.id === categoryId ? { ...c, deleted_at: new Date().toISOString() } : c
              )
            );
            this.searchQuery.set("");
          } else {
            this.notifyService.showError(response.message || "Failed to archive category");
          }
        } else {
          const response = await this.adminService.toggleDeleteStatus(
            "categories",
            categoryId,
            "cloud"
          );
          if (response.status === ResponseStatus.SUCCESS) {
            this.notifyService.showSuccess("Category archived successfully");
            this.entityStore.categories.update((cats) =>
              cats.map((c) =>
                c.id === categoryId ? { ...c, deleted_at: new Date().toISOString() } : c
              )
            );
            this.searchQuery.set("");
          } else {
            this.notifyService.showError(response.message || "Failed to archive category");
          }
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

    const allCategories = this.allCategories();
    const selectedIdsArr = Array.from(selected);
    const selectedCategoriesList = allCategories.filter((c) => selectedIdsArr.includes(c.id));
    const allowedCategories = selectedCategoriesList.filter(
      (c) => c.user_id === this.currentUserId
    );
    const skippedCount = selected.size - allowedCategories.length;

    if (allowedCategories.length === 0) {
      this.notifyService.showError(
        "You don't have permission to archive any of the selected categories"
      );
      return;
    }

    const confirmed = await this.confirmDialogService.confirm({
      title: "Archive Categories",
      message: `Are you sure you want to archive ${selected.size} categorie(s)?${skippedCount > 0 ? ` (${skippedCount} skipped due to permissions)` : ""}`,
      confirmText: "Archive All",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
    });
    if (confirmed) {
      const archivedAt = new Date().toISOString();

      const localCategories = allowedCategories.filter((c) => this.localCategoryIds().has(c.id));
      const cloudCategories = allowedCategories.filter((c) => !this.localCategoryIds().has(c.id));

      for (const category of localCategories) {
        await this.adminService.toggleDeleteStatusLocal("categories", category.id, "local");
      }

      for (const category of cloudCategories) {
        await this.adminService.toggleDeleteStatus("categories", category.id, "cloud");
      }

      this.entityStore.categories.update((cats) =>
        cats.map((c) => (selectedIdsArr.includes(c.id) ? { ...c, deleted_at: archivedAt } : c))
      );

      const successMsg =
        skippedCount > 0
          ? `${allowedCategories.length} categorie(s) archived, ${skippedCount} skipped`
          : `${allowedCategories.length} categorie(s) archived successfully`;
      this.notifyService.showSuccess(successMsg);
      this.clearSelection();
      this.searchQuery.set("");
    }
  }

  onRowClick(_category: Category): void {}

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
      refresh: {
        onClick: () => {
          this.refreshState.set("refreshing");
          this.loadCategories();
          setTimeout(() => this.refreshState.set("idle"), 500);
        },
        loading: this.refreshState() === "refreshing",
      },
    };
  }

  onSearch(query: string): void {
    this.searchQuery.set(query);
  }

  onVisibilityChange(visibility: string): void {
    this.activeVisibility.set(visibility as any);
    this.loadCategories();
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
