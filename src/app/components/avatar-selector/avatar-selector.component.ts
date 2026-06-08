import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { ImageCroppedEvent, ImageCropperComponent } from "ngx-image-cropper";
import { UserAvatarComponent } from "@components/user-avatar/user-avatar.component";
import { AppButtonComponent } from "@components/shared/button/button.component";
import { UnifiedFieldComponent } from "@components/fields/unified/unified-field.component";
import { TextField, TypeField } from "@models/form-field.model";

@Component({
  selector: "app-avatar-selector",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    ImageCropperComponent,
    UserAvatarComponent,
    AppButtonComponent,
    UnifiedFieldComponent,
  ],
  templateUrl: "./avatar-selector.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarSelectorComponent {
  @Input()
  get imageUrl(): string {
    return this._imageUrl();
  }
  set imageUrl(value: string) {
    this._imageUrl.set(value);
  }

  @Output() imageUrlChange = new EventEmitter<string>();

  private _imageUrl = signal("/assets/images/avatars/avatar-1.svg");

  urlFormControl = new FormControl("");
  urlFormGroup = new FormGroup({
    imageUrl: this.urlFormControl,
  });

  urlFieldDef: TextField = {
    name: "imageUrl",
    label: "URL",
    type: TypeField.text,
    isShow: () => true,
  };

  presets = [
    "/assets/images/avatars/avatar-1.svg",
    "/assets/images/avatars/avatar-2.svg",
    "/assets/images/avatars/avatar-3.svg",
    "/assets/images/avatars/avatar-4.svg",
    "/assets/images/avatars/avatar-5.svg",
    "/assets/images/avatars/avatar-6.svg",
    "/assets/images/avatars/avatar-7.svg",
    "/assets/images/avatars/avatar-8.svg",
    "/assets/images/avatars/avatar-9.svg",
    "/assets/images/avatars/avatar-10.svg",
    "/assets/images/avatars/avatar-11.svg",
    "/assets/images/avatars/avatar-12.svg",
  ];

  expanded = signal(false);
  showCropper = signal(false);
  imageBase64 = signal("");

  toggleExpanded(): void {
    this.expanded.update((v) => !v);
    if (!this.expanded()) {
      this.showCropper.set(false);
    }
  }

  selectPreset(url: string): void {
    this._imageUrl.set(url);
    this.imageUrlChange.emit(url);
  }

  onUrlInputChange(value: string): void {
    this.urlFormControl.setValue(value);
  }

  applyUrl(): void {
    const url = this.urlFormControl.value?.trim() || "";
    if (url) {
      this._imageUrl.set(url);
      this.imageUrlChange.emit(url);
    }
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        this.imageBase64.set(result);
        this.showCropper.set(true);
        this.expanded.set(true);
      };
      reader.readAsDataURL(file);
    }
    input.value = "";
  }

  imageCropped(event: ImageCroppedEvent): void {
    const base64 = event.base64;
    if (base64) {
      this._imageUrl.set(base64);
      this.imageUrlChange.emit(base64);
    }
  }

  cancelCrop(): void {
    this.showCropper.set(false);
    this.imageBase64.set("");
  }

  saveCrop(): void {
    this.showCropper.set(false);
  }
}
