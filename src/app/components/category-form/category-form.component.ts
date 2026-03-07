/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  Output,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
} from "@angular/core";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Category } from "@models/category.model";

/* services */
import { NotifyService } from "@services/notify.service";
import { AuthService } from "@services/auth.service";
import { StorageService } from "@services/storage.service";
import { DataSyncProvider } from "@providers/data-sync.provider";

@Component({
  selector: "app-category-form",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: "./category-form.component.html",
})
export class CategoryFormComponent implements OnInit, OnDestroy, OnChanges {
  constructor(
    private authService: AuthService,
    private storageService: StorageService,
    private dataSyncProvider: DataSyncProvider,
    private notifyService: NotifyService
  ) {}

  @Input() isVisible: boolean = false;
  @Input() editingCategory: Category | null = null;

  @Output() close: EventEmitter<void> = new EventEmitter<void>();
  @Output() saved: EventEmitter<void> = new EventEmitter<void>();

  categoryTitle: string = "";
  userId: string = "";
  isLoading: boolean = false;

  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");
  }

  ngOnDestroy(): void {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["editingCategory"]) {
      this.categoryTitle = this.editingCategory ? this.editingCategory.title : "";
    }
  }

  openModal(category?: Category) {
    this.editingCategory = category || null;
    this.categoryTitle = category ? category.title : "";
    this.isVisible = true;
  }

  closeModal() {
    this.isVisible = false;
    this.editingCategory = null;
    this.categoryTitle = "";
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      this.closeModal();
    } else if (event.key === "Enter" && !this.isLoading) {
      this.saveCategory();
    }
  }

  saveCategory() {
    if (!this.categoryTitle.trim() || this.isLoading) return;

    this.isLoading = true;

    if (this.editingCategory) {
      this.updateCategory();
    } else {
      this.createCategory();
    }
  }

  private createCategory() {
    const categoryData = {
      title: this.categoryTitle.trim(),
      userId: this.userId,
    };

    this.dataSyncProvider
      .create<Category>("categories", categoryData)
      .subscribe({
        next: (createdCategory) => {
          // Update cache
          this.storageService.addCategory(createdCategory);
          this.notifyService.showSuccess("Category created successfully");
          this.closeModal();
          this.saved.emit();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to create category");
        },
      })
      .add(() => {
        this.isLoading = false;
      });
  }

  private updateCategory() {
    if (!this.editingCategory) return;

    const updatedCategory = {
      ...this.editingCategory,
      title: this.categoryTitle.trim(),
    };

    this.dataSyncProvider
      .update<Category>("categories", this.editingCategory.id, updatedCategory)
      .subscribe({
        next: () => {
          // Update cache
          this.storageService.updateCategory(this.editingCategory!.id, updatedCategory);
          this.notifyService.showSuccess("Category updated successfully");
          this.closeModal();
          this.saved.emit();
        },
        error: (err) => {
          this.notifyService.showError(err.message || "Failed to update category");
        },
      })
      .add(() => {
        this.isLoading = false;
      });
  }
}
