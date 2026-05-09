import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ConfirmDialogService } from "@services/core/confirm-dialog.service";

@Component({
  selector: "app-confirm-dialog",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./confirm-dialog.component.html",
})
export class ConfirmDialogComponent {
  confirmService = inject(ConfirmDialogService);

  onBackdropClick(): void {
    this.confirmService.resolve(false);
  }
}
