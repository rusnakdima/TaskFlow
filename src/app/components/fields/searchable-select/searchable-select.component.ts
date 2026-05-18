import { CommonModule } from "@angular/common";
import { Component, Input, Output, EventEmitter, signal, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatInputModule } from "@angular/material/input";
import { MatIconModule } from "@angular/material/icon";
import { FilterOption } from "@models/filter-config.model";

@Component({
  selector: "app-searchable-select",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatIconModule,
  ],
  templateUrl: "./searchable-select.component.html",
  styleUrls: ["./searchable-select.component.scss"],
})
export class SearchableSelectComponent {
  @Input() value: string = "";
  @Input() options: FilterOption[] = [];
  @Input() placeholder: string = "";
  @Input() label: string = "";

  @Output() valueChange = new EventEmitter<string>();

  searchQuery = signal("");

  filteredOptions = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) {
      return this.options;
    }
    return this.options.filter((opt) => opt.label.toLowerCase().includes(query));
  });

  visibleOptions = computed(() => {
    return this.filteredOptions();
  });

  onSearchChange(query: string): void {
    this.searchQuery.set(query);
  }

  onSelectionChange(value: string): void {
    this.value = value;
    this.valueChange.emit(value);
    this.searchQuery.set("");
  }

  trackByValue(_index: number, option: FilterOption): string {
    return option.value;
  }
}
