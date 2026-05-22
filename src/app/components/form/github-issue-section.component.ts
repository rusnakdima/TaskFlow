import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-github-issue-section",
  standalone: true,
  imports: [CommonModule, CheckboxComponent],
  templateUrl: "./github-issue-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GithubIssueSectionComponent {
  @Input() checked = false;
  @Output() checkedChange = new EventEmitter<boolean>();
}
