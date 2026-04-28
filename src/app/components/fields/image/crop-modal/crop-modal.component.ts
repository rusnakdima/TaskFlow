/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from "@angular/core";

@Component({
  selector: "app-crop-modal",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./crop-modal.component.html",
  styleUrl: "./crop-modal.component.css",
})
export class CropModalComponent {
  @Input() imageSource: string = "";

  @Output() cropped: EventEmitter<string> = new EventEmitter<string>();
  @Output() cancelled: EventEmitter<void> = new EventEmitter<void>();

  @ViewChild("canvas") canvasRef!: ElementRef<HTMLCanvasElement>;

  // Crop selection (in canvas display coordinates)
  cropX: number = 0;
  cropY: number = 0;
  cropSize: number = 200;
  maxCropSize: number = 100;

  // Drag/resize state
  isDragging: boolean = false;
  isResizing: boolean = false;
  dragStartX: number = 0;
  dragStartY: number = 0;
  initialCropX: number = 0;
  initialCropY: number = 0;
  initialCropSize: number = 0;

  imageLoaded: boolean = false;
  canvasWidth: number = 0;
  canvasHeight: number = 0;

  private img: HTMLImageElement | null = null;
  private readonly MAX_CANVAS: number = 400;

  ngAfterViewInit() {
    this.loadImage();
  }

  loadImage() {
    if (!this.imageSource) return;

    const img = new Image();

    img.onload = () => {
      this.img = img;

      // Scale to fit canvas (max 400px)
      const scale = Math.min(1, this.MAX_CANVAS / img.width, this.MAX_CANVAS / img.height);
      this.canvasWidth = Math.round(img.width * scale);
      this.canvasHeight = Math.round(img.height * scale);

      // Initial crop: centered square
      const minDim = Math.min(this.canvasWidth, this.canvasHeight);
      this.maxCropSize = minDim;
      this.cropSize = minDim;
      this.cropX = (this.canvasWidth - this.cropSize) / 2;
      this.cropY = (this.canvasHeight - this.cropSize) / 2;
      this.imageLoaded = true;

      setTimeout(() => this.redrawCanvas(), 0);
    };

    img.onerror = () => {
      console.error("Failed to load image for cropping");
    };

    // Try CORS first, fallback to no CORS
    try {
      img.crossOrigin = "anonymous";
      img.src = this.imageSource;
    } catch (e) {
      img.crossOrigin = "";
      img.src = this.imageSource;
    }
  }

  redrawCanvas() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.img || !this.imageLoaded) return;

    canvas.width = this.canvasWidth;
    canvas.height = this.canvasHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw full scaled image
    ctx.drawImage(this.img, 0, 0, this.canvasWidth, this.canvasHeight);

    // Darken everything
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    // Redraw image in crop area (clip to crop rectangle)
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.cropX, this.cropY, this.cropSize, this.cropSize);
    ctx.clip();
    ctx.drawImage(this.img, 0, 0, this.canvasWidth, this.canvasHeight);
    ctx.restore();

    // Draw crop border
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.strokeRect(this.cropX, this.cropY, this.cropSize, this.cropSize);

    // Draw resize handles (4 corners)
    const handleSize = 10;
    ctx.fillStyle = "white";
    // Top-left
    ctx.fillRect(this.cropX - handleSize / 2, this.cropY - handleSize / 2, handleSize, handleSize);
    // Top-right
    ctx.fillRect(
      this.cropX + this.cropSize - handleSize / 2,
      this.cropY - handleSize / 2,
      handleSize,
      handleSize
    );
    // Bottom-left
    ctx.fillRect(
      this.cropX - handleSize / 2,
      this.cropY + this.cropSize - handleSize / 2,
      handleSize,
      handleSize
    );
    // Bottom-right
    ctx.fillRect(
      this.cropX + this.cropSize - handleSize / 2,
      this.cropY + this.cropSize - handleSize / 2,
      handleSize,
      handleSize
    );
  }

  onMouseDown(event: MouseEvent) {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const cornerThreshold = 15;
    const rightCorner = this.cropX + this.cropSize;
    const bottomCorner = this.cropY + this.cropSize;

    // Check bottom-right corner for resize
    const nearRightCorner =
      Math.abs(x - rightCorner) < cornerThreshold && y >= this.cropY && y <= bottomCorner;
    const nearBottomCorner =
      Math.abs(y - bottomCorner) < cornerThreshold && x >= this.cropX && x <= rightCorner;

    if (nearRightCorner && nearBottomCorner) {
      this.isResizing = true;
      this.initialCropSize = this.cropSize;
      this.dragStartX = x;
      this.dragStartY = y;
      return;
    }

    // Check inside crop area for drag
    if (
      x >= this.cropX &&
      x <= this.cropX + this.cropSize &&
      y >= this.cropY &&
      y <= this.cropY + this.cropSize
    ) {
      this.isDragging = true;
      this.initialCropX = this.cropX;
      this.initialCropY = this.cropY;
      this.dragStartX = x;
      this.dragStartY = y;
    }
  }

  onMouseMove(event: MouseEvent) {
    if (!this.isDragging && !this.isResizing) return;

    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (this.isDragging) {
      const dx = x - this.dragStartX;
      const dy = y - this.dragStartY;

      let newX = this.initialCropX + dx;
      let newY = this.initialCropY + dy;

      newX = Math.max(0, Math.min(newX, this.canvasWidth - this.cropSize));
      newY = Math.max(0, Math.min(newY, this.canvasHeight - this.cropSize));

      this.cropX = newX;
      this.cropY = newY;
    } else if (this.isResizing) {
      const dx = x - this.dragStartX;
      const dy = y - this.dragStartY;

      let newSize = this.initialCropSize + Math.max(dx, dy);
      newSize = Math.max(50, Math.min(newSize, this.maxCropSize));

      // Keep center when resizing
      const newX = this.cropX - (newSize - this.cropSize) / 2;
      const newY = this.cropY - (newSize - this.cropSize) / 2;

      if (
        newX >= 0 &&
        newX + newSize <= this.canvasWidth &&
        newY >= 0 &&
        newY + newSize <= this.canvasHeight
      ) {
        this.cropX = newX;
        this.cropY = newY;
        this.cropSize = newSize;
      }
    }

    this.redrawCanvas();
  }

  onMouseUp() {
    this.isDragging = false;
    this.isResizing = false;
  }

  onCrop() {
    if (!this.img) return;

    // Map display coordinates to original image coordinates
    const scaleX = this.img.width / this.canvasWidth;
    const scaleY = this.img.height / this.canvasHeight;

    const srcX = Math.round(this.cropX * scaleX);
    const srcY = Math.round(this.cropY * scaleY);
    const srcSize = Math.round(this.cropSize * scaleX); // square

    // Clamp to image bounds
    const safeX = Math.max(0, Math.min(srcX, this.img.width - 1));
    const safeY = Math.max(0, Math.min(srcY, this.img.height - 1));
    const safeSize = Math.min(srcSize, this.img.width - safeX, this.img.height - safeY);

    // Output at max 500px
    const MAX_OUT = 500;
    const outSize = Math.min(safeSize, MAX_OUT);

    const outCanvas = document.createElement("canvas");
    outCanvas.width = outSize;
    outCanvas.height = outSize;

    const ctx = outCanvas.getContext("2d");
    if (!ctx) return;

    try {
      ctx.drawImage(this.img, safeX, safeY, safeSize, safeSize, 0, 0, outSize, outSize);

      outCanvas.toBlob(
        (blob) => {
          if (blob) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result as string;
              this.cropped.emit(base64);
            };
            reader.readAsDataURL(blob);
          } else {
            this.cropped.emit(this.imageSource);
          }
        },
        "image/jpeg",
        0.9
      );
    } catch (e) {
      // CORS issue - return original
      this.cropped.emit(this.imageSource);
    }
  }

  onCancel() {
    this.cancelled.emit();
  }
}
