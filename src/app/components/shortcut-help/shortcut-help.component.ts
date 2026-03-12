import { Component, OnDestroy, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { ShortcutService } from "@services/ui/shortcut.service";
import { Subscription } from "rxjs";

@Component({
  selector: "app-shortcut-help",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./shortcut-help.component.html",
  styleUrl: "./shortcut-help.component.css",
})
export class ShortcutHelpComponent implements OnInit, OnDestroy {
  isVisible = signal(false);
  private closeSubscription: Subscription | null = null;

  constructor(private shortcutService: ShortcutService) {}

  ngOnInit() {
    this.closeSubscription = this.shortcutService.close$.subscribe(() => {
      this.close();
    });
  }

  ngOnDestroy() {
    this.closeSubscription?.unsubscribe();
  }

  show() {
    this.isVisible.set(true);
  }

  close() {
    this.isVisible.set(false);
  }
}
