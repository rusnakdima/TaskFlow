import { Injectable, NgZone, OnDestroy, signal } from "@angular/core";
import { toObservable } from "@angular/core/rxjs-interop";
import { Router, NavigationEnd } from "@angular/router";
import { Location } from "@angular/common";
import { filter, Subscription, skip } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class ShortcutService implements OnDestroy {
  private readonly _saveSignal = signal<number>(0);
  private readonly _helpSignal = signal<number>(0);
  private readonly _closeSignal = signal<number>(0);
  private readonly _syncSignal = signal<number>(0);
  private readonly _refreshSignal = signal<number>(0);
  private readonly _filterSignal = signal<number>(0);
  private readonly _submitFormSignal = signal<number>(0);
  private readonly _createCategorySignal = signal<number>(0);
  private readonly _focusSearchSignal = signal<number>(0);

  private _counter = 0;

  saveSignal = this._saveSignal.asReadonly();
  helpSignal = this._helpSignal.asReadonly();
  closeSignal = this._closeSignal.asReadonly();
  syncSignal = this._syncSignal.asReadonly();
  refreshSignal = this._refreshSignal.asReadonly();
  filterSignal = this._filterSignal.asReadonly();
  submitFormSignal = this._submitFormSignal.asReadonly();
  createCategorySignal = this._createCategorySignal.asReadonly();
  focusSearchSignal = this._focusSearchSignal.asReadonly();

  help$ = toObservable(this._helpSignal).pipe(skip(1));
  sync$ = toObservable(this._syncSignal).pipe(skip(1));
  close$ = toObservable(this._closeSignal).pipe(skip(1));
  refresh$ = toObservable(this._refreshSignal).pipe(skip(1));
  filter$ = toObservable(this._filterSignal).pipe(skip(1));
  save$ = toObservable(this._saveSignal).pipe(skip(1));
  createCategory$ = toObservable(this._createCategorySignal).pipe(skip(1));
  focusSearch$ = toObservable(this._focusSearchSignal).pipe(skip(1));

  showHelp(): void {
    this._helpSignal.set(++this._counter);
  }

  focusSearch(): void {
    this._focusSearchSignal.set(++this._counter);
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
        this.zone.run(() => this._closeSignal.set(++this._counter));
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
        this.zone.run(() => this._saveSignal.set(++this._counter));
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        this.zone.run(() => this._syncSignal.set(++this._counter));
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "r") {
        event.preventDefault();
        this.zone.run(() => this._refreshSignal.set(++this._counter));
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "f") {
        event.preventDefault();
        this.zone.run(() => this._filterSignal.set(++this._counter));
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
          this.zone.run(() => this._focusSearchSignal.set(++this._counter));
          return;
        }

        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "c") {
          event.preventDefault();
          this.zone.run(() => this.router.navigate(["/chat"]));
          return;
        }

        if (event.key === "F1") {
          event.preventDefault();
          this.zone.run(() => this._helpSignal.set(++this._counter));
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
        this._createCategorySignal.set(++this._counter);
      });
      return;
    }

    this.router.navigate(["/todos/create_todo"]);
  }
}
