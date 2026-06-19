import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { PageSearchConfig, DEFAULT_EXCLUDE_FIELDS } from "@entities/page-search.model";

@Component({
  selector: "app-page-search",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./page-search.component.html",
  styles: [
    `
      .page-search-container {
        padding: 0.75rem 1rem;
        border-bottom: 1px solid rgb(229 231 235);
      }

      :host-context(.dark) .page-search-container {
        border-bottom-color: rgb(64 64 64);
      }

      .page-search-input {
        width: 100%;
        border-radius: 0.5rem;
        border: 1px solid rgb(209 213 219);
        background: white;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        color: var(--text-color, #374151);
        outline: none;
        transition:
          border-color 0.2s,
          box-shadow 0.2s;
      }

      .page-search-input:focus {
        border-color: var(--accent-color, #3b82f6);
        box-shadow: 0 0 0 2px var(--accent-color, #3b82f6);
      }

      :host-context(.dark) .page-search-input {
        background: rgb(63 63 66);
        border-color: rgb(82 82 85);
        color: rgb(228 228 231);
      }

      :host-context(.dark) .page-search-input::placeholder {
        color: rgb(164 164 168);
      }
    `,
  ],
})
export class PageSearchComponent implements OnChanges {
  @Input() data: any[] = [];
  @Input() config: PageSearchConfig | null = null;
  @Input() searchQuery: string = "";

  @Output() filteredDataChange = new EventEmitter<any[] | undefined>();
  @Output() searchQueryChange = new EventEmitter<string>();

  onSearchChange(newValue: string): void {
    this.searchQuery = newValue;
    this.searchQueryChange.emit(this.searchQuery);
    this.performSearch();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["data"] || changes["config"]) {
      this.performSearch();
    }
  }

  private performSearch(): void {
    if (!this.config?.includeFields?.length) {
      this.filteredDataChange.emit(undefined);
      return;
    }

    if (!this.searchQuery.trim()) {
      this.filteredDataChange.emit(undefined);
      return;
    }

    if (!this.data || this.data.length === 0) {
      this.filteredDataChange.emit(undefined);
      return;
    }

    const excludeFields = new Set([
      ...DEFAULT_EXCLUDE_FIELDS,
      ...(this.config?.excludeFields || []),
    ]);

    const query = this.searchQuery.toLowerCase().trim();
    const includeFields = this.config!.includeFields;

    const filtered = this.data.filter((item) => {
      return includeFields.some((field) => {
        if (excludeFields.has(field)) return false;
        const value = item[field];
        if (value == null) return false;
        return String(value).toLowerCase().includes(query);
      });
    });

    this.filteredDataChange.emit(filtered);
  }
}
