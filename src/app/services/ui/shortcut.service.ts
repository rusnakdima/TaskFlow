import { Injectable, NgZone, OnDestroy } from "@angular/core";
import { Router, NavigationEnd } from "@angular/router";
import { Location } from "@angular/common";
import { Subject, filter, Subscription } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class ShortcutService implements OnDestroy {
  private saveSubject = new Subject<void>();
  save$ = this.saveSubject.asObservable();

  private helpSubject = new Subject<void>();
  help$ = this.helpSubject.asObservable();

  private closeSubject = new Subject<void>();
  close$ = this.closeSubject.asObservable();

  private syncSubject = new Subject<void>();
  sync$ = this.syncSubject.asObservable();

  private refreshSubject = new Subject<void>();
  refresh$ = this.refreshSubject.asObservable();

  private createCategorySubject = new Subject<void>();
  createCategory$ = this.createCategorySubject.asObservable();

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
        this.zone.run(() => this.closeSubject.next());
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
        this.zone.run(() => this.saveSubject.next());
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        this.zone.run(() => this.syncSubject.next());
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "r") {
        event.preventDefault();
        this.zone.run(() => this.refreshSubject.next());
        return;
      }

      if (event.altKey && event.shiftKey && event.key === "N") {
        event.preventDefault();
        this.zone.run(() => this.handleNewAction());
        return;
      }

      if (!isInput) {
        if (event.key === "?" || event.key === "і") {
          event.preventDefault();
          this.zone.run(() => this.helpSubject.next());
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
            case "k":
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/kanban"]));
              break;
            case "s":
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/stats"]));
              break;
            case "y":
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/sync"]));
              break;
            case "g":
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/shared-tasks"]));
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
        this.createCategorySubject.next();
      });
      return;
    }

    this.router.navigate(["/todos/create_todo"]);
  }
}
