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
  ChangeDetectionStrategy,
  signal,
} from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatSelectModule } from "@angular/material/select";
import { MatFormFieldModule } from "@angular/material/form-field";
/* components */
import { UnifiedFieldComponent } from "@components/fields/unified/unified-field.component";
/* models */
import { Category } from "@entities/generated/api.types";
import { TextField, TypeField } from "@entities/form-field.model";
import { StorageTarget, CATEGORY_VISIBILITY_OPTIONS } from "@entities/entity-config.model";
/* services */
import { NotifyService } from "@services/notifications/notify.service";
import { AuthService } from "@services/auth/auth.service";
import { ApiService } from "@services/api.service";
import { AppButtonComponent } from "@components/shared/button/button.component";
import { EntityStoreService } from "@core/services/entity-store.service";
@Component({
  selector: "app-category-form",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    AppButtonComponent,
    UnifiedFieldComponent,
  ],
  templateUrl: "./category-form.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryFormComponent implements OnInit, OnChanges {
  private authService = inject(AuthService);
  private notifyService = inject(NotifyService);
  private requestService = inject(ApiService);
  private entityStore = inject(EntityStoreService);
  @Input() isVisible: boolean = false;
  @Input() editingCategory: Category | null = null;
  @Input() visibility: string = "private";
  @Input() initialStorageTarget: StorageTarget = "local";
  @Output() close: EventEmitter<void> = new EventEmitter<void>();
  @Output() saved: EventEmitter<void> = new EventEmitter<void>();
  titleFormControl = new FormControl("");
  categoryFormGroup = new FormGroup({
    title: this.titleFormControl,
  });
  titleFieldDef: TextField = {
    name: "title",
    label: "Category Title",
    type: TypeField.text,
    isShow: () => true,
  };
  userId: string = "";
  isLoading: boolean = false;
  storageTarget = signal<StorageTarget>("local");
  storageOptions = CATEGORY_VISIBILITY_OPTIONS;
  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");
  }
  ngOnDestroy(): void {}
  ngOnChanges(changes: SimpleChanges): void {
    if (changes["editingCategory"]) {
      const title = this.editingCategory ? this.editingCategory.title : "";
      this.titleFormControl.setValue(title, { emitEvent: false });
    }
    if (changes["initialStorageTarget"]) {
      this.storageTarget.set(this.initialStorageTarget);
    }
  }
  openModal(category?: Category) {
    this.editingCategory = category || null;
    this.titleFormControl.setValue(category ? category.title : "", { emitEvent: false });
    this.storageTarget.set(this.initialStorageTarget);
    this.isVisible = true;
  }
  closeModal() {
    this.isVisible = false;
    this.editingCategory = null;
    this.titleFormControl.setValue("");
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
  onTitleChange(value: string): void {
    this.titleFormControl.setValue(value);
  }
  onStorageTargetChange(target: StorageTarget): void {
    this.storageTarget.set(target);
  }
  saveCategory() {
    const title = this.titleFormControl.value?.trim();
    if (!title || this.isLoading) return;
    this.isLoading = true;
    if (this.editingCategory) {
      this.updateCategory();
    } else {
      this.createCategory();
    }
  }
  private createCategory() {
    const categoryData: Partial<Category> = {
      title: this.titleFormControl.value?.trim() || "",
      user_id: this.userId,
    };
    const targetDb = this.storageTarget();
    if (targetDb === "local") {
      this.createCategoryLocal(categoryData);
    } else {
      this.createCategoryCloud(categoryData);
    }
  }
  private createCategoryLocal(categoryData: Partial<Category>) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const fullCategory: Category = {
      id,
      title: categoryData.title || "",
      user_id: categoryData.user_id || this.userId,
      created_at: now,
      updated_at: now,
      deleted_at: undefined,
    } as Category;
    this.entityStore
      .createEntity("categories", fullCategory as any, { targetDb: "local" })
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Category created successfully");
          this.closeModal();
          this.saved.emit();
        },
      })
      .add(() => {
        this.isLoading = false;
      });
  }
  private createCategoryCloud(categoryData: Partial<Category>) {
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
      title: this.titleFormControl.value?.trim() || "",
    };
    const targetDb = this.storageTarget();
    if (targetDb === "local") {
      this.updateCategoryLocal(updatedCategory);
    } else {
      this.updateCategoryCloud(updatedCategory);
    }
  }
  private updateCategoryLocal(updatedCategory: Category) {
    this.entityStore
      .updateEntity("categories", updatedCategory.id, updatedCategory as any, { targetDb: "local" })
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Category updated successfully");
          this.closeModal();
          this.saved.emit();
        },
      })
      .add(() => {
        this.isLoading = false;
      });
  }
  private updateCategoryCloud(updatedCategory: Category) {
    this.requestService
      .update("categories", updatedCategory.id, updatedCategory, {
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
