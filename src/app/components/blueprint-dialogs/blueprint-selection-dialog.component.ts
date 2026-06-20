import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { TemplateService } from "@services/features/template.service";
@Component({
  selector: "app-blueprint-selection-dialog",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: "./blueprint-selection-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlueprintSelectionDialogComponent {
  @Input() show = false;
  @Input() templates: any[] = [];
  @Output() templateSelected = new EventEmitter<any>();
  @Output() templateRemoved = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();
  templateService = inject(TemplateService);
  openApplyBlueprint(template: any) {
    this.templateSelected.emit(template);
  }
  removeBlueprint(id: string) {
    this.templateRemoved.emit(id);
  }
  closeDialog() {
    this.closed.emit();
  }
  getSubtasksCount(template: any): number {
    return (
      template.tasks?.reduce((acc: number, task: any) => acc + (task.subtasks?.length || 0), 0) || 0
    );
  }
}
