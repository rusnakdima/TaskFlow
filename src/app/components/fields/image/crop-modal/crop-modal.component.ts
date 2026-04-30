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

  cropX: number = 0;
  cropY: number = 0;
  cropSize: number = 200;
  maxCropSize: number = 100;

  isDragging: boolean = false;
  isResizing: boolean = false;
  resizeHandle: string = "";
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

      const scale = Math.min(1, this.MAX_CANVAS / img.width, this.MAX_CANVAS / img.height);
      this.canvasWidth = Math.round(img.width * scale);
      this.canvasHeight = Math.round(img.height * scale);

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

    ctx.drawImage(this.img, 0, 0, this.canvasWidth, this.canvasHeight);

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    ctx.save();
    ctx.beginPath();
    ctx.rect(this.cropX, this.cropY, this.cropSize, this.cropSize);
    ctx.clip();
    ctx.drawImage(this.img, 0, 0, this.canvasWidth, this.canvasHeight);
    ctx.restore();

    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.strokeRect(this.cropX, this.cropY, this.cropSize, this.cropSize);

    const handleSize = 16;
    ctx.fillStyle = "white";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;

    const corners = [
      [this.cropX, this.cropY],
      [this.cropX + this.cropSize, this.cropY],
      [this.cropX, this.cropY + this.cropSize],
      [this.cropX + this.cropSize, this.cropY + this.cropSize],
    ];

    for (const [cx, cy] of corners) {
      ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
    }
  }

  onMouseDown(event: MouseEvent) {
    this.handleStart(event.clientX, event.clientY);
  }

  onTouchStart(event: TouchEvent) {
    event.preventDefault();
    const touch = event.touches[0];
    this.handleStart(touch.clientX, touch.clientY);
  }

  private handleStart(clientX: number, clientY: number) {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const handleSize = 20;
    const edgeThreshold = 15;

    const minX = this.cropX;
    const maxX = this.cropX + this.cropSize;
    const minY = this.cropY;
    const maxY = this.cropY + this.cropSize;

    const onCorner =
      Math.abs(x - minX) < handleSize && Math.abs(y - minY) < handleSize
        ? "tl"
        : Math.abs(x - maxX) < handleSize && Math.abs(y - minY) < handleSize
          ? "tr"
          : Math.abs(x - minX) < handleSize && Math.abs(y - maxY) < handleSize
            ? "bl"
            : Math.abs(x - maxX) < handleSize && Math.abs(y - maxY) < handleSize
              ? "br"
              : "";

    if (onCorner) {
      this.isResizing = true;
      this.resizeHandle = onCorner;
      this.initialCropX = this.cropX;
      this.initialCropY = this.cropY;
      this.initialCropSize = this.cropSize;
      this.dragStartX = x;
      this.dragStartY = y;
      return;
    }

    const onEdgeH = Math.abs(y - minY) < edgeThreshold || Math.abs(y - maxY) < edgeThreshold;
    const onEdgeV = Math.abs(x - minX) < edgeThreshold || Math.abs(x - maxX) < edgeThreshold;

    if (onEdgeH && x > minX && x < maxX) {
      this.isResizing = true;
      this.resizeHandle = Math.abs(y - minY) < edgeThreshold ? "top" : "bottom";
      this.initialCropY = this.cropY;
      this.initialCropSize = this.cropSize;
      this.dragStartY = y;
      return;
    }

    if (onEdgeV && y > minY && y < maxY) {
      this.isResizing = true;
      this.resizeHandle = Math.abs(x - minX) < edgeThreshold ? "left" : "right";
      this.initialCropX = this.cropX;
      this.initialCropSize = this.cropSize;
      this.dragStartX = x;
      return;
    }

    if (x > minX && x < maxX && y > minY && y < maxY) {
      this.isDragging = true;
      this.initialCropX = this.cropX;
      this.initialCropY = this.cropY;
      this.dragStartX = x;
      this.dragStartY = y;
    }
  }

  onMouseMove(event: MouseEvent) {
    this.handleMove(event.clientX, event.clientY);
  }

  onTouchMove(event: TouchEvent) {
    event.preventDefault();
    const touch = event.touches[0];
    this.handleMove(touch.clientX, touch.clientY);
  }

  private handleMove(clientX: number, clientY: number) {
    if (!this.isDragging && !this.isResizing) return;

    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

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

      switch (this.resizeHandle) {
        case "br":
          this.resizeFromBR(dx, dy);
          break;
        case "bl":
          this.resizeFromBR(-dx, dy, true);
          break;
        case "tr":
          this.resizeFromBR(dx, -dy, false, true);
          break;
        case "tl":
          this.resizeFromBR(-dx, -dy, true, true);
          break;
        case "top":
          this.resizeFromEdge(0, dy, "top");
          break;
        case "bottom":
          this.resizeFromEdge(0, dy, "bottom");
          break;
        case "left":
          this.resizeFromEdge(dx, 0, "left");
          break;
        case "right":
          this.resizeFromEdge(dx, 0, "right");
          break;
      }
    }

    this.redrawCanvas();
  }

  private resizeFromBR(dx: number, dy: number, flipX = false, flipY = false) {
    let newSize = this.initialCropSize + Math.max(dx, dy);
    newSize = Math.max(50, Math.min(newSize, this.maxCropSize));

    this.cropSize = newSize;
    if (flipX) this.cropX = this.initialCropX - (newSize - this.initialCropSize);
    if (flipY) this.cropY = this.initialCropY - (newSize - this.initialCropSize);
  }

  private resizeFromEdge(dx: number, dy: number, edge: string) {
    const minSize = 50;
    let newX = this.initialCropX;
    let newY = this.initialCropY;
    let newSize = this.initialCropSize;

    if (edge === "left") {
      newSize = Math.max(
        minSize,
        Math.min(this.initialCropSize - dx, this.canvasWidth - this.initialCropX)
      );
      newX = this.initialCropX + (this.initialCropSize - newSize);
    } else if (edge === "right") {
      newSize = Math.max(
        minSize,
        Math.min(this.initialCropSize + dx, this.canvasWidth - this.initialCropX)
      );
    } else if (edge === "top") {
      newSize = Math.max(
        minSize,
        Math.min(this.initialCropSize - dy, this.canvasHeight - this.initialCropY)
      );
      newY = this.initialCropY + (this.initialCropSize - newSize);
    } else if (edge === "bottom") {
      newSize = Math.max(
        minSize,
        Math.min(this.initialCropSize + dy, this.canvasHeight - this.initialCropY)
      );
    }

    newSize = Math.max(minSize, Math.min(newSize, this.maxCropSize));

    this.cropX = Math.max(0, Math.min(newX, this.canvasWidth - newSize));
    this.cropY = Math.max(0, Math.min(newY, this.canvasHeight - newSize));
    this.cropSize = newSize;
  }

  onMouseUp() {
    this.isDragging = false;
    this.isResizing = false;
    this.resizeHandle = "";
  }

  onCrop() {
    if (!this.img) return;

    const scaleX = this.img.width / this.canvasWidth;
    const scaleY = this.img.height / this.canvasHeight;

    const srcX = Math.round(this.cropX * scaleX);
    const srcY = Math.round(this.cropY * scaleY);
    const srcSize = Math.round(this.cropSize * scaleX);

    const safeX = Math.max(0, Math.min(srcX, this.img.width - 1));
    const safeY = Math.max(0, Math.min(srcY, this.img.height - 1));
    const safeSize = Math.min(srcSize, this.img.width - safeX, this.img.height - safeY);

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
      this.cropped.emit(this.imageSource);
    }
  }

  onCancel() {
    this.cancelled.emit();
  }
}
