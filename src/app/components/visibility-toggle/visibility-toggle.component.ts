import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-visibility-toggle",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./visibility-toggle.component.html",
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
