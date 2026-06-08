import {
  Component,
  Input,
  ChangeDetectionStrategy,
  forwardRef,
  signal,
  Output,
  EventEmitter,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatRadioModule } from "@angular/material/radio";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { GithubRepo as GithubRepoModel } from "@models/github.model";

export { GithubRepoModel as GithubRepo };

export interface GithubRepoValue {
  repoId: number | null;
  searchQuery: string;
}

@Component({
  selector: "app-github-repo-section",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatRadioModule],
  templateUrl: "./github-repo-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => GithubRepoSectionComponent),
      multi: true,
    },
  ],
})
export class GithubRepoSectionComponent implements ControlValueAccessor {
  @Input() repos: GithubRepoModel[] = [];
  @Input() connected = false;
  @Input() disabled = false;

  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() repoChange = new EventEmitter<{ repoId: number | null; searchQuery: string }>();

  @Input()
  get selectedRepoId(): number | null {
    return this._selectedRepoId();
  }
  set selectedRepoId(value: number | null) {
    this._selectedRepoId.set(value);
  }

  @Input()
  get searchQuery(): string {
    return this._searchQuery();
  }
  set searchQuery(value: string) {
    this._searchQuery.set(value);
  }

  @Input()
  get filteredRepos(): GithubRepoModel[] {
    const query = this._searchQuery().toLowerCase();
    if (!query) return this.repos;
    return this.repos.filter((r) => r.full_name.toLowerCase().includes(query));
  }

  private _searchQuery = signal("");
  private _selectedRepoId = signal<number | null>(null);

  private onChange: (value: GithubRepoValue) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(obj: GithubRepoValue): void {
    if (obj) {
      this._selectedRepoId.set(obj.repoId ?? null);
      this._searchQuery.set(obj.searchQuery ?? "");
    }
  }

  registerOnChange(fn: (value: GithubRepoValue) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onSearchQueryChange(value: string): void {
    this._searchQuery.set(value);
    this.searchQueryChange.emit(value);
    this.emitChange();
  }

  clearSearch(): void {
    this._searchQuery.set("");
    this.emitChange();
  }

  onRepoChange(repoId: number | null): void {
    this._selectedRepoId.set(repoId);
    const repoData = { repoId, searchQuery: this._searchQuery() };
    this.repoChange.emit(repoData);
    this.emitChange();
  }

  private emitChange(): void {
    this.onChange({
      repoId: this._selectedRepoId(),
      searchQuery: this._searchQuery(),
    });
    this.onTouched();
  }
}
