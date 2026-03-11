import { Injectable, NgZone } from "@angular/core";
import { Router, NavigationEnd } from "@angular/router";
import { Location } from "@angular/common";
import { Subject, filter } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class ShortcutService {
  private saveSubject = new Subject<void>();
  save$ = this.saveSubject.asObservable();

  private helpSubject = new Subject<void>();
  help$ = this.helpSubject.asObservable();

  private closeSubject = new Subject<void>();
  close$ = this.closeSubject.asObservable();

  private syncSubject = new Subject<void>();
  sync$ = this.syncSubject.asObservable();

  private currentUrl = "";

  constructor(
    private router: Router,
    private location: Location,
    private zone: NgZone
  ) {
    this.initGlobalListeners();
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.currentUrl = event.urlAfterRedirects;
      });
  }

  private initGlobalListeners() {
    window.addEventListener("keydown", (event: KeyboardEvent) => {
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(
        (event.target as HTMLElement).tagName
      );

      // 1. Escape: Close open things (modals, menus)
      if (event.key === "Escape") {
        // We emit to closeSubject so App or help component can handle it
        this.zone.run(() => this.closeSubject.next());
        // Note: Material menus handle Escape themselves, but our help modal needs this.
        return;
      }

      // 2. Back Action (dedicated key): Alt + Backspace or Alt + ArrowLeft
      if (
        (event.altKey && event.key === "Backspace") ||
        (event.altKey && event.key === "ArrowLeft")
      ) {
        event.preventDefault();
        this.zone.run(() => this.location.back());
        return;
      }

      // 3. Ctrl + S (Save) - works even in inputs
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        this.zone.run(() => this.saveSubject.next());
        return;
      }

      // 4. Ctrl + Shift + S (Sync)
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        this.zone.run(() => this.syncSubject.next());
        return;
      }

      // 5. Alt + Shift + N (Context-aware New Action)
      if (event.altKey && event.shiftKey && event.key === "N") {
        event.preventDefault();
        this.zone.run(() => this.handleNewAction());
        return;
      }

      // Shortcuts that should NOT trigger when typing in inputs
      if (!isInput) {
        // ? (Help)
        if (event.key === "?" || event.key === "і") {
          // Support some layouts
          event.preventDefault();
          this.zone.run(() => this.helpSubject.next());
        }

        // / (Search focus)
        if (event.key === "/") {
          event.preventDefault();
          const searchInput = document.querySelector(
            'input[placeholder*="Search"]'
          ) as HTMLInputElement;
          if (searchInput) {
            searchInput.focus();
          }
        }

        // Alt + Letter shortcuts for quick navigation (only when Alt is pressed)
        const key = event.key.toLowerCase();
        const isModKey = event.ctrlKey || event.metaKey;

        if (event.altKey && !event.shiftKey && !isModKey) {
          switch (key) {
            case "h":
              // Alt + H -> Home/Dashboard
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/dashboard"]));
              break;
            case "p":
              // Alt + P -> Projects
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/todos"]));
              break;
            case "t":
              // Alt + T -> Tasks
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/todos"]));
              break;
            case "c":
              // Alt + C -> Categories
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/categories"]));
              break;
            case "k":
              // Alt + K -> Kanban
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/kanban"]));
              break;
            case "s":
              // Alt + S -> Stats
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/stats"]));
              break;
            case "y":
              // Alt + Y -> Sync
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/sync"]));
              break;
            case "g":
              // Alt + G -> Shared (Groups)
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/shared-tasks"]));
              break;
            case "a":
              // Alt + A -> About
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/about"]));
              break;
            case "l":
              // Alt + L -> Calendar
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/calendar"]));
              break;
            case "u":
              // Alt + U -> Profile (User)
              event.preventDefault();
              this.zone.run(() => this.router.navigate(["/profile"]));
              break;
          }
          return;
        }
      }
    });
  }

  private handleNewAction() {
    const url = this.currentUrl;

    // Regex to match context
    // 1. In subtasks list -> Create new subtask
    // /todos/:todoId/tasks/:taskId/subtasks
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

    // 2. In tasks list -> Create new task
    // /todos/:todoId/tasks
    const taskMatch = url.match(/\/todos\/([^\/]+)\/tasks/);
    if (taskMatch) {
      this.router.navigate(["/todos", taskMatch[1], "tasks", "create_task"]);
      return;
    }

    // 3. Default -> Create new todo
    this.router.navigate(["/todos/create_todo"]);
  }
}
