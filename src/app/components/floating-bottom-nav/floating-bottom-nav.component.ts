/* sys lib */
import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  HostListener,
  ChangeDetectionStrategy,
  inject,
  output,
} from "@angular/core";
import { NavigationEnd, Router, RouterModule } from "@angular/router";
import { filter, Subscription } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { FloatingNavItem, NavRouteConfig } from "./floating-bottom-nav.model";

/* services */
import { StorageService } from "@services/storage.service";
import { AuthService } from "@services/auth/auth.service";

@Component({
  selector: "app-floating-bottom-nav",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./floating-bottom-nav.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloatingBottomNavComponent implements OnInit, OnDestroy {
  private storageService = inject(StorageService);
  private authService = inject(AuthService);
  private router = inject(Router);

  url = signal("");
  isVisible = signal(true);
  isHidden = signal(false);
  isShowing = signal(false);
  isHiding = signal(false);
  profile = this.storageService.profile;

  visibilityChange = output<boolean>();

  private lastScrollY = 0;
  private scrollThreshold = 50;
  private routerSub?: Subscription;

  get listNavs(): Array<FloatingNavItem> {
    return [
      { url: "/dashboard", icon: "home", label: "Home", query: {} },
      {
        url: "/todos",
        icon: "list_alt",
        label: "Projects",
        query: {},
        routeType: "todos",
        childRoutes: [
          { pattern: /^\/todos$/, icon: "list_alt", label: "Projects" },
          { pattern: /^\/todos\/[^/]+\/tasks$/, icon: "checklist", label: "Tasks" },
          {
            pattern: /^\/todos\/[^/]+\/tasks\/[^/]+\/subtasks$/,
            icon: "subdirectory_arrow_right",
            label: "Subtasks",
          },
          { pattern: /^\/todos\/create_todo$/, icon: "add", label: "Create" },
          { pattern: /^\/todos\/[^/]+\/edit_todo$/, icon: "edit", label: "Edit" },
          { pattern: /^\/todos\/[^/]+\/tasks\/create_task$/, icon: "add", label: "Create" },
          { pattern: /^\/todos\/[^/]+\/tasks\/[^/]+\/edit_task$/, icon: "edit", label: "Edit" },
          {
            pattern: /^\/todos\/[^/]+\/tasks\/[^/]+\/subtasks\/create_subtask$/,
            icon: "add",
            label: "Create",
          },
          {
            pattern: /^\/todos\/[^/]+\/tasks\/[^/]+\/subtasks\/[^/]+\/edit_subtask$/,
            icon: "edit",
            label: "Edit",
          },
        ],
      },
      { url: "/calendar", icon: "calendar_month", label: "Calendar", query: {} },
      { url: "/stats", icon: "bar_chart", label: "Stats", query: {} },
      // { url: "/chat", icon: "chat", label: "Chat", query: {} },
      {
        url: "/profile",
        icon: "person",
        label: "Profile",
        query: {},
        routeType: "profile",
        childRoutes: [
          { pattern: /^\/profile$/, icon: "person", label: "Profile" },
          { pattern: /^\/profile\/manage$/, icon: "manage_accounts", label: "Manage" },
          { pattern: /^\/settings$/, icon: "settings", label: "Settings" },
          { pattern: /^\/change-password$/, icon: "lock", label: "Password" },
          { pattern: /^\/categories$/, icon: "category", label: "Categories" },
          { pattern: /^\/sync$/, icon: "sync", label: "Sync" },
          { pattern: /^\/archive$/, icon: "archive", label: "Archive" },
          { pattern: /^\/admin$/, icon: "admin_panel_settings", label: "Admin" },
          { pattern: /^\/about$/, icon: "info", label: "About" },
        ],
      },
    ];
  }

  isAdmin(): boolean {
    const role = this.authService.getValueByKey("role");
    return role === "admin";
  }

  getProfileImage(): string {
    return this.profile()?.image_url || "";
  }

  hasProfileImage(): boolean {
    const img = this.profile()?.image_url;
    return !!img && img.length > 0;
  }

  getLabel(nav: FloatingNavItem): string {
    if (nav.childRoutes) {
      const match = this.findRouteMatch(nav.childRoutes);
      return match?.label ?? nav.label;
    }
    return nav.label;
  }

  getIcon(nav: FloatingNavItem): string {
    if (nav.childRoutes) {
      const match = this.findRouteMatch(nav.childRoutes);
      return match?.icon ?? nav.icon;
    }
    return nav.icon;
  }

  private findRouteMatch(routes: NavRouteConfig[]): NavRouteConfig | undefined {
    return routes.find((r) => r.pattern.test(this.url()));
  }

  isProfileRoute(url: string): boolean {
    return url === "/profile";
  }

  isProfileImageRoute(): boolean {
    const currentUrl = this.url();
    return currentUrl === "/profile" || currentUrl === "/profile/manage";
  }

  isChildProfileRoute(): boolean {
    const currentUrl = this.url();
    return (
      /^\/profile\/manage$/.test(currentUrl) ||
      /^\/settings$/.test(currentUrl) ||
      /^\/change-password$/.test(currentUrl) ||
      /^\/categories$/.test(currentUrl) ||
      /^\/sync$/.test(currentUrl) ||
      /^\/archive$/.test(currentUrl) ||
      /^\/admin$/.test(currentUrl) ||
      /^\/about$/.test(currentUrl)
    );
  }

  isActiveRoute(nav: FloatingNavItem): boolean {
    if (this.url() === nav.url) return true;
    if (nav.childRoutes) {
      return this.findRouteMatch(nav.childRoutes) !== undefined;
    }
    return false;
  }

  @HostListener("window:scroll")
  onScroll(): void {
    const currentScrollY = window.scrollY;
    const scrollDelta = currentScrollY - this.lastScrollY;

    if (Math.abs(scrollDelta) < 10) return;

    if (scrollDelta > this.scrollThreshold && this.isVisible() && !this.isHidden()) {
      this.isHiding.set(true);
      this.isShowing.set(false);
      setTimeout(() => {
        this.isHidden.set(true);
        this.isHiding.set(false);
        this.visibilityChange.emit(false);
      }, 300);
    } else if (scrollDelta < -10 && this.isHidden()) {
      this.isShowing.set(true);
      this.isHidden.set(false);
      setTimeout(() => {
        this.isShowing.set(false);
        this.visibilityChange.emit(true);
      }, 400);
    }

    this.lastScrollY = currentScrollY;
  }

  get isNavVisible(): boolean {
    return this.isVisible();
  }

  ngOnInit(): void {
    this.visibilityChange.emit(true);

    this.routerSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((_val) => {
        let lastIndex =
          this.router.url.lastIndexOf("?") > -1
            ? this.router.url.lastIndexOf("?")
            : this.router.url.length;
        this.url.set(this.router.url.slice(0, lastIndex));
      });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }
}
