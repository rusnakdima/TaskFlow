import { Injectable } from "@angular/core";
import { Router, NavigationEnd } from "@angular/router";
import { filter } from "rxjs";
import { NavigationContextService } from "./navigation-context.service";

@Injectable({
  providedIn: "root",
})
export class KeyboardShortcutConfigService {
  constructor(
    private router: Router,
    private navigationContext: NavigationContextService
  ) {}

  initGlobalListeners(): void {
    window.addEventListener("keydown", (event: KeyboardEvent) => {
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(
        (event.target as HTMLElement).tagName
      );

      if (event.key === "Escape") {
        this.navigationContext.emitClose();
        return;
      }

      if (
        (event.altKey && event.key === "Backspace") ||
        (event.altKey && event.key === "ArrowLeft")
      ) {
        event.preventDefault();
        history.back();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        this.navigationContext.emitSave();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        this.navigationContext.emitSync();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "r") {
        event.preventDefault();
        this.navigationContext.emitRefresh();
        return;
      }

      if (event.altKey && event.shiftKey && event.key === "N") {
        event.preventDefault();
        this.navigationContext.handleNewAction();
        return;
      }

      if (!isInput) {
        if (event.key === "?" || event.key === "і") {
          event.preventDefault();
          this.navigationContext.emitHelp();
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
              this.router.navigate(["/dashboard"]);
              break;
            case "p":
            case "t":
              event.preventDefault();
              this.router.navigate(["/todos"]);
              break;
            case "c":
              event.preventDefault();
              this.router.navigate(["/categories"]);
              break;
            case "k":
              event.preventDefault();
              this.router.navigate(["/kanban"]);
              break;
            case "s":
              event.preventDefault();
              this.router.navigate(["/stats"]);
              break;
            case "y":
              event.preventDefault();
              this.router.navigate(["/sync"]);
              break;
            case "g":
              event.preventDefault();
              this.router.navigate(["/shared-tasks"]);
              break;
            case "a":
              event.preventDefault();
              this.router.navigate(["/about"]);
              break;
            case "z":
              event.preventDefault();
              this.router.navigate(["/archive"]);
              break;
            case "l":
              event.preventDefault();
              this.router.navigate(["/calendar"]);
              break;
            case "u":
              event.preventDefault();
              this.router.navigate(["/profile"]);
              break;
          }
          return;
        }
      }
    });
  }
}
