/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, inject } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";

/* materials */
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";

/* models */
import { ImageField } from "@models/form-field.model";

/* services */
import { NotifyService } from "@services/notifications/notify.service";

/* components */
import { CropModalComponent } from "./crop-modal/crop-modal.component";

@Component({
  selector: "app-image",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    CropModalComponent,
  ],
  templateUrl: "./image.component.html",
})
export class ImageComponent {
  @Input() label: string = "";
  @Input() form!: FormGroup;
  @Input() field!: ImageField;
  @Input() avatarsOnly: boolean = false;

  @Output() imageCropped: EventEmitter<string> = new EventEmitter<string>();

  private notifyService = inject(NotifyService);

  showCropModal: boolean = false;
  cropImageSource: string = "";
  urlInput: string = "";
  pendingOriginalUrl: string = "";
  showAvatarPicker: boolean = false;

  preparedAvatars: string[] = Array.from(
    { length: 12 },
    (_, i) => `/assets/images/avatars/avatar-${i + 1}.svg`
  );

  selectedAvatarIndex: number | null = null;

  isInvalid(attr: string) {
    return (
      (this.form.get(attr)?.touched || this.form.get(attr)?.dirty) && this.form.get(attr)?.errors
    );
  }

  onUploadClick() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        this.onFileSelected(file);
      }
    };
    input.click();
  }

  onFileSelected(file: File) {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      this.pendingOriginalUrl = base64;
      this.cropImageSource = base64;
      this.showCropModal = true;
    };
    reader.readAsDataURL(file);
  }

  onLoadUrlClick() {
    if (!this.urlInput.trim()) return;
    this.pendingOriginalUrl = this.urlInput;
    this.cropImageSource = this.urlInput;
    this.showCropModal = true;
  }

  onCropCompleted(base64: string) {
    this.showCropModal = false;
    this.form.get(this.field.name)?.setValue(base64);
    this.form.get("original_image_url")?.setValue(this.pendingOriginalUrl);
    this.pendingOriginalUrl = "";
    this.imageCropped.emit(base64);
  }

  onCropCancelled() {
    this.showCropModal = false;
  }

  onCropError(message: string) {
    this.showCropModal = false;
    this.notifyService.showError(message);
  }

  onRemoveImage() {
    if (this.avatarsOnly) {
      this.selectedAvatarIndex = 0;
      this.form.get(this.field.name)?.setValue(this.preparedAvatars[0]);
      this.form.get("original_image_url")?.setValue("");
    } else {
      this.form.get(this.field.name)?.setValue("/assets/images/user.png");
      this.form.get("original_image_url")?.setValue("");
    }
    this.urlInput = "";
    this.pendingOriginalUrl = "";
  }

  onSelectAvatar(avatar: string, index: number) {
    this.selectedAvatarIndex = index;
    this.form.get(this.field.name)?.setValue(avatar);
    this.form.get("original_image_url")?.setValue(avatar);
  }

  onToggleAvatarPicker() {
    this.showAvatarPicker = !this.showAvatarPicker;
  }

  onReCropOriginal() {
    const originalUrl = this.form.get("original_image_url")?.value;
    if (originalUrl) {
      this.pendingOriginalUrl = originalUrl;
      this.cropImageSource = originalUrl;
      this.showCropModal = true;
    }
  }

  async fetchImageAsBlob(url: string): Promise<{ base64: string; hasCors: boolean }> {
    try {
      const response = await fetch(url, { mode: "cors" });
      if (response.ok) {
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve({ base64: reader.result as string, hasCors: true });
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {
      // CORS not supported - try direct URL (works for display but not canvas)
    }
    return { base64: url, hasCors: false };
  }
}
