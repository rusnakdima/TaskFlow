import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  ChangeDetectionStrategy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import Cropper from "cropperjs";
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
    UserAvatarComponent,
    AppButtonComponent,
    UnifiedFieldComponent,
  ],
  templateUrl: "./avatar-selector.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarSelectorComponent implements AfterViewInit, OnDestroy {
  @ViewChild("cropperImage") cropperImageRef!: ElementRef<HTMLImageElement>;
  private cropper: Cropper | null = null;
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
  pendingImageUrl = signal("");
  originalImageUrl = signal("");
  private cropDebounceTimer: any = null;
  private readonly MAX_IMAGE_SIZE = 2048;
  private readonly CROP_DEBOUNCE_MS = 500;

  toggleExpanded(): void {
    this.expanded.update((v) => !v);
    if (!this.expanded()) {
      this.showCropper.set(false);
    }
  }

  selectPreset(url: string): void {
    console.log("[AvatarSelector] selectPreset() called with URL:", url);
    this._imageUrl.set(url);
    this.imageUrlChange.emit(url);
    console.log("[AvatarSelector] Preset selected and emitted");
  }

  onUrlInputChange(value: string): void {
    this.urlFormControl.setValue(value);
  }

  openCropperFromUrl(): void {
    const url = this.urlFormControl.value?.trim() || "";
    console.log("[AvatarSelector] openCropperFromUrl() called with URL:", url);

    if (!url) {
      console.log("[AvatarSelector] URL is empty, returning");
      return;
    }

    this.originalImageUrl.set(this._imageUrl());
    this.pendingImageUrl.set("");

    console.log("[AvatarSelector] Loading image from URL...");
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      console.log(
        "[AvatarSelector] Image loaded from URL, dimensions:",
        img.naturalWidth + "x" + img.naturalHeight
      );

      const resizedBase64 = this.resizeImageToBase64(img, this.MAX_IMAGE_SIZE);
      console.log("[AvatarSelector] Image resized to base64, length:", resizedBase64.length);
      this.imageBase64.set(resizedBase64);
      this.showCropper.set(true);
      this.expanded.set(true);
      console.log("[AvatarSelector] Cropper modal opened for URL image");
      setTimeout(() => this.initCropper(), 100);
    };

    img.onerror = () => {
      console.error("[AvatarSelector] Failed to load image from URL:", url);
    };

    img.src = url;
  }

  onFileSelect(event: Event): void {
    console.log("[AvatarSelector] onFileSelect() called");
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      console.log(
        "[AvatarSelector] File selected:",
        file.name,
        "size:",
        file.size,
        "type:",
        file.type
      );

      this.originalImageUrl.set(this._imageUrl());
      this.pendingImageUrl.set("");

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        console.log("[AvatarSelector] FileReader loaded, result length:", result?.length);
        this.openCropperFromFile(result);
      };
      reader.readAsDataURL(file);
    }
    input.value = "";
  }

  openCropperFromFile(base64: string): void {
    console.log("[AvatarSelector] openCropperFromFile() called, base64 length:", base64?.length);

    const img = new Image();
    img.onload = () => {
      console.log(
        "[AvatarSelector] Image loaded for resizing, dimensions:",
        img.naturalWidth + "x" + img.naturalHeight
      );
      const resizedBase64 = this.resizeImageToBase64(img, this.MAX_IMAGE_SIZE);
      console.log("[AvatarSelector] Image resized, new base64 length:", resizedBase64.length);

      this.imageBase64.set(resizedBase64);
      this.showCropper.set(true);
      this.expanded.set(true);
      console.log("[AvatarSelector] Cropper modal opened for uploaded file");
      setTimeout(() => this.initCropper(), 100);
    };
    img.src = base64;
  }

  imageCropped(): void {
    console.log("[AvatarSelector] imageCropped() called from cropper (debounced)");

    if (this.cropDebounceTimer) {
      clearTimeout(this.cropDebounceTimer);
    }

    this.cropDebounceTimer = setTimeout(() => {
      this.executeImageCrop();
    }, this.CROP_DEBOUNCE_MS);
  }

  private executeImageCrop(): void {
    console.log("[AvatarSelector] executeImageCrop() called");

    if (!this.cropper) {
      console.log("[AvatarSelector] No cropper instance");
      return;
    }

    const canvas = this.cropper.getCroppedCanvas({
      maxWidth: 4096,
      maxHeight: 4096,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });

    if (canvas) {
      const base64 = canvas.toDataURL("image/png");
      console.log("[AvatarSelector] Cropped image, base64 length:", base64.length);
      this.pendingImageUrl.set(base64);
      console.log("[AvatarSelector] Pending image stored");
    } else {
      console.log("[AvatarSelector] WARNING: Could not get cropped canvas!");
    }
  }

  private resizeImageToBase64(img: HTMLImageElement, maxSize: number): string {
    console.log(
      "[AvatarSelector] resizeImageToBase64() - original:",
      img.naturalWidth + "x" + img.naturalHeight,
      "maxSize:",
      maxSize
    );

    let width = img.naturalWidth;
    let height = img.naturalHeight;

    if (width <= maxSize && height <= maxSize) {
      console.log("[AvatarSelector] Image is smaller than maxSize, no resize needed");
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL("image/png");
      }
      return "";
    }

    const ratio = Math.min(maxSize / width, maxSize / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);

    console.log("[AvatarSelector] Resizing image to:", width + "x" + height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL("image/png");
    }
    return "";
  }

  ngAfterViewInit(): void {
    console.log("[AvatarSelector] ngAfterViewInit called");
  }

  ngOnDestroy(): void {
    console.log("[AvatarSelector] ngOnDestroy called");
    if (this.cropDebounceTimer) {
      clearTimeout(this.cropDebounceTimer);
      this.cropDebounceTimer = null;
    }
    this.destroyCropper();
  }

  private destroyCropper(): void {
    if (this.cropper) {
      console.log("[AvatarSelector] Destroying cropper instance");
      this.cropper.destroy();
      this.cropper = null;
    }
  }

  private initCropper(): void {
    if (!this.cropperImageRef?.nativeElement) {
      console.log("[AvatarSelector] Cropper image element not found");
      return;
    }

    this.destroyCropper();

    const imageElement = this.cropperImageRef.nativeElement;
    console.log("[AvatarSelector] Initializing cropper for image");

    this.cropper = new Cropper(imageElement, {
      aspectRatio: 1,
      viewMode: 1,
      dragMode: "move",
      autoCropArea: 1,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      ready: () => {
        console.log("[AvatarSelector] Cropper ready");
      },
      crop: () => {
        this.imageCropped();
      },
    });
  }

  cancelCrop(): void {
    console.log("[AvatarSelector] cancelCrop() called");
    console.log("[AvatarSelector] Original image:", this.originalImageUrl());

    this.destroyCropper();

    const original = this.originalImageUrl();
    if (original && original.length > 0) {
      console.log("[AvatarSelector] Reverting to original image");
      this._imageUrl.set(original);
    }

    this.showCropper.set(false);
    this.imageBase64.set("");
    this.pendingImageUrl.set("");
    console.log("[AvatarSelector] Modal closed, reverted to original");
  }

  saveCrop(): void {
    console.log("[AvatarSelector] saveCrop() called");
    console.log(
      "[AvatarSelector] Pending image:",
      this.pendingImageUrl() ? "exists (" + this.pendingImageUrl().length + ")" : "empty"
    );

    if (!this.cropper) {
      console.log("[AvatarSelector] No cropper, calling imageCropped() directly");
      this.imageCropped();
    }

    const pending = this.pendingImageUrl();
    if (pending && pending.length > 0) {
      console.log("[AvatarSelector] Saving pending image...");
      this._imageUrl.set(pending);
      this.imageUrlChange.emit(pending);
      console.log("[AvatarSelector] Crop saved and emitted to parent");
    } else {
      console.log("[AvatarSelector] WARNING: No pending image to save!");
    }

    this.destroyCropper();
    this.showCropper.set(false);
    this.imageBase64.set("");
    this.pendingImageUrl.set("");
    console.log("[AvatarSelector] Modal closed, signals cleared");
  }
}
