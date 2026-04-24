import { Injectable } from "@angular/core";
import { Router, NavigationEnd } from "@angular/router";
import { Location } from "@angular/common";
import { filter } from "rxjs";
import { ShortcutEmittersService } from "./shortcut-emitters.service";

@Injectable({
  providedIn: "root",
})
export class NavigationContextService {
  private currentUrl = "";

  constructor(
    private router: Router,
    private location: Location,
    private emitters: ShortcutEmittersService
  ) {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.currentUrl = event.urlAfterRedirects;
      });
  }

  emitSave(): void {
    this.emitters.emitSave();
  }

  emitHelp(): void {
    this.emitters.emitHelp();
  }

  emitClose(): void {
    this.emitters.emitClose();
  }

  emitSync(): void {
    this.emitters.emitSync();
  }

  emitRefresh(): void {
    this.emitters.emitRefresh();
  }

  handleNewAction(): void {
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

    this.router.navigate(["/todos/create_todo"]);
  }
}
