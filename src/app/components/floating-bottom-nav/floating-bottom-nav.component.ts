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
} from "@angular/core";
import { NavigationEnd, Router, RouterModule } from "@angular/router";
import { filter, Subscription } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { FloatingNavItem } from "./floating-bottom-nav.model";

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

  private lastScrollY = 0;
  private scrollThreshold = 50;
  private routerSub?: Subscription;

  get listNavs(): Array<FloatingNavItem> {
    return [
      { url: "/dashboard", icon: "home", label: "Home", query: {} },
      { url: "/todos", icon: "list_alt", label: "Projects", query: {} },
      { url: "/calendar", icon: "calendar_month", label: "Calendar", query: {} },
      { url: "/stats", icon: "bar_chart", label: "Stats", query: {} },
      { url: "/chat", icon: "chat", label: "Chat", query: {} },
      { url: "/profile", icon: "person", label: "Profile", query: {} },
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

  isProfileRoute(url: string): boolean {
    return url === "/profile";
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
      }, 300);
    } else if (scrollDelta < -10 && this.isHidden()) {
      this.isShowing.set(true);
      this.isHidden.set(false);
      setTimeout(() => {
        this.isShowing.set(false);
      }, 400);
    }

    this.lastScrollY = currentScrollY;
  }

  ngOnInit(): void {
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
