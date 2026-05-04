import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";

@Component({
  selector: "app-filter-sidebar",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  template: `
    @if (isOpen) {
      <div class="filter-sidebar-overlay" (click)="close()"></div>
    }
    <div class="filter-sidebar" [class.open]="isOpen">
      <div class="filter-sidebar-content">
        <ng-content select="[filter-header]"></ng-content>

        <div class="filter-sidebar-body">
          <ng-content></ng-content>
        </div>

        <ng-content select="[filter-actions]"></ng-content>
      </div>
    </div>
  `,
  styles: [
    `
      .filter-sidebar-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999;
        animation: fadeIn 0.2s ease-out;
      }

      .filter-sidebar {
        position: fixed;
        top: 0;
        right: -320px;
        width: 320px;
        max-width: 85vw;
        height: 100vh;
        background: white;
        z-index: 1000;
        box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
        transition: right 0.3s ease-in-out;
        overflow-y: auto;
      }

      :host-context(.dark) .filter-sidebar {
        background: rgb(39 39 42);
      }

      .filter-sidebar.open {
        right: 0;
      }

      .filter-sidebar-content {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 1.5rem;
      }

      .filter-sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 1rem;
        border-bottom: 1px solid rgb(229 231 235);
        margin-bottom: 1.5rem;
      }

      :host-context(.dark) .filter-sidebar-header {
        border-bottom-color: rgb(64 64 64);
      }

      .filter-sidebar-section {
        margin-bottom: 1.5rem;
      }

      .filter-sidebar-actions {
        margin-top: auto;
        padding-top: 1rem;
        border-top: 1px solid rgb(229 231 235);
        display: flex;
        gap: 0.5rem;
      }

      :host-context(.dark) .filter-sidebar-actions {
        border-top-color: rgb(64 64 64);
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @media (max-width: 640px) {
        .filter-sidebar {
          width: 100%;
          max-width: 100%;
        }
      }
    `,
  ],
})
export class FilterSidebarComponent {
  @Input() isOpen = false;
  @Input() title = "Filters";

  @Output() closeEvent = new EventEmitter<void>();
  @Output() clearEvent = new EventEmitter<void>();
  @Output() applyEvent = new EventEmitter<void>();

  close(): void {
    this.closeEvent.emit();
  }

  clearAll(): void {
    this.clearEvent.emit();
  }

  apply(): void {
    this.applyEvent.emit();
  }
}
