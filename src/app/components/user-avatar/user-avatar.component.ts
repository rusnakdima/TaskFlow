import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
  selector: "app-user-avatar",
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (src) {
      <img
        [ngClass]="imgClasses"
        [src]="src"
        [alt]="name"
        onerror="this.src = 'https://placehold.co/100x100/6366f1/ffffff?text=?'"
      />
    } @else {
      <div [ngClass]="fallbackClasses">
        {{ initials }}
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAvatarComponent {
  @Input() src: string | null | undefined = null;
  @Input() name: string = "";
  @Input() size: "sm" | "md" | "lg" | "xl" = "md";

  get initials(): string {
    return (this.name?.charAt(0) || "?").toUpperCase();
  }

  get dimensionClasses(): string {
    switch (this.size) {
      case "sm":
        return "h-5 w-5";
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

  get imgClasses(): string {
    return `${this.dimensionClasses} ${this.roundedClasses} object-cover`;
  }

  get fallbackClasses(): string {
    return `${this.dimensionClasses} ${this.roundedClasses} flex items-center justify-center bg-[var(--accent-100)] font-semibold text-[var(--accent-600)] dark:bg-[var(--accent-900)]/30 dark:text-[var(--accent-400)]`;
  }
}
