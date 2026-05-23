import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-user-avatar",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    @if (src && src.trim() !== "") {
      <img [ngClass]="imgClasses" [src]="src" [alt]="name" (error)="onImageError($event)" />
    } @else if (showGroupIcon) {
      <div [ngClass]="divClasses">
        <mat-icon [ngClass]="iconClasses">group</mat-icon>
      </div>
    } @else {
      <div [ngClass]="divClasses">
        <span [ngClass]="textClasses">{{ initials }}</span>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAvatarComponent {
  @Input() src: string | null | undefined = null;
  @Input() name: string = "";
  @Input() size: "sm" | "md" | "lg" | "xl" = "md";
  @Input() showGroupIcon: boolean = false;

  defaultSrc = "assets/images/user.png";

  get initials(): string {
    if (!this.name) return "?";
    const parts = this.name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return this.name.charAt(0).toUpperCase();
  }

  get dimensionClasses(): string {
    switch (this.size) {
      case "sm":
        return "h-8 w-8";
      case "md":
        return "h-9 w-9";
      case "lg":
        return "h-11 w-11";
      case "xl":
        return "h-16 w-16";
    }
  }

  get roundedClasses(): string {
    switch (this.size) {
      case "sm":
        return "rounded-full";
      case "md":
        return "rounded-full";
      case "lg":
        return "rounded-xl";
      case "xl":
        return "rounded-2xl";
    }
  }

  get divClasses(): string {
    return `${this.dimensionClasses} ${this.roundedClasses} flex items-center justify-center bg-[var(--accent-color)]/20 dark:bg-[var(--accent-color)]/30`;
  }

  get textClasses(): string {
    switch (this.size) {
      case "sm":
        return "text-[10px] font-medium text-[var(--accent-color)] dark:text-[var(--accent-300)]";
      case "md":
        return "text-xs font-medium text-[var(--accent-color)] dark:text-[var(--accent-300)]";
      case "lg":
        return "text-sm font-medium text-[var(--accent-color)] dark:text-[var(--accent-300)]";
      case "xl":
        return "text-lg font-medium text-[var(--accent-color)] dark:text-[var(--accent-300)]";
    }
  }

  get iconClasses(): string {
    switch (this.size) {
      case "sm":
        return "!h-4 !w-4 text-[var(--accent-color)] dark:text-[var(--accent-300)]";
      case "md":
        return "!h-5 !w-5 text-[var(--accent-color)] dark:text-[var(--accent-300)]";
      case "lg":
        return "!h-6 !w-6 text-[var(--accent-color)] dark:text-[var(--accent-300)]";
      case "xl":
        return "!h-8 !w-8 text-[var(--accent-color)] dark:text-[var(--accent-300)]";
    }
  }

  get imgClasses(): string {
    return `${this.dimensionClasses} ${this.roundedClasses} object-cover`;
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = this.defaultSrc;
  }
}
