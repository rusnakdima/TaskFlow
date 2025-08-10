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
  @Output() array: EventEmitter<Array<any>> = new EventEmitter<Array<any>>();

  searchField: string = "";

  isShowSearchField: boolean = false;

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
      document.getElementById("searchField")!.focus();
    }, 100);
  }

  searchFunc() {
    const tempArr = this.searchField.split(" ");
    this.array.next(
      this.tempArray.filter((item: any) => {
        if (this.searchField !== "") {
          return tempArr.every((term: any) => {
            if (this.searchByFields.length > 0) {
              return this.searchByFields.some((field: any) => {
                if (typeof this.getValueObj(item, field) !== "object") {
                  return String(this.getValueObj(item, field))
                    .toLowerCase()
                    .includes(term.toLowerCase());
                } else if (Array.isArray(this.getValueObj(item, field))) {
                  (this.getValueObj(item, field) as Array<any>).some((value: any) => {
                    if (typeof value !== "object") {
                      return String(value).toLowerCase().includes(term.toLowerCase());
                    }
                    return false;
                  });
                } else if (typeof this.getValueObj(item, field) === "object") {
                  return Object.values(this.getValueObj(item, field)).some((value: any) => {
                    if (typeof value !== "object") {
                      return String(value).toLowerCase().includes(term.toLowerCase());
                    } else if (Array.isArray(value)) {
                      (value as Array<any>).some((value: any) => {
                        if (typeof value !== "object") {
                          return String(value).toLowerCase().includes(term.toLowerCase());
                        }
                        return false;
                      });
                    }
                    return false;
                  });
                }
                return false;
              });
            } else {
              return Object.values(item).some((value: any) => {
                if (typeof value !== "object") {
                  return String(value).toLowerCase().includes(term.toLowerCase());
                } else if (Array.isArray(value)) {
                  (value as Array<any>).some((value: any) => {
                    if (typeof value !== "object") {
                      return String(value).toLowerCase().includes(term.toLowerCase());
                    }
                    return false;
                  });
                } else if (typeof value === "object") {
                  return Object.values(value).some((value: any) => {
                    if (typeof value !== "object") {
                      return String(value).toLowerCase().includes(term.toLowerCase());
                    } else if (Array.isArray(value)) {
                      (value as Array<any>).some((value: any) => {
                        if (typeof value !== "object") {
                          return String(value).toLowerCase().includes(term.toLowerCase());
                        }
                        return false;
                      });
                    }
                    return false;
                  });
                }
                return false;
              });
            }
          });
        }
        return true;
      })
    );
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
