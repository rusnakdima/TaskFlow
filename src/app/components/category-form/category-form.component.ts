/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Input,
  Output,
  OnInit,
  OnChanges,
  SimpleChanges,
  inject,
} from "@angular/core";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Category } from "@models/generated/api.types";

/* services */
import { NotifyService } from "@services/notifications/notify.service";
import { AuthService } from "@services/auth/auth.service";
import { ApiService } from "@services/api.service";
import { AppButtonComponent } from "@components/shared/button/button.component";

@Component({
  selector: "app-category-form",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, AppButtonComponent],
  templateUrl: "./category-form.component.html",
})
export class CategoryFormComponent implements OnInit, OnChanges {
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  private requestService = inject(ApiService);

  @Input() isVisible: boolean = false;
  @Input() editingCategory: Category | null = null;
  @Input() visibility: string = "private";

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
      user_id: this.userId,
    };

    this.requestService
      .create<Category>("categories", categoryData, { visibility: this.visibility })
      .subscribe({
        next: (_createdCategory: Category) => {
          this.notifyService.showSuccess("Category created successfully");
          this.closeModal();
          this.saved.emit();
        },
        error: (err: any) => {
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

    this.requestService
      .update("categories", this.editingCategory.id, updatedCategory, {
        visibility: this.visibility,
      })
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Category updated successfully");
          this.closeModal();
          this.saved.emit();
        },
        error: (err: any) => {
          this.notifyService.showError(err.message || "Failed to update category");
        },
      })
      .add(() => {
        this.isLoading = false;
      });
  }
}
