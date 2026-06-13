import { Injectable, NgZone, OnDestroy, signal } from "@angular/core";
import { Router, NavigationEnd } from "@angular/router";
import { Location } from "@angular/common";
import { filter, Subscription } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class ShortcutService implements OnDestroy {
  private readonly _saveSignal = signal<void>(undefined);
  private readonly _helpSignal = signal<void>(undefined);
  private readonly _closeSignal = signal<void>(undefined);
  private readonly _syncSignal = signal<void>(undefined);
  private readonly _refreshSignal = signal<void>(undefined);
  private readonly _filterSignal = signal<void>(undefined);
  private readonly _submitFormSignal = signal<void>(undefined);
  private readonly _createCategorySignal = signal<void>(undefined);
  private readonly _focusSearchSignal = signal<void>(undefined);

  saveSignal = this._saveSignal.asReadonly();
  helpSignal = this._helpSignal.asReadonly();
  closeSignal = this._closeSignal.asReadonly();
  syncSignal = this._syncSignal.asReadonly();
  refreshSignal = this._refreshSignal.asReadonly();
  filterSignal = this._filterSignal.asReadonly();
  submitFormSignal = this._submitFormSignal.asReadonly();
  createCategorySignal = this._createCategorySignal.asReadonly();
  focusSearchSignal = this._focusSearchSignal.asReadonly();

  showHelp(): void {
    this._helpSignal.set(undefined);
  }

  focusSearch(): void {
    this._focusSearchSignal.set(undefined);
  }

  private currentUrl = "";
  private routerSub: Subscription | null = null;
  private keydownHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor(
    private router: Router,
    private location: Location,
    private zone: NgZone
  ) {
    this.initGlobalListeners();
    this.routerSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.currentUrl = event.urlAfterRedirects;
      });
  }

  ngOnDestroy(): void {
    if (this.routerSub) {
      this.routerSub.unsubscribe();
    }
    if (this.keydownHandler) {
      window.removeEventListener("keydown", this.keydownHandler);
    }
  }

  private initGlobalListeners() {
    this.keydownHandler = (event: KeyboardEvent) => {
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(
        (event.target as HTMLElement).tagName
      );

      if (event.key === "Escape") {
        this.zone.run(() => this._closeSignal.set(undefined));
        return;
      }

      if (
        (event.altKey && event.key === "Backspace") ||
        (event.altKey && event.key === "ArrowLeft")
      ) {
        event.preventDefault();
        this.zone.run(() => this.location.back());
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        this.zone.run(() => this._saveSignal.set(undefined));
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        this.zone.run(() => this._syncSignal.set(undefined));
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "r") {
        event.preventDefault();
        this.zone.run(() => this._refreshSignal.set(undefined));
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "f") {
        event.preventDefault();
        this.zone.run(() => this._filterSignal.set(undefined));
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        this.zone.run(() => this.handleNewAction());
        return;
      }

      if (!isInput) {
        if ((event.ctrlKey || event.metaKey) && event.key === "k") {
          event.preventDefault();
          this.zone.run(() => this._focusSearchSignal.set(undefined));
          return;
        }

        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "c") {
          event.preventDefault();
          this.zone.run(() => this.router.navigate(["/chat"]));
          return;
        }

        if (event.key === "F1") {
          event.preventDefault();
          this.zone.run(() => this._helpSignal.set(undefined));
          return;
        }

        if (event.key === "/") {
          event.preventDefault();
          const searchInput = document.querySelector(
            'input[placeholder*="Search"]'
          ) as HTMLInputElement;
          if (searchInput) {
            searchInput.focus();
          }
        }

        const key = event.key.toLowerCase();
        const isModKey = event.ctrlKey || event.metaKey;

        if (event.altKey && !event.shiftKey && !isModKey) {
          switch (key) {
            case "h":
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/dashboard"]));
              break;
            case "p":
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/todos"]));
              break;
            case "t":
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/todos"]));
              break;
            case "c":
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/categories"]));
              break;
            case "s":
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/stats"]));
              break;
            case "y":
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/sync"]));
              break;
            case "a":
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/about"]));
              break;
            case "z":
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/archive"]));
              break;
            case "l":
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/calendar"]));
              break;
            case "u":
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/profile"]));
              break;
            case "m":
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/chat"]));
              break;
          }
          return;
        }
      }
    };
    window.addEventListener("keydown", this.keydownHandler);
  }

  private handleNewAction() {
    const url = this.currentUrl;

    const subtaskMatch = url.match(/\/todos\/([^\/]+)\/tasks\/([^\/]+)\/subtasks/);
    if (subtaskMatch) {
      this.router.navigate([
        "/todos",
        subtaskMatch[1],
        "tasks",
        subtaskMatch[2],
        "subtasks",
        "create_subtask",
      ]);
      return;
    }

    const taskMatch = url.match(/\/todos\/([^\/]+)\/tasks/);
    if (taskMatch) {
      this.router.navigate(["/todos", taskMatch[1], "tasks", "create_task"]);
      return;
    }

    if (url === "/categories") {
      this.zone.run(() => {
        this._createCategorySignal.set(undefined);
      });
      return;
    }

    this.router.navigate(["/todos/create_todo"]);
  }
}
