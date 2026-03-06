import { Component, OnDestroy, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { ShortcutService } from "@services/shortcut.service";
import { Subscription } from "rxjs";

@Component({
  selector: "app-shortcut-help",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    @if (isVisible()) {
      <div
        class="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        (click)="close()"
      >
        <div
          class="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-700 w-full max-w-lg overflow-hidden animate-slideInUp"
          (click)="$event.stopPropagation()"
        >
          <div
            class="p-6 border-b border-gray-100 dark:border-zinc-700 flex items-center justify-between bg-gray-50 dark:bg-zinc-800/50"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center"
              >
                <mat-icon class="text-blue-600 dark:text-blue-400" fontIcon="keyboard" />
              </div>
              <div>
                <h3 class="text-xl font-bold textNormal">Keyboard Shortcuts</h3>
                <p class="text-sm textMuted">Speed up your workflow</p>
              </div>
            </div>
            <button
              (click)="close()"
              class="p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
            >
              <mat-icon class="textMuted" fontIcon="close" />
            </button>
          </div>

          <div class="p-6 max-h-[70vh] overflow-y-auto">
            <div class="space-y-6">
              <div>
                <h4
                  class="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3"
                >
                  Global Actions
                </h4>
                <div class="space-y-3">
                  <ng-container
                    *ngTemplateOutlet="
                      shortcutRow;
                      context: { keys: ['Ctrl', 'S'], desc: 'Save current form' }
                    "
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="
                      shortcutRow;
                      context: { keys: ['Ctrl', 'Shift', 'S'], desc: 'Sync data' }
                    "
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="
                      shortcutRow;
                      context: { keys: ['Ctrl', 'K'], desc: 'Command Palette' }
                    "
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="
                      shortcutRow;
                      context: { keys: ['Alt', 'Backspace'], desc: 'Go back' }
                    "
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="
                      shortcutRow;
                      context: { keys: ['Escape'], desc: 'Close menu/help' }
                    "
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="
                      shortcutRow;
                      context: { keys: ['Alt', 'Shift', 'N'], desc: 'Create New (Context-aware)' }
                    "
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="
                      shortcutRow;
                      context: { keys: ['?'], desc: 'Show this help' }
                    "
                  ></ng-container>
                </div>
              </div>

              <div>
                <h4
                  class="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-3"
                >
                  Navigation (Alt + Key)
                </h4>
                <div class="space-y-3">
                  <ng-container
                    *ngTemplateOutlet="shortcutRow; context: { keys: ['Alt', 'H'], desc: 'Dashboard' }"
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="shortcutRow; context: { keys: ['Alt', 'P'], desc: 'Projects' }"
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="shortcutRow; context: { keys: ['Alt', 'T'], desc: 'Tasks' }"
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="shortcutRow; context: { keys: ['Alt', 'K'], desc: 'Kanban Board' }"
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="shortcutRow; context: { keys: ['Alt', 'C'], desc: 'Categories' }"
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="shortcutRow; context: { keys: ['Alt', 'S'], desc: 'Statistics' }"
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="shortcutRow; context: { keys: ['Alt', 'Y'], desc: 'Sync' }"
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="shortcutRow; context: { keys: ['Alt', 'G'], desc: 'Shared Tasks' }"
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="shortcutRow; context: { keys: ['Alt', 'L'], desc: 'Calendar' }"
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="shortcutRow; context: { keys: ['Alt', 'U'], desc: 'Profile' }"
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="shortcutRow; context: { keys: ['Alt', 'A'], desc: 'About' }"
                  ></ng-container>
                  <ng-container
                    *ngTemplateOutlet="
                      shortcutRow;
                      context: { keys: ['/'], desc: 'Focus search bar' }
                    "
                  ></ng-container>
                </div>
              </div>
            </div>
          </div>

          <div
            class="p-4 bg-gray-50 dark:bg-zinc-800/50 text-center text-xs textMuted border-t border-gray-100 dark:border-zinc-700"
          >
            Press any key or click outside to close
          </div>
        </div>
      </div>
    }

    <ng-template #shortcutRow let-keys="keys" let-desc="desc">
      <div class="flex items-center justify-between py-1">
        <span class="text-sm textNormal">{{ desc }}</span>
        <div class="flex items-center gap-1">
          @for (key of keys; track key) {
            <kbd
              class="px-2 py-1 text-xs text-gray-800 bg-gray-100 border border-gray-300 rounded-lg shadow-sm dark:bg-zinc-700 dark:text-zinc-100 dark:border-zinc-500 min-w-[2.5rem] text-center"
            >
              {{ key }}
            </kbd>
            @if (!$last) {
              <span class="text-xs textMuted">+</span>
            }
          }
        </div>
      </div>
    </ng-template>
  `,
  styles: [
    `
      @keyframes slideInUp {
        from {
          transform: translateY(20px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      .animate-slideInUp {
        animation: slideInUp 0.3s ease-out forwards;
      }
    `,
  ],
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
