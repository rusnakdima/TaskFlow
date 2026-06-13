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
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import Cropper from "cropperjs";
import { UserAvatarComponent } from "@components/user-avatar/user-avatar.component";
import { AppButtonComponent } from "@components/shared/button/button.component";
import { UnifiedFieldComponent } from "@components/fields/unified/unified-field.component";
import { TextField, TypeField } from "@models/form-field.model";
import { LoggingService } from "@app/shared/services/logging.service";

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
  private loggingService = inject(LoggingService);

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

  openCropperFromUrl(): void {
    const url = this.urlFormControl.value?.trim() || "";

    if (!url) {
      return;
    }

    this.originalImageUrl.set(this._imageUrl());
    this.pendingImageUrl.set("");

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const resizedBase64 = this.resizeImageToBase64(img, this.MAX_IMAGE_SIZE);
      this.imageBase64.set(resizedBase64);
      this.showCropper.set(true);
      this.expanded.set(true);
      setTimeout(() => this.initCropper(), 100);
    };

    img.onerror = () => {
      this.loggingService.error("AvatarSelector", "Failed to load image from URL", { url });
    };

    img.src = url;
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];

      this.originalImageUrl.set(this._imageUrl());
      this.pendingImageUrl.set("");

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        this.openCropperFromFile(result);
      };
      reader.readAsDataURL(file);
    }
    input.value = "";
  }

  openCropperFromFile(base64: string): void {
    const img = new Image();
    img.onload = () => {
      const resizedBase64 = this.resizeImageToBase64(img, this.MAX_IMAGE_SIZE);

      this.imageBase64.set(resizedBase64);
      this.showCropper.set(true);
      this.expanded.set(true);
      setTimeout(() => this.initCropper(), 100);
    };
    img.src = base64;
  }

  imageCropped(): void {
    if (this.cropDebounceTimer) {
      clearTimeout(this.cropDebounceTimer);
    }

    this.cropDebounceTimer = setTimeout(() => {
      this.executeImageCrop();
    }, this.CROP_DEBOUNCE_MS);
  }

  private executeImageCrop(): void {
    if (!this.cropper) {
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
      this.pendingImageUrl.set(base64);
    }
  }

  private resizeImageToBase64(img: HTMLImageElement, maxSize: number): string {
    let width = img.naturalWidth;
    let height = img.naturalHeight;

    if (width <= maxSize && height <= maxSize) {
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

  ngAfterViewInit(): void {}

  ngOnDestroy(): void {
    if (this.cropDebounceTimer) {
      clearTimeout(this.cropDebounceTimer);
      this.cropDebounceTimer = null;
    }
    this.destroyCropper();
  }

  private destroyCropper(): void {
    if (this.cropper) {
      this.cropper.destroy();
      this.cropper = null;
    }
  }

  private initCropper(): void {
    if (!this.cropperImageRef?.nativeElement) {
      return;
    }

    this.destroyCropper();

    const imageElement = this.cropperImageRef.nativeElement;

    this.cropper = new Cropper(imageElement, {
      aspectRatio: 1,
      viewMode: 1,
      dragMode: "move",
      autoCropArea: 1,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      crop: () => {
        this.imageCropped();
      },
    });
  }

  cancelCrop(): void {
    this.destroyCropper();

    const original = this.originalImageUrl();
    if (original && original.length > 0) {
      this._imageUrl.set(original);
    }

    this.showCropper.set(false);
    this.imageBase64.set("");
    this.pendingImageUrl.set("");
  }

  saveCrop(): void {
    if (!this.cropper) {
      this.imageCropped();
    }

    const pending = this.pendingImageUrl();
    if (pending && pending.length > 0) {
      this._imageUrl.set(pending);
      this.imageUrlChange.emit(pending);
    }

    this.destroyCropper();
    this.showCropper.set(false);
    this.imageBase64.set("");
    this.pendingImageUrl.set("");
  }
}
