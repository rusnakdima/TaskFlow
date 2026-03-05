/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-search",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule],
  templateUrl: "./search.component.html",
})
export class SearchComponent implements OnInit {
  constructor() {}
  @Input() tempArray: Array<any> = [];
  @Input() searchByFields: Array<any> = [];
  @Input() isShowSearchField: boolean = false;
  @Output() array: EventEmitter<Array<any>> = new EventEmitter<Array<any>>();

  searchField: string = "";

  ngOnInit() {
    document.addEventListener("keydown", (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        document.getElementById("searchField") == document.activeElement
      ) {
        this.isShowSearchField = false;
      }
      if (event.ctrlKey && event.key === "k") {
        event.preventDefault();
        this.setFocusField();
      }
    });
  }

  setFocusField() {
    this.isShowSearchField = true;
    setTimeout(() => {
      const searchField = document.getElementById("searchField");
      if (searchField) {
        searchField.focus();
      }
    }, 100);
  }

  searchFunc() {
    const tempArr = this.searchField.split(" ").filter((t) => t.length > 0);

    const results = this.tempArray.filter((item: any) => {
      if (this.searchField !== "") {
        return tempArr.every((term: any) => {
          if (this.searchByFields.length > 0) {
            return this.searchByFields.some((field: any) => {
              return this.fuzzyMatchInField(item, field, term);
            });
          } else {
            return this.fuzzyMatchInItem(item, term);
          }
        });
      }
      return true;
    });

    this.array.next(results);
  }

  private fuzzyMatchInField(item: any, field: string, term: string): boolean {
    const value = this.getValueObj(item, field);
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        return value.some((v: any) => {
          if (typeof v !== "object") {
            return this.fuzzyMatch(String(v).toLowerCase(), term.toLowerCase());
          }
          return false;
        });
      } else if (value !== null) {
        return Object.values(value).some((v: any) => {
          if (typeof v !== "object") {
            return this.fuzzyMatch(String(v).toLowerCase(), term.toLowerCase());
          } else if (Array.isArray(v)) {
            return v.some((arrVal: any) => {
              if (typeof arrVal !== "object") {
                return this.fuzzyMatch(String(arrVal).toLowerCase(), term.toLowerCase());
              }
              return false;
            });
          }
          return false;
        });
      }
      return false;
    }
    return this.fuzzyMatch(String(value).toLowerCase(), term.toLowerCase());
  }

  private fuzzyMatchInItem(item: any, term: string): boolean {
    return Object.keys(item).some((key) => {
      const value = (item as any)[key];
      if (typeof value === "object") {
        if (Array.isArray(value)) {
          return value.some((v: any) => {
            if (typeof v !== "object") {
              return this.fuzzyMatch(String(v).toLowerCase(), term.toLowerCase());
            }
            return false;
          });
        } else if (value !== null) {
          return Object.values(value).some((v: any) => {
            if (typeof v !== "object") {
              return this.fuzzyMatch(String(v).toLowerCase(), term.toLowerCase());
            } else if (Array.isArray(v)) {
              return v.some((arrVal: any) => {
                if (typeof arrVal !== "object") {
                  return this.fuzzyMatch(String(arrVal).toLowerCase(), term.toLowerCase());
                }
                return false;
              });
            }
            return false;
          });
        }
        return false;
      }
      return this.fuzzyMatch(String(value).toLowerCase(), term.toLowerCase());
    });
  }

  private fuzzyMatch(text: string, pattern: string): boolean {
    if (!pattern) return true;
    if (!text) return false;

    if (text.includes(pattern)) {
      return true;
    }

    const patternChars = pattern.split("");
    let patternIdx = 0;

    for (let i = 0; i < text.length && patternIdx < patternChars.length; i++) {
      if (text[i] === patternChars[patternIdx]) {
        patternIdx++;
      }
    }

    return patternIdx === patternChars.length;
  }

  getValueObj(record: any, field: string) {
    const arr = field.split(".");
    let val = record;
    arr.forEach((elem: string) => {
      if (val[elem]) {
        val = val[elem];
      }
    });
    if (typeof val === "object") {
      return "";
    }
    return val;
  }
}
