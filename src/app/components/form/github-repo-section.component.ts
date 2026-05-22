import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatRadioModule } from "@angular/material/radio";
import { FormsModule } from "@angular/forms";
import { GithubRepo as GithubRepoModel } from "@models/github.model";

export { GithubRepoModel as GithubRepo };

@Component({
  selector: "app-github-repo-section",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatRadioModule, FormsModule],
  templateUrl: "./github-repo-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GithubRepoSectionComponent {
  @Input() repos: GithubRepoModel[] = [];
  @Input() selectedRepoId: number | null = null;
  @Input() connected = false;
  @Input() searchQuery = "";
  @Input() disabled = false;
  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() repoChange = new EventEmitter<number | null>();

  get filteredRepos(): GithubRepoModel[] {
    if (!this.searchQuery) return this.repos;
    const query = this.searchQuery.toLowerCase();
    return this.repos.filter((r) => r.full_name.toLowerCase().includes(query));
  }
}
