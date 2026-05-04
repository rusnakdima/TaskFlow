import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-visibility-toggle",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div
      class="hidden items-center rounded-lg border border-gray-300 p-1 lg:inline-flex dark:border-zinc-600"
    >
      @for (option of options; track option.key) {
        <button
          class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          [class.bg-blue-600]="active === option.key"
          [class.text-white]="active === option.key"
          [class.text-gray-700]="active !== option.key"
          [class.dark:text-gray-300]="active !== option.key"
          [class.hover:bg-gray-100]="active !== option.key"
          [class.dark:hover:bg-zinc-700]="active !== option.key"
          (click)="select.emit(option.key)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
})
export class VisibilityToggleComponent {
  @Input() options: { key: string; label: string; icon: string }[] = [
    { key: "all", label: "All", icon: "apps" },
    { key: "private", label: "Private", icon: "lock" },
    { key: "shared", label: "Shared", icon: "group" },
    { key: "public", label: "Public", icon: "public" },
  ];

  @Input() active = "all";

  @Output() select = new EventEmitter<string>();
}
