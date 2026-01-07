/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component, EventEmitter, OnDestroy, OnInit, Output } from "@angular/core";
import { Subscription } from "rxjs";
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterModule,
} from "@angular/router";
import { distinctUntilChanged, filter, map } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { Profile } from "@models/profile.model";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";

/* services */
import { AuthService } from "@services/auth.service";
import { MainService } from "@services/main.service";
import { NotifyService } from "@services/notify.service";
import { SyncService } from "@services/sync.service";

interface Breadcrumb {
  label: string;
  url: string;
}

@Component({
  selector: "app-header",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./header.component.html",
})
export class HeaderComponent implements OnInit, OnDestroy {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private authService: AuthService,
    private mainService: MainService,
    private notifyService: NotifyService,
    private syncService: SyncService
  ) {}

  @Output() isShowNavEvent: EventEmitter<boolean> = new EventEmitter();

  themeVal: string = "";
  title: string = "";
  subtitle: string = "";
  iconUrl: string = "";
  userId: string = "";
  role: string = "";

  profile: Profile | null = null;
  todo: Todo | null = null;
  task: Task | null = null;

  isBack: boolean = false;
  showUserMenu: boolean = false;
  isSyncing: boolean = false;

  breadcrumbs: Breadcrumb[] = [];
  private syncSubscription: Subscription | null = null;

  ngOnInit(): void {
    this.themeVal = localStorage.getItem("theme") ?? "";
    this.userId = this.authService.getValueByKey("id");
    this.role = this.authService.getValueByKey("role");

    this.syncSubscription = this.syncService.isSyncing$.subscribe(
      (isSyncing) => (this.isSyncing = isSyncing)
    );

    this.getProfile();

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        distinctUntilChanged(),
        map(async () => await this.createBreadcrumbs(this.route.root))
      )
      .subscribe(async (breadcrumbs) => {
        this.breadcrumbs = await breadcrumbs;
        this.isBack = this.breadcrumbs.length > 1;
        this.title =
          this.breadcrumbs.length > 0
            ? this.breadcrumbs[this.breadcrumbs.length - 1].label
            : "Home";
      });
  }

  ngOnDestroy(): void {
    this.syncSubscription?.unsubscribe();
  }

  getProfile() {
    this.mainService
      .getByField<Profile>("profile", "userId", this.userId)
      .then((response: Response<Profile>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          this.profile = response.data;
        }
      })
      .catch((err: Response<string>) => {
        if (err.status === ResponseStatus.ERROR) {
          this.notifyService.showError(err.message ?? err.toString());
        }
      });
  }

  async createBreadcrumbs(
    route: ActivatedRoute,
    url: string = "",
    breadcrumbs: Breadcrumb[] = []
  ): Promise<Breadcrumb[]> {
    const children: ActivatedRoute[] = route.children;

    if (children.length === 0) {
      return breadcrumbs;
    }

    for (const child of children) {
      if (child.snapshot.data["breadcrumb"]) {
        const routeURL: string = child.snapshot.url.map((segment) => segment.path).join("/");
        if (routeURL == "") {
          return this.createBreadcrumbs(child, url, breadcrumbs);
        }

        const newUrl = url + "/" + routeURL;

        let label: string = "";
        const breadcrumbData = child.snapshot.data["breadcrumb"];
        if (typeof breadcrumbData === "function") {
          const data = await breadcrumbData(child.snapshot as ActivatedRouteSnapshot);
          if (data.task) {
            const task = data.task as Task;
            if (task) {
              this.task = task;
              label = task.title;
            }
          } else if (data.todo) {
            const todo = data.todo as Todo;
            if (todo) {
              this.todo = todo;
              label = todo.title;
            }
          } else {
            label = breadcrumbData;
          }
        } else {
          label = breadcrumbData;
        }

        breadcrumbs.push({
          label: label,
          url: newUrl,
        });

        return this.createBreadcrumbs(child, newUrl, breadcrumbs);
      }
    }

    return breadcrumbs;
  }

  goBack() {
    this.location.back();
  }

  showNav() {
    this.isShowNavEvent.next(true);
  }

  setTheme(theme: string) {
    document.querySelector("html")!.setAttribute("class", theme);
    localStorage.setItem("theme", theme);
    this.themeVal = theme;
  }

  toggleTheme() {
    const newTheme = this.themeVal === "dark" ? "" : "dark";
    this.setTheme(newTheme);
  }

  toggleUserMenu() {
    this.showUserMenu = !this.showUserMenu;
  }

  closeUserMenu() {
    this.showUserMenu = false;
  }

  async syncAll() {
    if (this.isSyncing) return;

    this.notifyService.showInfo("Starting synchronization...");

    try {
      const response = await this.syncService.syncAll();
      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Synchronization completed successfully!");
      } else {
        this.notifyService.showError(response.message || "Synchronization failed");
      }
    } catch (error) {
      this.notifyService.showError("Synchronization failed: " + error);
    }
  }

  logout() {
    this.closeUserMenu();
    this.authService.logout();
  }
}
